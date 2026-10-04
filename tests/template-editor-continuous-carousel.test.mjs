/* Run: node --test tests/template-editor-continuous-carousel.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireModule = createRequire(import.meta.url);
function loadModule(relative, dependencies = {}) {
  const filename = path.join(root, relative);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const unit = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(
    name => Object.hasOwn(dependencies, name) ? dependencies[name] : requireModule(name), unit, unit.exports,
  );
  return unit.exports;
}
const model = loadModule("lib/template-editor/model.ts");
const geometry = loadModule("lib/template-editor/canvas-geometry.ts");
const { enableContinuousCarousel, splitContinuousCarousel, sliceSceneForPage, CONTINUOUS_PAGE_WIDTH } = loadModule(
  "lib/template-editor/continuous-carousel.ts", { "./model": model, "./canvas-geometry": geometry },
);
const { createBlankDesign, createCanvasElement, duplicatePage, parseLibrary, EMPTY_LIBRARY } = model;
function element(id, patch = {}) {
  return { ...createCanvasElement("shape"), id, name: id, x: 20, y: 20, width: 40, height: 40, ...patch };
}
function design(scenes = [{ background: "#fff", elements: [] }, { background: "#fff", elements: [] }]) {
  const doc = createBlankDesign("Carousel", "square");
  doc.pages = scenes.map((scene, index) => ({ ...(index === 0 ? doc.pages[0] : duplicatePage(doc.pages[0])), canvas: scene }));
  return doc;
}
function freeze(value) {
  Object.values(value).forEach(child => { if (child && typeof child === "object") freeze(child); });
  return Object.freeze(value);
}
const persisted = doc => parseLibrary({ ...structuredClone(EMPTY_LIBRARY), designs: [doc] });
const names = page => page.canvas.elements.map(item => item.name);

test("one slide becomes two while preserving document metadata and source artwork", () => {
  assert.equal(CONTINUOUS_PAGE_WIDTH, 360);
  const source = freeze(design([{ background: "#123456", elements: [element("original", { hidden: true })] }]));
  const converted = enableContinuousCarousel(source);
  assert.equal(converted.id, source.id);
  assert.equal(converted.name, source.name);
  assert.equal(converted.pages.length, 2);
  assert.equal(converted.pages[0].id, source.pages[0].id);
  assert.notEqual(converted.pages[1].id, source.pages[0].id);
  assert.deepEqual(converted.continuousCanvas.elements, source.pages[0].canvas.elements);
  assert.notEqual(converted.continuousCanvas.elements[0], source.pages[0].canvas.elements[0]);
  assert.ok(converted.pages.every(page => page.canvas.elements.length === 0));
  assert.equal(source.pages[0].canvas.elements.length, 1);
  assert.ok(persisted(converted));
});

test("flattening shifts page artwork without changing its properties or stacking order", () => {
  const source = freeze(design([
    { background: "#fff", elements: [element("a", { locked: true }), element("b", { rotation: 23 })] },
    { background: "#fff", elements: [element("c", { x: -30, hidden: true })] },
    { background: "#fff", elements: [element("d", { x: 5 })] },
  ]));
  const combined = enableContinuousCarousel(source);
  assert.deepEqual(combined.pages.map(page => page.id), source.pages.map(page => page.id));
  assert.deepEqual(combined.continuousCanvas.elements, [
    ...source.pages[0].canvas.elements,
    { ...source.pages[1].canvas.elements[0], x: 330 },
    { ...source.pages[2].canvas.elements[0], x: 725 },
  ]);
});

test("colliding IDs across normal pages are replaced without rewriting unique layer IDs", () => {
  const source = freeze(design([
    { background: "#fff", elements: [element("shared"), element("unique")] },
    { background: "#fff", elements: [element("shared")] },
  ]));
  const ids = enableContinuousCarousel(source).continuousCanvas.elements.map(item => item.id);
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(ids.slice(0, 2), ["shared", "unique"]);
  assert.notEqual(ids[2], "shared");
  assert.equal(source.pages[1].canvas.elements[0].id, "shared");
});

test("different opaque backgrounds become locked page-sized layers behind all artwork", () => {
  const source = design([
    { background: "#fff", elements: [element("a")] },
    { background: "#123456", elements: [element("b")] },
  ]);
  const scene = enableContinuousCarousel(source).continuousCanvas;
  assert.equal(scene.background, "#fff");
  assert.equal(scene.elements.length, 3);
  const background = scene.elements[0];
  assert.equal(background.type, "shape");
  assert.equal(background.fill, "#123456");
  assert.equal(background.locked, true);
  assert.deepEqual([background.x, background.y, background.width, background.height], [360, 0, 360, 360]);
  assert.deepEqual(scene.elements.slice(1).map(item => item.id), ["a", "b"]);
});

test("mixed transparent and alpha backgrounds preserve alpha on a transparent shared base", () => {
  for (const alpha of ["transparent", "#f008", "#ff000080"]) {
    const combined = enableContinuousCarousel(design([
      { background: "#fff", elements: [] }, { background: alpha, elements: [] },
    ]));
    const scene = combined.continuousCanvas;
    assert.equal(scene.background, "transparent");
    assert.deepEqual(scene.elements.map(item => item.fill), alpha === "transparent" ? ["#fff"] : ["#fff", alpha]);
    assert.deepEqual(scene.elements.map(item => item.x), alpha === "transparent" ? [0] : [0, 360]);
    assert.ok(persisted(combined));
  }
  const same = enableContinuousCarousel(design(Array.from({ length: 2 }, () => ({ background: "#1234", elements: [] }))));
  assert.deepEqual(same.continuousCanvas, { background: "#1234", elements: [] });
});

test("100 total layers are accepted and overflow including generated backgrounds fails atomically", () => {
  const hundred = Array.from({ length: 100 }, (_, index) => element(`layer-${index}`));
  const valid = enableContinuousCarousel(design([{ background: "#fff", elements: hundred }, { background: "#fff", elements: [] }]));
  assert.equal(valid.continuousCanvas.elements.length, 100);
  assert.ok(persisted(valid));
  for (const scenes of [
    [{ background: "#fff", elements: hundred }, { background: "#fff", elements: [element("extra")] }],
    [{ background: "#fff", elements: hundred }, { background: "#000", elements: [] }],
  ]) {
    const input = freeze(design(scenes));
    assert.throws(() => enableContinuousCarousel(input), /100 layers.*backgrounds/);
    assert.equal(input.continuousCanvas, undefined);
    assert.equal(input.pages[0].canvas.elements.length, 100);
  }
});

test("page bounds and parked coordinates fail explicitly instead of truncating artwork", () => {
  for (const count of [0, 21]) {
    const input = design(Array.from({ length: count }, () => ({ background: "#fff", elements: [] })));
    assert.throws(() => enableContinuousCarousel(input), /between 1 and 20/);
  }
  const tooFar = freeze(design([{ background: "#fff", elements: [] }, { background: "#fff", elements: [element("far", { x: 10000 })] }]));
  assert.throws(() => enableContinuousCarousel(tooFar), /too far outside/);
  assert.equal(tooFar.pages[1].canvas.elements[0].x, 10000);
  const maximum = enableContinuousCarousel(design(Array.from({ length: 20 }, () => ({ background: "#fff", elements: [] }))));
  assert.equal(maximum.pages.length, 20);
  assert.ok(persisted(maximum));
});

test("render slicing changes only X and keeps stable identities, crops, transforms and hidden text", () => {
  const input = design();
  input.continuousCanvas = { background: "#123456", elements: [
    createCanvasElement("image", { x: 310, y: 12, width: 470, height: 180, rotation: 29, cropX: 17, cropY: 81, fit: "contain", radius: 14 }),
    createCanvasElement("text", { x: 370, text: "One\nTwo", fontSize: 40, letterSpacing: 2, hidden: true }),
  ] };
  freeze(input);
  const slice = sliceSceneForPage(input, input.pages[1]);
  assert.equal(slice.background, input.continuousCanvas.background);
  assert.deepEqual(slice.elements, input.continuousCanvas.elements.map(item => ({ ...item, x: item.x - 360 })));
  assert.notEqual(slice.elements[0], input.continuousCanvas.elements[0]);
  assert.deepEqual(slice, sliceSceneForPage(input, 1));
  for (const index of [-1, 2, .5, NaN]) assert.throws(() => sliceSceneForPage(input, index), /not part/);
  assert.throws(() => sliceSceneForPage(input, { id: "missing" }), /not part/);
});

test("splitting crossing and enclosing layers makes independent copies with exact local coordinates", () => {
  const input = design();
  input.continuousCanvas = { background: "#123456", elements: [
    element("crossing", { x: 320, width: 80, hidden: true, rotation: 12 }),
    element("cover", { x: -100, y: -100, width: 920, height: 560, locked: true }),
  ] };
  freeze(input);
  const split = splitContinuousCarousel(input);
  assert.equal("continuousCanvas" in split, false);
  assert.deepEqual(split.pages.map(names), [["crossing", "cover"], ["crossing", "cover"]]);
  assert.deepEqual(split.pages.map(page => page.canvas.elements[0].x), [320, -40]);
  const copies = split.pages.flatMap(page => page.canvas.elements);
  assert.equal(new Set(copies.map(item => item.id)).size, 4);
  assert.ok(copies.every(item => item.id !== "crossing" && item.id !== "cover"));
  assert.ok(split.pages.every(page => page.canvas.background === "#123456" && page.canvas.elements[0].hidden));
  assert.deepEqual(split.pages.map(page => page.id), input.pages.map(page => page.id));
  split.pages[0].canvas.elements[0].x = 999;
  assert.equal(split.pages[1].canvas.elements[0].x, -40);
  assert.equal(input.continuousCanvas.elements[0].x, 320);
  assert.ok(persisted(split));
});

test("splitting retains all fully parked and edge-touching layers on slide one only", () => {
  const input = design();
  input.continuousCanvas = { background: "#fff", elements: [
    element("left", { x: -100 }), element("right", { x: 800 }),
    element("top", { y: -100 }), element("bottom", { y: 400 }),
    element("touch", { x: 720, hidden: true }),
    element("partial", { x: 700 }), element("second", { x: 400 }),
  ] };
  const split = splitContinuousCarousel(freeze(input));
  assert.deepEqual(split.pages.map(names), [["left", "right", "top", "bottom", "touch"], ["partial", "second"]]);
  assert.equal(split.pages[1].canvas.elements[0].x, 340);
  assert.equal(split.pages[0].canvas.elements[4].hidden, true);
  assert.ok(persisted(split));
});

test("rotation-aware split rejects false-positive bounding boxes at a slide corner", () => {
  const input = design();
  input.continuousCanvas = { background: "#fff", elements: [
    element("parked-rotated", { x: 335, y: 375, width: 100, height: 20, rotation: -45 }),
    element("cross-rotated", { x: 315, y: 345, width: 100, height: 20, rotation: -45 }),
  ] };
  const split = splitContinuousCarousel(input);
  assert.deepEqual(split.pages.map(names), [["cross-rotated"], ["parked-rotated", "cross-rotated"]]);
});

test("mode no-ops preserve references and normal preview uses the original page scene", () => {
  const normal = freeze(design());
  assert.equal(splitContinuousCarousel(normal), normal);
  assert.equal(sliceSceneForPage(normal, 1), normal.pages[1].canvas);
  const continuous = freeze(enableContinuousCarousel(normal));
  assert.equal(enableContinuousCarousel(continuous), continuous);
  assert.ok(persisted(splitContinuousCarousel(continuous)));
});

test("split conversion rejects geometry that would exceed persistence bounds without mutating the source", () => {
  const input = design(Array.from({ length: 20 }, () => ({ background: "#fff", elements: [] })));
  input.continuousCanvas = { background: "#fff", elements: [
    // Its 45-degree rotated corner reaches the canvas although the local X
    // coordinate on later slides would be below the persistent model limit.
    element("large-rotated", { x: -9900, y: -5000, width: 10000, height: 10000, rotation: 45 }),
  ] };
  freeze(input);
  assert.throws(() => splitContinuousCarousel(input), /too far outside/);
  assert.equal(input.continuousCanvas.elements[0].x, -9900);
});
