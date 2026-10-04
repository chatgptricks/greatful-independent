/* Run: node --test tests/template-editor-budget.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const filename = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../lib/template-editor/library-budget.ts");
const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: filename,
}).outputText;
const unit = { exports: {} };
vm.runInThisContext(`(function(module,exports){${source}\n})`, { filename })(unit, unit.exports);
const { checkLibrarySaveBudget, MAX_SAVE_LIBRARY_BYTES } = unit.exports;

test("the exact accepted UTF-8 boundary still fits the API request envelope", () => {
  const empty = { value: "" };
  const overhead = new TextEncoder().encode(JSON.stringify(empty)).byteLength;
  const library = { value: "x".repeat(MAX_SAVE_LIBRARY_BYTES - overhead) };
  assert.deepEqual(checkLibrarySaveBudget(library), { ok: true, bytes: MAX_SAVE_LIBRARY_BYTES });
  const body = JSON.stringify({ library, revision: "00000000-0000-0000-0000-000000000000" });
  assert.ok(new TextEncoder().encode(body).byteLength < 12 * 1024 * 1024);
  library.value += "x";
  const blocked = checkLibrarySaveBudget(library);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.bytes, MAX_SAVE_LIBRARY_BYTES + 1);
  assert.match(blocked.error, /was not applied/);
});

test("multibyte brand names and artwork text are counted as wire bytes, not JS characters", () => {
  const library = { value: "😀".repeat(Math.ceil(MAX_SAVE_LIBRARY_BYTES / 4)) };
  assert.ok(JSON.stringify(library).length < MAX_SAVE_LIBRARY_BYTES);
  assert.equal(checkLibrarySaveBudget(library).ok, false);
  const small = { brand: "日本語 · café · 🌿" };
  const budget = checkLibrarySaveBudget(small);
  assert.equal(budget.ok, true);
  assert.equal(budget.bytes, new Blob([JSON.stringify(small)]).size);
});

test("repeated assets and copied pages consume their full serialized save size", () => {
  const image = "data:image/webp;base64," + "A".repeat(1_700_000);
  const allowed = { assets: [image], pages: Array(5).fill(image) };
  assert.equal(checkLibrarySaveBudget(allowed).ok, true);
  const duplicated = { ...allowed, pages: [...allowed.pages, image, image] };
  assert.equal(checkLibrarySaveBudget(duplicated).ok, false);
  assert.equal(allowed.pages.length, 5);
});

test("unserializable changes return a rejection without throwing or changing input", () => {
  const circular = { name: "Original" };
  circular.self = circular;
  for (const input of [circular, undefined, { unsupported: 1n }]) {
    assert.deepEqual(checkLibrarySaveBudget(input), {
      ok: false,
      bytes: null,
      error: "This change could not be saved and was not applied. Try again or export a backup before reloading.",
    });
  }
  assert.equal(circular.name, "Original");
  assert.equal(circular.self, circular);
});
