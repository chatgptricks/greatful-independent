"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { EMPTY_LIBRARY, parseLibrary, type EditorLibrary } from "./model";

export type LibrarySaveStatus =
  | "loading"
  | "saving"
  | "saved"
  | "local"
  | "error"
  | "conflict";
type Storage = "cloud" | "local";
interface RecoveryDraft {
  key: string;
  scope: string;
  library: EditorLibrary;
  revision: string | null;
  stamp: string;
  updatedAt: number;
}
interface RemoteLibrary {
  library: EditorLibrary;
  revision: string | null;
  storage: Storage;
  scope: string;
}

const ENDPOINT = "/api/template-editor";
let database: Promise<IDBDatabase> | null = null;

function openRecoveryDatabase(): Promise<IDBDatabase> {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB)
      return reject(new Error("Browser recovery storage is unavailable."));
    const request = indexedDB.open("greatful-template-editor", 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore("drafts", {
        keyPath: "key",
      });
      store.createIndex("scope", "scope");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ?? new Error("Browser recovery storage could not open."),
      );
    request.onblocked = () =>
      reject(new Error("Browser recovery storage is blocked by another tab."));
  });
  database.catch(() => {
    database = null;
  });
  return database;
}

async function recoveryTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openRecoveryDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("drafts", mode);
    const request = operation(transaction.objectStore("drafts"));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () =>
      reject(
        transaction.error ??
          request.error ??
          new Error("Browser recovery failed."),
      );
    transaction.onabort = () =>
      reject(
        transaction.error ?? new Error("Browser recovery was interrupted."),
      );
  });
}

async function getRecoveryDrafts(scope: string): Promise<RecoveryDraft[]> {
  const values = await recoveryTransaction("readonly", (store) =>
    store.index("scope").getAll(scope),
  );
  return (values as RecoveryDraft[])
    .flatMap((draft) => {
      const library = parseLibrary(draft.library);
      return draft.scope === scope &&
        library &&
        typeof draft.key === "string" &&
        typeof draft.stamp === "string" &&
        Number.isFinite(draft.updatedAt) &&
        (draft.revision === null || typeof draft.revision === "string")
        ? [{ ...draft, library }]
        : [];
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// A recovered draft may belong to another tab. Delete it only if its exact
// snapshot has been saved, never if that tab has added more work since then.
async function removeExactDraft(
  draft: Pick<RecoveryDraft, "key" | "stamp">,
): Promise<void> {
  const db = await openRecoveryDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("drafts", "readwrite");
    const store = transaction.objectStore("drafts");
    const request = store.get(draft.key);
    request.onsuccess = () => {
      if ((request.result as RecoveryDraft | undefined)?.stamp === draft.stamp)
        store.delete(draft.key);
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function responseError(value: unknown, fallback: string): string {
  return value &&
    typeof value === "object" &&
    "error" in value &&
    typeof value.error === "string"
    ? value.error
    : fallback;
}

function remoteLibrary(value: unknown): RemoteLibrary | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const library = parseLibrary(record.library);
  if (
    !library ||
    !(record.revision === null || typeof record.revision === "string") ||
    (record.storage !== "cloud" && record.storage !== "local") ||
    typeof record.scope !== "string"
  )
    return null;
  return {
    library,
    revision: record.revision,
    storage: record.storage,
    scope: record.scope,
  };
}

function browserTabId(): string {
  // A duplicated browser tab inherits sessionStorage. A fresh instance ID
  // keeps its recovery writes separate; reload discovers pending scope drafts.
  return crypto.randomUUID();
}

export function useEditorLibrary() {
  const [library, updateLibrary] = useState<EditorLibrary>(EMPTY_LIBRARY);
  const [ready, setReady] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [status, setStatus] = useState<LibrarySaveStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const current = useRef(library);
  const revision = useRef<string | null>(null);
  const storage = useRef<Storage>("cloud");
  const scope = useRef("");
  const tabId = useRef("");
  const stamp = useRef("");
  const backedUpStamp = useRef("");
  const recovered = useRef<RecoveryDraft | null>(null);
  const dirty = useRef(false);
  const loaded = useRef(false);
  const conflict = useRef(false);
  const mounted = useRef(false);
  const backupFailure = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const backupQueue = useRef<Promise<unknown>>(Promise.resolve());
  const loadController = useRef<AbortController | null>(null);
  const saveRef = useRef<() => Promise<void>>(async () => undefined);

  const persistRecovery = useCallback((): Promise<boolean> => {
    if (!scope.current || !dirty.current) return Promise.resolve(true);
    const draft: RecoveryDraft = {
      key: `${scope.current}:${tabId.current}`,
      scope: scope.current,
      library: current.current,
      revision: revision.current,
      stamp: stamp.current,
      updatedAt: Date.now(),
    };
    const operation = backupQueue.current
      .then(async () => {
        // Rapid typing can enqueue several snapshots while IndexedDB is busy.
        // Only the newest queued edit needs a write, especially with big images.
        if (draft.stamp !== stamp.current) return true;
        await recoveryTransaction("readwrite", (store) => store.put(draft));
        backedUpStamp.current = draft.stamp;
        backupFailure.current = false;
        return true;
      })
      .catch(() => {
        backupFailure.current = true;
        if (mounted.current && dirty.current) {
          setStatus("error");
          setError(
            "Browser recovery storage is full or unavailable. Keep this tab open until the server saves, or export a JSON backup.",
          );
        }
        return false;
      });
    backupQueue.current = operation;
    return operation;
  }, []);

  const clearSavedRecovery = useCallback(async (savedStamp: string) => {
    const own = { key: `${scope.current}:${tabId.current}`, stamp: savedStamp };
    const adopted = recovered.current;
    const operation = backupQueue.current
      .then(async () => {
        await removeExactDraft(own);
        if (adopted) await removeExactDraft(adopted);
        if (recovered.current === adopted) recovered.current = null;
      })
      .catch(() => undefined); // A stale recovery copy is safe; the server is already durable.
    backupQueue.current = operation;
    await operation;
  }, []);

  const save = useCallback(async () => {
    if (!loaded.current || !dirty.current || conflict.current) return;
    if (inFlight.current) return inFlight.current;
    const sentLibrary = current.current;
    const sentStamp = stamp.current;
    const expectedRevision = revision.current;
    const operation = (async () => {
      if (mounted.current) {
        setStatus("saving");
        setError(null);
      }
      await persistRecovery();
      try {
        const result = await fetch(ENDPOINT, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            library: sentLibrary,
            revision: expectedRevision,
          }),
        });
        const data = (await result.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;
        if (!result.ok) {
          if (result.status === 409) conflict.current = true;
          throw new Error(
            responseError(data, "The server could not save this library."),
          );
        }
        if (
          !data ||
          typeof data.revision !== "string" ||
          (data.storage !== "cloud" && data.storage !== "local")
        ) {
          throw new Error(
            "The server did not confirm the save. Retry before closing this tab.",
          );
        }
        revision.current = data.revision;
        storage.current = data.storage;
        dirty.current = stamp.current !== sentStamp;
        if (dirty.current) await persistRecovery();
        else await clearSavedRecovery(sentStamp);
        if (mounted.current) {
          setStatus(
            dirty.current
              ? "saving"
              : storage.current === "cloud"
                ? "saved"
                : "local",
          );
          setError(null);
        }
      } catch (cause) {
        if (mounted.current) {
          setStatus(conflict.current ? "conflict" : "error");
          const message =
            cause instanceof Error ? cause.message : "Save failed.";
          const recoveryMessage = backupFailure.current
            ? " Browser recovery also failed. Keep this tab open and export a JSON backup."
            : " Your edits are stored in this browser.";
          setError(message + recoveryMessage);
        }
      }
    })();
    inFlight.current = operation;
    await operation;
    inFlight.current = null;
    // Only continue automatically after a confirmed save. Network failures and
    // conflicts require Retry; they never create an unbounded request loop.
    if (
      dirty.current &&
      !conflict.current &&
      revision.current !== expectedRevision &&
      mounted.current
    ) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void saveRef.current();
      }, 600);
    }
  }, [clearSavedRecovery, persistRecovery]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const load = useCallback(async (discardPending = false) => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    if (timer.current) clearTimeout(timer.current);
    loaded.current = false;
    if (mounted.current) {
      setCanEdit(false);
      setStatus("loading");
      setError(null);
    }
    const discardedOwn = {
      key: `${scope.current}:${tabId.current}`,
      stamp: stamp.current,
    };
    const discardedRecovered = recovered.current;
    // A deliberate reload must observe any save already in progress.
    if (inFlight.current) await inFlight.current;
    try {
      const result = await fetch(ENDPOINT, {
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await result.json();
      if (!result.ok)
        throw new Error(
          responseError(body, "Your library could not be loaded."),
        );
      const remote = remoteLibrary(body);
      if (!remote)
        throw new Error(
          "The server returned an unreadable library. Your saved work has not been changed.",
        );
      if (controller.signal.aborted) return;
      scope.current = remote.scope;
      revision.current = remote.revision;
      storage.current = remote.storage;
      tabId.current ||= browserTabId();
      let draft: RecoveryDraft | undefined;
      try {
        if (discardPending) {
          await backupQueue.current;
          await removeExactDraft(discardedOwn);
          if (discardedRecovered) await removeExactDraft(discardedRecovered);
        } else {
          const drafts = await getRecoveryDrafts(remote.scope);
          draft =
            drafts.find(
              (item) => item.key === `${remote.scope}:${tabId.current}`,
            ) ?? drafts[0];
        }
        backupFailure.current = false;
      } catch {
        backupFailure.current = true;
      }
      if (controller.signal.aborted) return;
      // A save can reach the server just before the browser closes. If so,
      // matching content proves the pending recovery copy has already landed.
      if (
        draft &&
        JSON.stringify(draft.library) === JSON.stringify(remote.library)
      ) {
        await removeExactDraft(draft).catch(() => undefined);
        draft = undefined;
      }
      recovered.current = draft ?? null;
      current.current = draft?.library ?? remote.library;
      dirty.current = Boolean(draft);
      stamp.current = draft?.stamp ?? crypto.randomUUID();
      backedUpStamp.current = draft?.stamp ?? "";
      conflict.current = Boolean(draft && draft.revision !== remote.revision);
      if (draft) revision.current = draft.revision;
      loaded.current = true;
      if (mounted.current) {
        updateLibrary(current.current);
        setCanEdit(true);
        setReady(true);
        setStatus(
          conflict.current
            ? "conflict"
            : draft
              ? "saving"
              : remote.storage === "cloud"
                ? "saved"
                : "local",
        );
        setError(
          conflict.current
            ? "Recovered browser edits differ from the server. Export a JSON backup to keep them, then choose Reload server, or continue editing this recovered copy."
            : backupFailure.current
              ? "Browser recovery is unavailable. Server saving is available; keep this tab open until edits finish saving."
              : null,
        );
      }
      if (draft && !conflict.current)
        timer.current = setTimeout(() => {
          void saveRef.current();
        }, 600);
    } catch (cause) {
      if (controller.signal.aborted || !mounted.current) return;
      setReady(true);
      setCanEdit(false);
      setStatus("error");
      setError(
        cause instanceof Error
          ? cause.message
          : "Your library could not be loaded. Retry before editing.",
      );
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      loadController.current?.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  const setLibrary = useCallback(
    (next: SetStateAction<EditorLibrary>) => {
      if (!loaded.current) return;
      const value = typeof next === "function" ? next(current.current) : next;
      if (value === current.current) return;
      current.current = value;
      stamp.current = crypto.randomUUID();
      dirty.current = true;
      updateLibrary(value);
      if (!conflict.current) {
        setStatus("saving");
        setError(null);
      }
      void persistRecovery();
      if (timer.current) clearTimeout(timer.current);
      if (!conflict.current)
        timer.current = setTimeout(() => {
          void saveRef.current();
        }, 600);
    },
    [persistRecovery],
  );

  const retrySave = useCallback(() => {
    if (!loaded.current) {
      void load();
      return;
    }
    if (conflict.current) return;
    if (timer.current) clearTimeout(timer.current);
    void saveRef.current();
  }, [load]);

  const reloadServer = useCallback(() => load(true), [load]);

  useEffect(() => {
    const flush = () => {
      if (!loaded.current || !dirty.current) return;
      void persistRecovery();
      if (conflict.current || inFlight.current) return;
      const body = JSON.stringify({
        library: current.current,
        revision: revision.current,
      });
      // Fetch keepalive has a shared 64 KiB limit. Large image libraries rely
      // on their already-persisted IndexedDB draft and resume on the next load.
      if (new Blob([body]).size < 60_000) {
        void fetch(ENDPOINT, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => undefined);
      }
    };
    const warnIfUnprotected = (event: BeforeUnloadEvent) => {
      if (dirty.current && backedUpStamp.current !== stamp.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const resume = (event: PageTransitionEvent) => {
      // A keepalive save can succeed while this page is in the back/forward
      // cache. Refresh its revision before accepting the next edit.
      if (event.persisted) void load();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("pageshow", resume);
    window.addEventListener("beforeunload", warnIfUnprotected);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("beforeunload", warnIfUnprotected);
    };
  }, [load, persistRecovery]);

  return {
    library,
    ready,
    canEdit,
    status,
    error,
    setLibrary,
    retrySave,
    reloadServer,
  };
}
