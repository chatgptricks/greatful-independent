import type { CanvasElement, CanvasScene } from "./model";

export type CanvasBounds = { x: number; y: number; width: number; height: number };

function orientation(rotation: number): { cosine: number; sine: number } {
  const radians = (rotation % 360) * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  // Exact quarter turns should not manufacture subpixel overlap at an edge.
  return {
    cosine: Math.abs(cosine) < 4 * Number.EPSILON ? 0 : cosine,
    sine: Math.abs(sine) < 4 * Number.EPSILON ? 0 : sine,
  };
}

/** Axis-aligned bounds of the element's box after rotation about its center. */
export function elementVisualBounds(element: CanvasElement): CanvasBounds {
  const { cosine, sine } = orientation(element.rotation);
  const width = Math.abs(element.width * cosine) + Math.abs(element.height * sine);
  const height = Math.abs(element.width * sine) + Math.abs(element.height * cosine);
  return {
    x: element.x + (element.width - width) / 2,
    y: element.y + (element.height - height) / 2,
    width,
    height,
  };
}

/** Union of all element boxes, including layers parked outside the page.
 * Empty scenes have no bounds. Opacity and locking do not change geometry. */
export function sceneVisualBounds(scene: CanvasScene): CanvasBounds | null {
  if (!scene.elements.length) return null;
  const boxes = scene.elements.map(elementVisualBounds);
  const x = Math.min(...boxes.map(box => box.x));
  const y = Math.min(...boxes.map(box => box.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map(box => box.x + box.width)) - x,
    height: Math.max(...boxes.map(box => box.y + box.height)) - y,
  };
}

/** True only for positive-area intersection between the rotated element box
 * and the canvas rectangle (0, 0, width, height). Edge/corner contact is false.
 * Four separating axes handle complete enclosure as well as corner crossings;
 * an AABB test alone would wrongly clip diagonal elements near page corners. */
export function elementIntersectsCanvas(element: CanvasElement, width: number, height: number): boolean {
  if (![element.x, element.y, element.width, element.height, element.rotation, width, height].every(Number.isFinite) ||
    element.width <= 0 || element.height <= 0 || width <= 0 || height <= 0) return false;

  const { cosine, sine } = orientation(element.rotation);
  const halfWidth = element.width / 2;
  const halfHeight = element.height / 2;
  const canvasHalfWidth = width / 2;
  const canvasHalfHeight = height / 2;
  const offsetX = element.x + halfWidth - canvasHalfWidth;
  const offsetY = element.y + halfHeight - canvasHalfHeight;
  const axes = [[1, 0], [0, 1], [cosine, sine], [-sine, cosine]];
  // Only compensate for floating-point arithmetic error, not visible gaps.
  const tolerance = 16 * Number.EPSILON * Math.max(1, Math.abs(offsetX), Math.abs(offsetY), element.width, element.height, width, height);
  for (const [axisX, axisY] of axes) {
    const elementRadius = halfWidth * Math.abs(axisX * cosine + axisY * sine)
      + halfHeight * Math.abs(-axisX * sine + axisY * cosine);
    const canvasRadius = canvasHalfWidth * Math.abs(axisX) + canvasHalfHeight * Math.abs(axisY);
    const centerDistance = Math.abs(offsetX * axisX + offsetY * axisY);
    if (elementRadius + canvasRadius - centerDistance <= tolerance) return false;
  }
  return true;
}
