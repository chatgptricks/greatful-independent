/* Run: node --test tests/template-editor-brand-upload.test.mjs
 * Exercise the real upload processor; mock only browser decoding/canvas APIs. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const filename = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../components/template-editor/brand-workspace.tsx");
const requireModule = createRequire(import.meta.url);
const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  fileName: filename,
}).outputText;
const unit = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(name => name.startsWith("react") ? requireModule(name) : {}, unit, unit.exports);
const { prepareBrandAsset } = unit.exports;

function browser(t, options = {}) {
  const previousBitmap = globalThis.createImageBitmap;
  const previousDocument = globalThis.document;
  const calls = { decode: 0, close: 0, draw: [], encode: [] };
  const bitmap = { width: options.width ?? 2400, height: options.height ?? 1200, close() { calls.close++; } };
  const context = { drawImage(...args) { calls.draw.push(args); if (options.drawError) throw new Error("Decode failed while drawing"); } };
  const canvas = {
    width: 0, height: 0,
    getContext(kind) { assert.equal(kind, "2d"); return options.noContext ? null : context; },
    toDataURL(...args) { calls.encode.push(args); return options.src ?? "data:image/webp;base64,UklGRgAAAABXRUJQ"; },
  };
  globalThis.createImageBitmap = async () => {
    calls.decode++;
    if (options.decodeError) throw new Error("Unsupported image contents");
    return bitmap;
  };
  globalThis.document = { createElement(tag) { assert.equal(tag, "canvas"); return canvas; } };
  t.after(() => {
    if (previousBitmap === undefined) delete globalThis.createImageBitmap;
    else globalThis.createImageBitmap = previousBitmap;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  return { calls, bitmap, canvas };
}
const file = (overrides = {}) => ({ type: "image/png", size: 200_000, name: "Brand logo.png", ...overrides });

test("large uploads fit 1800px without changing aspect ratio and release decoded memory", async t => {
  const { calls, bitmap, canvas } = browser(t);
  const asset = await prepareBrandAsset(file(), "logo");
  assert.equal(asset.kind, "logo");
  assert.equal(asset.name, "Brand logo.png");
  assert.equal(asset.width, 1800);
  assert.equal(asset.height, 900);
  assert.equal(canvas.width / canvas.height, bitmap.width / bitmap.height);
  assert.deepEqual(calls.draw, [[bitmap, 0, 0, 1800, 900]]);
  assert.deepEqual(calls.encode, [["image/webp", .88]]);
  assert.equal(calls.close, 1);
  assert.match(asset.id, /^[a-f\d-]{36}$/i);
});

test("small transparent sources are not upscaled and each reusable asset has a fresh ID", async t => {
  const { calls } = browser(t, { width: 200, height: 100 });
  const first = await prepareBrandAsset(file(), "logo");
  const second = await prepareBrandAsset(file({ name: "x".repeat(250) }), "image");
  assert.equal(first.width, 200);
  assert.equal(first.height, 100);
  assert.notEqual(first.id, second.id);
  assert.equal(second.name.length, 200);
  assert.equal(second.kind, "image");
  assert.equal(calls.close, 2);
});

test("unsupported formats and files beyond the raw-size limit never reach the decoder", async t => {
  const { calls } = browser(t);
  for (const type of ["image/svg+xml", "image/gif", "text/html", ""]) {
    await assert.rejects(prepareBrandAsset(file({ type }), "logo"), /JPG, PNG, or WebP/);
  }
  await assert.rejects(prepareBrandAsset(file({ size: 15 * 1024 * 1024 + 1 }), "image"), /15 MB/);
  assert.equal(calls.decode, 0);
});

test("encoded-size failures release image memory instead of producing an unsaveable asset", async t => {
  const { calls } = browser(t, { src: "x".repeat(2_000_001) });
  await assert.rejects(prepareBrandAsset(file(), "image"), /too large after processing/);
  assert.equal(calls.close, 1);
});

test("canvas setup and drawing failures close the decoded bitmap", async t => {
  await t.test("canvas unavailable", async child => {
    const { calls } = browser(child, { noContext: true });
    await assert.rejects(prepareBrandAsset(file(), "logo"), /unavailable/);
    assert.equal(calls.close, 1);
  });
  await t.test("drawing failure", async child => {
    const { calls } = browser(child, { drawError: true });
    await assert.rejects(prepareBrandAsset(file(), "logo"), /Decode failed/);
    assert.equal(calls.close, 1);
  });
});
