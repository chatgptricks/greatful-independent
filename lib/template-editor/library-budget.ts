// The API accepts a 12 MiB request, including the library/revision envelope.
// Reserve more than its fixed overhead so every accepted library fits a save.
export const MAX_SAVE_LIBRARY_BYTES = 12 * 1024 * 1024 - 1024;

export type LibraryBudgetResult =
  | { ok: true; bytes: number }
  | { ok: false; bytes: number | null; error: string };

/** Measure JSON as UTF-8 bytes, not JavaScript UTF-16 characters. */
export function checkLibrarySaveBudget(library: unknown): LibraryBudgetResult {
  try {
    const json = JSON.stringify(library);
    if (json === undefined) throw new Error("Missing library");
    const bytes = new TextEncoder().encode(json).byteLength;
    if (bytes > MAX_SAVE_LIBRARY_BYTES) {
      return {
        ok: false,
        bytes,
        error: "This change exceeds the 12 MB library limit and was not applied. Remove unused assets or designs, or use smaller images.",
      };
    }
    return { ok: true, bytes };
  } catch {
    return {
      ok: false,
      bytes: null,
      error: "This change could not be saved and was not applied. Try again or export a backup before reloading.",
    };
  }
}
