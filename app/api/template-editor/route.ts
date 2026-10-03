import { resolveGFAccess } from "@/lib/grateful-future/member";
import { parseLibrary } from "@/lib/template-editor/model";
import {
  getEditorLibrary,
  LibraryConflictError,
  saveEditorLibrary,
} from "@/lib/template-editor/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: PRIVATE_HEADERS });
}

function httpOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password
    ) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function allowedSaveOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  // Origin headers contain one serialized origin, never a URL path or an
  // opaque "null" origin. Configured site URLs may include a trailing slash.
  if (httpOrigin(origin) !== origin) return false;
  // Next can construct request.url from an internal hostname/port behind
  // Render's proxy. Trust only explicit deployment URLs, not forwarded headers.
  return [
    request.url,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.RENDER_EXTERNAL_URL,
  ].some((value) => httpOrigin(value) === origin);
}

export async function GET() {
  const access = await resolveGFAccess();
  if (!access)
    return response({ error: "Sign in to open your template library." }, 401);
  try {
    return response(await getEditorLibrary(access.ownerKey));
  } catch (error) {
    console.error("Template library read failed", error);
    return response(
      {
        error:
          "Your library could not be loaded. Retry before editing; your saved work has not been changed.",
      },
      503,
    );
  }
}

async function readBoundedBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES)
    throw new RangeError("Library exceeds the 12 MB save limit.");
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("A library is required.");
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError(
          "Library exceeds the 12 MB save limit. Remove large embedded images or export a backup.",
        );
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally {
    reader.releaseLock();
  }
}

export async function PUT(request: Request) {
  const access = await resolveGFAccess();
  if (!access)
    return response({ error: "Sign in again to save your library." }, 401);
  if (!allowedSaveOrigin(request)) {
    return response({ error: "This save must come from the editor." }, 403);
  }
  let body: Record<string, unknown>;
  try {
    const parsed = await readBoundedBody(request);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new SyntaxError("Invalid save request.");
    body = parsed as Record<string, unknown>;
  } catch (error) {
    return response(
      {
        error:
          error instanceof RangeError
            ? error.message
            : "Invalid library payload.",
      },
      error instanceof RangeError ? 413 : 400,
    );
  }
  const library = parseLibrary(body.library);
  const revision = body.revision;
  if (
    !library ||
    !(
      revision === null ||
      (typeof revision === "string" && /^[a-f0-9-]{36}$/i.test(revision))
    )
  ) {
    return response({ error: "Invalid library or save revision." }, 400);
  }
  try {
    const saved = await saveEditorLibrary(access.ownerKey, library, revision);
    // Avoid echoing every image on each keystroke autosave.
    return response({
      revision: saved.revision,
      storage: saved.storage,
      scope: saved.scope,
    });
  } catch (error) {
    if (error instanceof LibraryConflictError)
      return response({ error: error.message }, 409);
    console.error("Template library save failed", error);
    return response(
      {
        error:
          "Your library could not be saved to the server. Keep this tab open and retry.",
      },
      503,
    );
  }
}
