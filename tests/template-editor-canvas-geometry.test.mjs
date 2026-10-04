/* Run: node --test tests/template-editor-canvas-geometry.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const filename = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../lib/template-editor/canvas-geometry.ts");
const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: filename,
}).outputText;
const unit = { exports: {} };
vm.runInThisContext(`(function(module,exports){${source}\n})`, { filename })(unit, unit.exports);
const { elementIntersectsCanvas, elementVisualBounds, sceneVisualBounds } = unit.exports;

const box = (overrides = {}) => Object.freeze({
  id: "test-box", type: "shape", name: "Test", shape: "rectangle",
  x: 20, y: 20, width: 20, height: 20, rotation: 0,
  opacity: 1, locked: false, fill: "#000", stroke: "#000", strokeWidth: 0, radius: 0,
  ...overrides,
});
const intersects = element => elementIntersectsCanvas(element, 100, 100);
const almost = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);

test("positive overlap across every side and corner counts as intersecting", () => {
  for (const [x, y] of [[-10, 40], [90, 40], [40, -10], [40, 90], [-10, -10], [90, -10], [90, 90], [-10, 90]]) {
    assert.equal(intersects(box({ x, y })), true, `${x}, ${y}`);
  }
  assert.equal(intersects(box()), true);
  assert.equal(intersects(box({ x: 0, y: 0, width: 100, height: 100 })), true);
});

test("fully parked boxes beyond each side and corner stay outside", () => {
  for (const [x, y] of [[-21, 40], [101, 40], [40, -21], [40, 101], [-21, -21], [101, -21], [101, 101], [-21, 101]]) {
    assert.equal(intersects(box({ x, y })), false, `${x}, ${y}`);
  }
});

test("edge-only and corner-only contact has zero area and stays outside", () => {
  for (const [x, y] of [[-20, 40], [100, 40], [40, -20], [40, 100], [-20, -20], [100, -20], [100, 100], [-20, 100]]) {
    assert.equal(intersects(box({ x, y })), false, `${x}, ${y}`);
  }
  // The rightmost vertex of this 45-degree square touches the left page edge.
  assert.equal(intersects(box({ x: -Math.SQRT2 * 10 - 10, y: 40, rotation: 45 })), false);
  assert.equal(intersects(box({ x: -Math.SQRT2 * 10 - 10 + .001, y: 40, rotation: 45 })), true);
});

test("full canvas enclosure is detected even when no element corner lies on the canvas", () => {
  assert.equal(intersects(box({ x: -50, y: -50, width: 200, height: 200 })), true);
  assert.equal(intersects(box({ x: -50, y: -50, width: 200, height: 200, rotation: 45 })), true);
  // A long strip cuts through both page sides with all its corners outside.
  assert.equal(intersects(box({ x: -100, y: 40, width: 300, height: 20, rotation: 10 })), true);
});

test("exact rotated intersection rejects overlapping-AABB false positives at all corners", () => {
  for (const [centerX, centerY, rotation] of [[125, 125, -45], [-25, 125, 45], [-25, -25, -45], [125, -25, 45]]) {
    const element = box({ x: centerX - 50, y: centerY - 10, width: 100, height: 20, rotation });
    const bounds = elementVisualBounds(element);
    assert.ok(bounds.x < 100 && bounds.x + bounds.width > 0 && bounds.y < 100 && bounds.y + bounds.height > 0);
    assert.equal(intersects(element), false, `corner ${centerX}, ${centerY}`);
  }
  assert.equal(intersects(box({ x: 55, y: 95, width: 100, height: 20, rotation: -45 })), true);
});

test("quarter turns and equivalent full rotations preserve exact touching classification", () => {
  for (const rotation of [90, -90, 450, -990, 3690]) {
    // Rotation makes visual bounds x=-20..0 while the unrotated box is -30..10.
    const touching = box({ x: -30, y: 30, width: 40, height: 20, rotation });
    assert.equal(intersects(touching), false, String(rotation));
    assert.equal(intersects({ ...touching, x: touching.x + 1e-6 }), true, String(rotation));
  }
});

test("model-scale extremes and small genuine overlaps remain numerically stable", () => {
  assert.equal(elementIntersectsCanvas(box({ x: -5000, y: -5000, width: 10000, height: 10000, rotation: 37 }), 360, 640), true);
  assert.equal(elementIntersectsCanvas(box({ x: 10000, y: 10000, width: 1, height: 1, rotation: -3600 }), 360, 640), false);
  assert.equal(elementIntersectsCanvas(box({ x: -10000, y: -10000, width: 10000, height: 10000 }), 360, 640), false);
  assert.equal(elementIntersectsCanvas(box({ x: -10000 + .000001, y: -10000 + .000001, width: 10000, height: 10000 }), 360, 640), true);
  assert.equal(intersects(box({ width: 1, height: 1, x: 99.999999, y: 99.999999, rotation: 0 })), true);
});

test("invalid or degenerate dimensions cannot create an intersection", () => {
  for (const patch of [{ x: NaN }, { y: Infinity }, { rotation: Infinity }, { width: 0 }, { height: 0 }, { width: -1 }]) {
    assert.equal(intersects(box(patch)), false);
  }
  for (const [width, height] of [[0, 100], [100, 0], [-1, 100], [Infinity, 100], [100, NaN]]) {
    assert.equal(elementIntersectsCanvas(box(), width, height), false);
  }
});

test("visual bounds use the same center rotation and scene bounds include parked layers", () => {
  assert.deepEqual(elementVisualBounds(box({ x: 20, y: 30, width: 40, height: 20, rotation: 90 })), { x: 30, y: 20, width: 20, height: 40 });
  const rotated = elementVisualBounds(box({ x: 20, y: 30, width: 40, height: 20, rotation: 45 }));
  almost(rotated.width, 60 / Math.SQRT2);
  almost(rotated.height, 60 / Math.SQRT2);
  almost(rotated.x + rotated.width / 2, 40);
  almost(rotated.y + rotated.height / 2, 40);
  const scene = Object.freeze({ background: "#fff", elements: Object.freeze([box({ x: -50, y: -30 }), box({ x: 120, y: 130, width: 40, height: 20, rotation: 90, opacity: 0, locked: true })]) });
  assert.deepEqual(sceneVisualBounds(scene), { x: -50, y: -30, width: 200, height: 190 });
  assert.equal(scene.elements[0].x, -50);
  assert.equal(sceneVisualBounds({ background: "#fff", elements: [] }), null);
});
