import { createCanvasElement, type CanvasElement, type CanvasScene } from "./model";

export const MAX_SCENE_ELEMENTS = 100;
export type ScenePoint = { x: number; y: number };
export type PageSize = { width: number; height: number };
export type LayerOrder = "forward" | "backward" | "front" | "back";
export type PageAlignment = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type SceneCommandResult = {
  scene: CanvasScene;
  selectedIds: string[];
  /** True when the page's 100-element limit prevented some or all insertion. */
  limited: boolean;
};

type VisualBounds = ScenePoint & PageSize;
const MIN_POSITION = -10_000;
const MAX_POSITION = 10_000;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const close = (left: number, right: number) => Math.abs(left - right) < 1e-8;

function selectedElements(scene: CanvasScene, ids: readonly string[], includeLocked = false): CanvasElement[] {
  const selected = new Set(ids);
  return scene.elements.filter(element => selected.has(element.id) && (includeLocked || !element.locked));
}

function result(scene: CanvasScene, ids: readonly string[], limited = false): SceneCommandResult {
  const selected = new Set(ids);
  return { scene, selectedIds: scene.elements.filter(element => selected.has(element.id)).map(element => element.id), limited };
}

/** Rotation-aware visual bounds, rather than the unrotated CSS box. */
function visualBounds(elements: readonly CanvasElement[]): VisualBounds {
  const boxes = elements.map(element => {
    const radians = element.rotation * Math.PI / 180;
    const width = Math.abs(element.width * Math.cos(radians)) + Math.abs(element.height * Math.sin(radians));
    const height = Math.abs(element.width * Math.sin(radians)) + Math.abs(element.height * Math.cos(radians));
    return { x: element.x + (element.width - width) / 2, y: element.y + (element.height - height) / 2, width, height };
  });
  const x = Math.min(...boxes.map(box => box.x));
  const y = Math.min(...boxes.map(box => box.y));
  return { x, y, width: Math.max(...boxes.map(box => box.x + box.width)) - x, height: Math.max(...boxes.map(box => box.y + box.height)) - y };
}

/** Clamp one shared translation so relative offsets survive at model limits. */
function boundedTranslation(elements: readonly CanvasElement[], requested: ScenePoint): ScenePoint {
  const minimumX = Math.min(...elements.map(element => element.x));
  const maximumX = Math.max(...elements.map(element => element.x));
  const minimumY = Math.min(...elements.map(element => element.y));
  const maximumY = Math.max(...elements.map(element => element.y));
  return {
    x: clamp(requested.x, MIN_POSITION - minimumX, MAX_POSITION - maximumX),
    y: clamp(requested.y, MIN_POSITION - minimumY, MAX_POSITION - maximumY),
  };
}

/** A detached snapshot in stacking order. Copying a locked layer is allowed. */
export function copySelection(scene: CanvasScene, ids: readonly string[]): CanvasElement[] {
  return structuredClone(selectedElements(scene, ids, true));
}

function insertCopies(
  scene: CanvasScene,
  snapshot: readonly CanvasElement[],
  position: ScenePoint | undefined,
  previousSelection: readonly string[],
): SceneCommandResult {
  if (!snapshot.length || (position && (!Number.isFinite(position.x) || !Number.isFinite(position.y)))) {
    return result(scene, previousSelection);
  }
  const capacity = Math.max(0, MAX_SCENE_ELEMENTS - scene.elements.length);
  const limited = snapshot.length > capacity;
  if (!capacity) return result(scene, previousSelection, limited);
  const originals = structuredClone(snapshot.slice(0, capacity));
  const bounds = visualBounds(originals);
  const delta = boundedTranslation(originals, position ? { x: position.x - bounds.x, y: position.y - bounds.y } : { x: 12, y: 12 });
  const copies = originals.map(element => createCanvasElement(element.type, {
    ...element,
    name: `${element.name.slice(0, 195)} copy`,
    locked: false,
    x: element.x + delta.x,
    y: element.y + delta.y,
  }));
  return { scene: { ...scene, elements: [...scene.elements, ...copies] }, selectedIds: copies.map(element => element.id), limited };
}

/** Duplicates only unlocked layers, with fresh IDs and a default 12px offset. */
export function duplicateSelection(scene: CanvasScene, ids: readonly string[], position?: ScenePoint): SceneCommandResult {
  return insertCopies(scene, selectedElements(scene, ids), position, ids);
}

/** Places the copied group's visual top-left at position, or offsets by 12px.
 * Originals (including copied locked layers) remain untouched; new copies are
 * unlocked. A partial paste retains the source's stacking order. */
export function pasteSelection(scene: CanvasScene, snapshot: readonly CanvasElement[], position?: ScenePoint): SceneCommandResult {
  return insertCopies(scene, snapshot, position, []);
}

export function removeSelection(scene: CanvasScene, ids: readonly string[]): SceneCommandResult {
  const removable = new Set(selectedElements(scene, ids).map(element => element.id));
  if (!removable.size) return result(scene, ids);
  return result({ ...scene, elements: scene.elements.filter(element => !removable.has(element.id)) }, ids);
}

export function setSelectionLocked(scene: CanvasScene, ids: readonly string[], locked: boolean): SceneCommandResult {
  const selected = new Set(ids);
  let changed = false;
  const elements = scene.elements.map(element => {
    if (!selected.has(element.id) || element.locked === locked) return element;
    changed = true;
    return { ...element, locked };
  });
  return result(changed ? { ...scene, elements } : scene, ids);
}

/** Elements are ordered back to front. Selected unlocked blocks move one
 * neighboring step, or to the requested end; both groups keep stable order. */
export function reorderSelection(scene: CanvasScene, ids: readonly string[], order: LayerOrder): SceneCommandResult {
  const moving = new Set(selectedElements(scene, ids).map(element => element.id));
  if (!moving.size) return result(scene, ids);
  let elements = [...scene.elements];
  if (order === "front" || order === "back") {
    const selected = elements.filter(element => moving.has(element.id));
    const stationary = elements.filter(element => !moving.has(element.id));
    elements = order === "front" ? [...stationary, ...selected] : [...selected, ...stationary];
  } else if (order === "forward") {
    for (let index = elements.length - 2; index >= 0; index--) {
      if (moving.has(elements[index].id) && !moving.has(elements[index + 1].id)) {
        [elements[index], elements[index + 1]] = [elements[index + 1], elements[index]];
      }
    }
  } else {
    for (let index = 1; index < elements.length; index++) {
      if (moving.has(elements[index].id) && !moving.has(elements[index - 1].id)) {
        [elements[index], elements[index - 1]] = [elements[index - 1], elements[index]];
      }
    }
  }
  const changed = elements.some((element, index) => element !== scene.elements[index]);
  return result(changed ? { ...scene, elements } : scene, ids);
}

function alignmentOffset(bounds: VisualBounds, align: PageAlignment, page: PageSize): ScenePoint {
  if (align === "left") return { x: -bounds.x, y: 0 };
  if (align === "center") return { x: (page.width - bounds.width) / 2 - bounds.x, y: 0 };
  if (align === "right") return { x: page.width - bounds.width - bounds.x, y: 0 };
  if (align === "top") return { x: 0, y: -bounds.y };
  if (align === "middle") return { x: 0, y: (page.height - bounds.height) / 2 - bounds.y };
  return { x: 0, y: page.height - bounds.height - bounds.y };
}

/** Align individual visible boxes to the page by default, matching the
 * inspector. Group mode aligns the full selection without changing offsets. */
export function alignSelection(
  scene: CanvasScene,
  ids: readonly string[],
  align: PageAlignment,
  page: PageSize,
  mode: "individual" | "group" = "individual",
): SceneCommandResult {
  const selected = selectedElements(scene, ids);
  if (!selected.length || !Number.isFinite(page.width) || !Number.isFinite(page.height) || page.width <= 0 || page.height <= 0) return result(scene, ids);
  const movable = new Set(selected.map(element => element.id));
  const groupOffset = mode === "group" ? boundedTranslation(selected, alignmentOffset(visualBounds(selected), align, page)) : null;
  let changed = false;
  const elements = scene.elements.map(element => {
    if (!movable.has(element.id)) return element;
    const delta = groupOffset ?? boundedTranslation([element], alignmentOffset(visualBounds([element]), align, page));
    if (close(delta.x, 0) && close(delta.y, 0)) return element;
    changed = true;
    return { ...element, x: element.x + delta.x, y: element.y + delta.y };
  });
  return result(changed ? { ...scene, elements } : scene, ids);
}
