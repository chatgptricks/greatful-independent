import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { EMPTY_LIBRARY, parseLibrary, type EditorLibrary } from "./model";

// Server-only: this module uses the privileged database client. The API route
// resolves the authenticated owner; no owner supplied by a browser is accepted.
export interface StoredLibrary {
  library: EditorLibrary;
  revision: string | null;
  storage: "cloud" | "local";
  scope: string;
}

interface LibraryEnvelope {
  library: EditorLibrary;
  revision: string;
}

export class LibraryConflictError extends Error {
  constructor() {
    super(
      "This library changed in another tab or device. Your edits have been kept in this browser.",
    );
    this.name = "LibraryConflictError";
  }
}

function storageKey(owner: string): string {
  return `template-editor:${owner}`;
}

function scopeFor(owner: string): string {
  return createHash("sha256").update(storageKey(owner)).digest("hex");
}

function readEnvelope(value: unknown): LibraryEnvelope {
  if (!value || typeof value !== "object")
    throw new Error("The saved library could not be read.");
  const candidate = value as Record<string, unknown>;
  const library = parseLibrary(candidate.library);
  if (
    !library ||
    typeof candidate.revision !== "string" ||
    !candidate.revision
  ) {
    throw new Error(
      "The saved library could not be read. It has not been overwritten.",
    );
  }
  return { library, revision: candidate.revision };
}

const FILE_DIRECTORY = path.join(process.cwd(), ".gf-dev", "template-editor");
let fileLock: Promise<unknown> = Promise.resolve();

function withFileLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = fileLock.then(fn, fn);
  fileLock = run.catch(() => undefined);
  return run;
}

function assertDevelopmentStorage(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Cloud storage is not configured. No changes were saved.");
  }
}

async function readFile(scope: string): Promise<LibraryEnvelope | null> {
  try {
    return readEnvelope(
      JSON.parse(
        await fs.readFile(path.join(FILE_DIRECTORY, `${scope}.json`), "utf8"),
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function getEditorLibrary(owner: string): Promise<StoredLibrary> {
  const scope = scopeFor(owner);
  const db = getAdminSupabase();
  if (!db) {
    assertDevelopmentStorage();
    const record = await readFile(scope);
    return {
      library: record?.library ?? EMPTY_LIBRARY,
      revision: record?.revision ?? null,
      storage: "local",
      scope,
    };
  }
  const { data, error } = await db
    .from("gf_client_state")
    .select("data")
    .eq("owner", storageKey(owner))
    .maybeSingle();
  if (error)
    throw new Error(
      "Cloud storage is unavailable. Your saved library has not been changed.",
    );
  const record = data ? readEnvelope(data.data) : null;
  return {
    library: record?.library ?? EMPTY_LIBRARY,
    revision: record?.revision ?? null,
    storage: "cloud",
    scope,
  };
}

export async function saveEditorLibrary(
  owner: string,
  library: EditorLibrary,
  expectedRevision: string | null,
): Promise<StoredLibrary> {
  const scope = scopeFor(owner);
  const envelope: LibraryEnvelope = { library, revision: randomUUID() };
  const db = getAdminSupabase();
  if (!db) {
    assertDevelopmentStorage();
    await withFileLock(async () => {
      const current = await readFile(scope);
      if ((current?.revision ?? null) !== expectedRevision)
        throw new LibraryConflictError();
      await fs.mkdir(FILE_DIRECTORY, { recursive: true });
      const temporary = path.join(
        FILE_DIRECTORY,
        `${scope}.${randomUUID()}.tmp`,
      );
      try {
        await fs.writeFile(temporary, JSON.stringify(envelope), {
          encoding: "utf8",
          mode: 0o600,
        });
        await fs.rename(temporary, path.join(FILE_DIRECTORY, `${scope}.json`));
      } finally {
        await fs.unlink(temporary).catch(() => undefined);
      }
    });
    return { ...envelope, storage: "local", scope };
  }

  // The comparison happens in PostgreSQL, not in a read-then-upsert sequence.
  // Concurrent writes from separate server instances cannot clobber each other.
  const row = {
    owner: storageKey(owner),
    data: envelope,
    updated_at: new Date().toISOString(),
  };
  if (expectedRevision === null) {
    const { error } = await db.from("gf_client_state").insert(row);
    if (error?.code === "23505") throw new LibraryConflictError();
    if (error) throw new Error("Cloud save failed. Please retry.");
  } else {
    const { data, error } = await db
      .from("gf_client_state")
      .update({ data: envelope, updated_at: row.updated_at })
      .eq("owner", row.owner)
      .eq("data->>revision", expectedRevision)
      .select("owner")
      .maybeSingle();
    if (error) throw new Error("Cloud save failed. Please retry.");
    if (!data) throw new LibraryConflictError();
  }
  return { ...envelope, storage: "cloud", scope };
}
