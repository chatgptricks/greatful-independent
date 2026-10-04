"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  CanvasElement,
  CanvasScene,
  TextElement,
} from "@/lib/template-editor/model";
import { proxied } from "@/lib/grateful-future/util";
import "./canvas.css";

type Point = { x: number; y: number };
type Box = Point & { width: number; height: number; rotation: number };
type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
type Gesture = {
  kind: "move" | "resize" | "rotate";
  pointer: number;
  capture: HTMLElement;
  start: Point;
  source: CanvasScene;
  latest: CanvasScene;
  ids: string[];
  bounds: Box;
  handle?: Handle;
  moved: boolean;
};
type Marquee = {
  pointer: number;
  capture: HTMLElement;
  start: Point;
  source: CanvasScene;
  previousIds: string[];
  baseIds: string[];
  moved: boolean;
};
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HANDLE_NAMES: Record<Handle, string> = {
  nw: "top left",
  n: "top",
  ne: "top right",
  e: "right",
  se: "bottom right",
  s: "bottom",
  sw: "bottom left",
  w: "left",
};
const RAD = Math.PI / 180;
const round = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const center = (box: Box): Point => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

function bounded(element: CanvasElement): CanvasElement {
  return {
    ...element,
    x: round(clamp(element.x, -10_000, 10_000)),
    y: round(clamp(element.y, -10_000, 10_000)),
    width: round(clamp(element.width, 1, 10_000)),
    height: round(clamp(element.height, 1, 10_000)),
  };
}

/** Uploads can complete during a gesture. Preserve the latest layer list and
 * content, and apply only fields that this gesture actually transformed. */
function mergeGesture(scene: CanvasScene, active: Gesture): CanvasScene {
  const originals = new Map(active.source.elements.map((element) => [element.id, element]));
  const transformed = new Map(active.latest.elements.map((element) => [element.id, element]));
  const selected = new Set(active.ids);
  let changed = false;
  const elements = scene.elements.map((element) => {
    if (!selected.has(element.id) || element.locked) return element;
    const original = originals.get(element.id), next = transformed.get(element.id);
    if (!original || !next || original.type !== element.type || next.type !== element.type) return element;
    const replacement = { ...element };
    let modified = false;
    for (const key of ["x", "y", "width", "height", "rotation"] as const) {
      if (next[key] !== original[key] && next[key] !== element[key]) {
        replacement[key] = next[key];
        modified = true;
      }
    }
    if (replacement.type === "text" && original.type === "text" && next.type === "text") {
      for (const key of ["fontSize", "letterSpacing"] as const) {
        if (next[key] !== original[key] && next[key] !== replacement[key]) {
          replacement[key] = next[key];
          modified = true;
        }
      }
    }
    if (replacement.type !== "text" && original.type !== "text" && next.type !== "text" && next.radius !== original.radius && next.radius !== replacement.radius) {
      replacement.radius = next.radius;
      modified = true;
    }
    if (replacement.type === "shape" && original.type === "shape" && next.type === "shape" && next.strokeWidth !== original.strokeWidth && next.strokeWidth !== replacement.strokeWidth) {
      replacement.strokeWidth = next.strokeWidth;
      modified = true;
    }
    if (!modified) return element;
    changed = true;
    return replacement;
  });
  return changed ? { ...scene, elements } : scene;
}

function rotate(point: Point, degrees: number): Point {
  const radians = degrees * RAD;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

function boxStyle(element: Box): CSSProperties {
  return {
    left: element.x,
    top: element.y,
    width: element.width,
    height: element.height,
    transform: `rotate(${element.rotation}deg)`,
  };
}

function textStyle(element: TextElement): CSSProperties {
  return {
    fontSize: element.fontSize,
    fontWeight: element.fontWeight,
    fontStyle: element.italic ? "italic" : "normal",
    textDecoration: element.underline ? "underline" : "none",
    color: element.color,
    textAlign: element.align,
    lineHeight: element.lineHeight,
    letterSpacing: element.letterSpacing,
  };
}

function SceneElement({ element }: { element: CanvasElement }) {
  return (
    <div
      className={`te-canvas-element te-canvas-element-${element.type}`}
      style={{ ...boxStyle(element), opacity: element.opacity }}
      data-element-id={element.id}
    >
      {element.type === "text" ? (
        <div
          className={`te-canvas-text gf-font-${element.font}`}
          style={textStyle(element)}
        >
          {element.text}
        </div>
      ) : element.type === "image" ? (
        // Native images keep export rendering and the editor's image proxy identical.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="te-canvas-image"
          src={proxied(element.src)}
          alt=""
          draggable={false}
          referrerPolicy="no-referrer"
          style={{
            objectFit: element.fit,
            objectPosition: `${element.cropX}% ${element.cropY}%`,
            borderRadius: element.radius,
          }}
        />
      ) : (
        <div
          className="te-canvas-shape"
          style={{
            background: element.fill,
            border: `${element.strokeWidth}px solid ${element.stroke}`,
            borderRadius: element.shape === "ellipse" ? "50%" : element.radius,
          }}
        />
      )}
    </div>
  );
}

/** One 360px coordinate system is used for the editor, thumbnails and exports. */
export function SceneRenderer({ scene }: { scene: CanvasScene }) {
  return (
    <div className="te-canvas-scene" style={{ background: scene.background }}>
      {scene.elements.map((element) => (
        <SceneElement key={element.id} element={element} />
      ))}
    </div>
  );
}

function selectionBounds(elements: CanvasElement[], rotatedSingle = true): Box {
  if (elements.length === 1 && rotatedSingle) {
    const { x, y, width, height, rotation } = elements[0];
    return { x, y, width, height, rotation };
  }
  const points = elements.flatMap((element) => {
    const midpoint = center(element);
    return [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([x, y]) => {
      const offset = rotate(
        { x: (x * element.width) / 2, y: (y * element.height) / 2 },
        element.rotation,
      );
      return { x: midpoint.x + offset.x, y: midpoint.y + offset.y };
    });
  });
  const left = Math.min(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  return {
    x: left,
    y: top,
    width: Math.max(...points.map((point) => point.x)) - left,
    height: Math.max(...points.map((point) => point.y)) - top,
    rotation: 0,
  };
}

/** Rectangle intersection in each box's axes avoids selecting the empty
 * corners around rotated artwork when drawing a selection rectangle. */
function intersectsMarquee(element: CanvasElement, area: Box): boolean {
  const midpoint = center(element);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => {
    const offset = rotate({ x: x * element.width / 2, y: y * element.height / 2 }, element.rotation);
    return { x: midpoint.x + offset.x, y: midpoint.y + offset.y };
  });
  const rectangle = [
    { x: area.x, y: area.y }, { x: area.x + area.width, y: area.y },
    { x: area.x + area.width, y: area.y + area.height }, { x: area.x, y: area.y + area.height },
  ];
  const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }, rotate({ x: 1, y: 0 }, element.rotation), rotate({ x: 0, y: 1 }, element.rotation)];
  return axes.every((axis) => {
    const first = corners.map((point) => point.x * axis.x + point.y * axis.y);
    const second = rectangle.map((point) => point.x * axis.x + point.y * axis.y);
    return Math.max(...first) >= Math.min(...second) && Math.max(...second) >= Math.min(...first);
  });
}

function resizeSingle(
  element: CanvasElement,
  handle: Handle,
  delta: Point,
  preserveAspect: boolean,
): CanvasElement {
  const local = rotate(delta, -element.rotation);
  const sx = handle.includes("w") ? -1 : handle.includes("e") ? 1 : 0;
  const sy = handle.includes("n") ? -1 : handle.includes("s") ? 1 : 0;
  let width = clamp(element.width + sx * local.x, 8, 2160);
  let height = clamp(element.height + sy * local.y, 8, 3840);
  const isCorner = Boolean(sx && sy);
  // Text corners scale the type; side handles reflow the text within its box.
  if (isCorner && (preserveAspect || element.type === "text")) {
    const dw = (width - element.width) / element.width;
    const dh = (height - element.height) / element.height;
    const maximum = Math.min(10_000 / element.width, 10_000 / element.height);
    const scale = clamp(
      1 + (Math.abs(dw) >= Math.abs(dh) ? dw : dh),
      Math.min(maximum, 8 / Math.min(element.width, element.height)),
      maximum,
    );
    width = element.width * scale;
    height = element.height * scale;
  }
  const shift = rotate(
    {
      x: ((width - element.width) * sx) / 2,
      y: ((height - element.height) * sy) / 2,
    },
    element.rotation,
  );
  const midpoint = center(element);
  const result = {
    ...element,
    x: round(midpoint.x + shift.x - width / 2),
    y: round(midpoint.y + shift.y - height / 2),
    width: round(width),
    height: round(height),
  };
  return element.type === "text" && isCorner
    ? ({
        ...result,
        fontSize: round(
          clamp((element.fontSize * width) / element.width, 1, 500),
        ),
        letterSpacing: round(
          clamp((element.letterSpacing * width) / element.width, -20, 100),
        ),
      } as CanvasElement)
    : result;
}

function resizeGroup(
  elements: CanvasElement[],
  bounds: Box,
  handle: Handle,
  delta: Point,
): CanvasElement[] {
  const sx = handle.includes("w") ? -1 : 1;
  const sy = handle.includes("n") ? -1 : 1;
  const anchor = {
    x: bounds.x + (sx === -1 ? bounds.width : 0),
    y: bounds.y + (sy === -1 ? bounds.height : 0),
  };
  const diagonal = { x: bounds.width * sx, y: bounds.height * sy };
  const minimum = Math.max(
    ...elements.map((element) => 8 / Math.min(element.width, element.height)),
  );
  const maximum = Math.min(
    10,
    ...elements.flatMap((element) => [
      10_000 / element.width,
      10_000 / element.height,
    ]),
  );
  const scale = clamp(
    1 +
      (delta.x * diagonal.x + delta.y * diagonal.y) /
        (diagonal.x ** 2 + diagonal.y ** 2),
    Math.min(minimum, maximum),
    maximum,
  );
  return elements.map((element) => {
    const midpoint = center(element);
    const width = element.width * scale;
    const height = element.height * scale;
    const resized = {
      ...element,
      x: round(anchor.x + (midpoint.x - anchor.x) * scale - width / 2),
      y: round(anchor.y + (midpoint.y - anchor.y) * scale - height / 2),
      width: round(width),
      height: round(height),
    };
    if (element.type === "text")
      return {
        ...resized,
        fontSize: round(clamp(element.fontSize * scale, 1, 500)),
        letterSpacing: round(clamp(element.letterSpacing * scale, -20, 100)),
      } as CanvasElement;
    if (element.type === "shape")
      return {
        ...resized,
        radius: round(clamp(element.radius * scale, 0, 5000)),
        strokeWidth: round(clamp(element.strokeWidth * scale, 0, 200)),
      } as CanvasElement;
    return {
      ...resized,
      radius: round(clamp(element.radius * scale, 0, 5000)),
    } as CanvasElement;
  });
}

type CanvasEditorProps = {
  scene: CanvasScene;
  width?: number;
  height: number;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onChange: (scene: CanvasScene, group?: string) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLDivElement>, targetId: string | null) => void;
  editingRequest?: { id: string; serial: number };
  disabled?: boolean;
};

export function CanvasEditor({
  scene,
  width = 360,
  height,
  selectedIds,
  onSelect,
  onChange,
  onContextMenu,
  editingRequest,
  disabled = false,
}: CanvasEditorProps) {
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const marquee = useRef<Marquee | null>(null);
  const lastEditingRequest = useRef<string | null>(null);
  const editingNode = useRef<HTMLDivElement>(null);
  const editingActive = useRef<string | null>(null);
  const editingOriginal = useRef<TextElement | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSeed, setEditingSeed] = useState("");
  const [live, setLive] = useState<CanvasScene | null>(null);
  const [selectionArea, setSelectionArea] = useState<Box | null>(null);
  const [guides, setGuides] = useState({ x: false, y: false });
  const currentScene = live ?? scene;
  const selected = currentScene.elements.filter((element) =>
    selectedIds.includes(element.id),
  );
  const selectionBox = selected.length ? selectionBounds(selected) : null;
  const editingElement = currentScene.elements.find(
    (element): element is TextElement =>
      element.id === editingId && element.type === "text",
  );

  useLayoutEffect(() => {
    if (!editingId || !editingNode.current) return;
    const node = editingNode.current;
    node.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editingId]);

  useEffect(
    () => () => {
      gesture.current = null;
      marquee.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!editingRequest || disabled) return;
    const request = `${editingRequest.id}:${editingRequest.serial}`;
    if (lastEditingRequest.current === request) return;
    const element = scene.elements.find((item) => item.id === editingRequest.id);
    if (element?.type !== "text" || element.locked) return;
    let cancelled = false;
    // Defer until a context menu has released its focus and restored the
    // canvas. Repeated scene changes during typing do not restart editing.
    queueMicrotask(() => {
      if (cancelled) return;
      lastEditingRequest.current = request;
      onSelect([element.id]);
      editingActive.current = element.id;
      editingOriginal.current = element;
      setEditingSeed(element.text);
      setEditingId(element.id);
    });
    return () => { cancelled = true; };
  }, [editingRequest, scene, disabled, onSelect]);

  function position(event: { clientX: number; clientY: number }): Point {
    const bounds = root.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) * width) / bounds.width,
      y: ((event.clientY - bounds.top) * height) / bounds.height,
    };
  }

  function updateEditing(cancel = false): CanvasScene {
    const id = editingActive.current;
    if (!id) return scene;
    const value = cancel
      ? (editingOriginal.current?.text ?? "")
      : (editingNode.current?.innerText
          .replace(/\r\n?/g, "\n")
          .replace(/\u00a0/g, " ") ?? "");
    const previous = scene.elements.find((element) => element.id === id);
    if (previous?.type !== "text") return scene;
    const measuredHeight = cancel
      ? (editingOriginal.current?.height ?? previous.height)
      : Math.min(
          10_000,
          Math.max(
            previous.height,
            editingNode.current?.scrollHeight ?? previous.height,
          ),
        );
    // Growing a rotated box keeps its top edge anchored in the same place.
    const shift = rotate(
      { x: 0, y: (measuredHeight - previous.height) / 2 },
      previous.rotation,
    );
    const replacement = bounded(
      cancel && editingOriginal.current
        ? editingOriginal.current
        : {
            ...previous,
            text: value.slice(0, 20_000),
            height: measuredHeight,
            x: previous.x + shift.x,
            y: previous.y + shift.y - (measuredHeight - previous.height) / 2,
          },
    );
    if (JSON.stringify(previous) === JSON.stringify(replacement)) return scene;
    const next = {
      ...scene,
      elements: scene.elements.map((element) =>
        element.id === id ? replacement : element,
      ),
    };
    // Keep the DOM's original React text child stable while editing. Publishing
    // scene changes here drives autosave without replacing the caret/selection.
    onChange(next, `text:${id}`);
    return next;
  }

  function finishEditing(cancel = false): CanvasScene {
    const next = updateEditing(cancel);
    editingActive.current = null;
    editingOriginal.current = null;
    setEditingId(null);
    return next;
  }

  function startEditing(element: CanvasElement) {
    if (disabled || element.locked || element.type !== "text") return;
    if (editingActive.current && editingActive.current !== element.id)
      finishEditing();
    onSelect([element.id]);
    editingActive.current = element.id;
    editingOriginal.current = element;
    setEditingSeed(element.text);
    setEditingId(element.id);
  }

  function begin(
    event: ReactPointerEvent,
    kind: Gesture["kind"],
    ids: string[],
    handle?: Handle,
  ) {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const source = finishEditing();
    const movable = source.elements.filter(
      (element) => ids.includes(element.id) && !element.locked,
    );
    if (!movable.length) return;
    root.current?.focus({ preventScroll: true });
    // Keep capture on the pressed layer/handle so a stationary double-click
    // still reaches that layer instead of being retargeted to the canvas root.
    const capture = event.currentTarget as HTMLElement;
    capture.setPointerCapture(event.pointerId);
    gesture.current = {
      kind,
      pointer: event.pointerId,
      capture,
      start: position(event),
      source,
      latest: source,
      ids: movable.map((element) => element.id),
      bounds: selectionBounds(movable, kind !== "move"),
      handle,
      moved: false,
    };
  }

  function selectElement(event: ReactPointerEvent, element: CanvasElement) {
    if (disabled || event.button !== 0) return;
    event.stopPropagation();
    const exists = selectedIds.includes(element.id);
    const next = event.shiftKey
      ? exists
        ? selectedIds.filter((id) => id !== element.id)
        : [...selectedIds, element.id]
      : exists
        ? selectedIds
        : [element.id];
    onSelect(next);
    if (element.locked || (event.shiftKey && exists)) {
      event.preventDefault();
      finishEditing();
      root.current?.focus({ preventScroll: true });
      return;
    }
    begin(event, "move", next);
  }

  function beginMarquee(event: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0 || gesture.current || marquee.current) return;
    event.preventDefault();
    const source = finishEditing();
    const capture = event.currentTarget;
    const point = position(event);
    root.current?.focus({ preventScroll: true });
    capture.setPointerCapture(event.pointerId);
    marquee.current = {
      pointer: event.pointerId, capture,
      start: { x: clamp(point.x, 0, width), y: clamp(point.y, 0, height) },
      source, previousIds: [...selectedIds], baseIds: event.shiftKey ? [...selectedIds] : [], moved: false,
    };
    if (!event.shiftKey) onSelect([]);
  }

  function endMarquee(cancel = false) {
    const active = marquee.current;
    if (!active) return;
    marquee.current = null;
    if (active.capture.hasPointerCapture(active.pointer)) active.capture.releasePointerCapture(active.pointer);
    setSelectionArea(null);
    if (cancel) onSelect(active.previousIds);
  }

  function openContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    if (!onContextMenu || disabled) return;
    const target = event.target instanceof Element ? event.target : null;
    // The tool-wide provider preserves text selection and its editing menu.
    if (target?.closest("[contenteditable=true]")) return;
    event.preventDefault();
    event.stopPropagation();
    end(true);
    endMarquee(true);
    finishEditing();
    const hitId = target?.closest<HTMLElement>("[data-layer-id]")?.dataset.layerId;
    const targetId = hitId ?? (target?.closest("[data-canvas-selection]") ? selectedIds[0] : null) ?? null;
    if (targetId && scene.elements.some((element) => element.id === targetId)) {
      if (!selectedIds.includes(targetId)) onSelect([targetId]);
    } else onSelect([]);
    onContextMenu(event, targetId);
  }

  function move(event: ReactPointerEvent) {
    const selecting = marquee.current;
    if (selecting && selecting.pointer === event.pointerId) {
      event.preventDefault();
      const point = position(event);
      const x = clamp(point.x, 0, width), y = clamp(point.y, 0, height);
      const viewScale = root.current!.getBoundingClientRect().width / width;
      if (!selecting.moved && Math.hypot(x - selecting.start.x, y - selecting.start.y) * viewScale < 3) return;
      selecting.moved = true;
      const area = { x: Math.min(selecting.start.x, x), y: Math.min(selecting.start.y, y), width: Math.abs(x - selecting.start.x), height: Math.abs(y - selecting.start.y), rotation: 0 };
      setSelectionArea(area);
      const hitIds = selecting.source.elements.filter((element) => !element.locked && intersectsMarquee(element, area)).map((element) => element.id);
      onSelect([...new Set([...selecting.baseIds, ...hitIds])]);
      return;
    }
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    event.preventDefault();
    const point = position(event);
    const delta = { x: point.x - active.start.x, y: point.y - active.start.y };
    const viewScale = root.current!.getBoundingClientRect().width / width;
    if (!active.moved && Math.hypot(delta.x, delta.y) * viewScale < 2) return;
    active.moved = true;
    const sourceElements = active.source.elements.filter((element) =>
      active.ids.includes(element.id),
    );
    let elements: CanvasElement[];
    if (active.kind === "move") {
      let dx = delta.x;
      let dy = delta.y;
      const midpoint = center(active.bounds);
      const snap = 5 / viewScale;
      const snapX =
        !event.altKey && Math.abs(midpoint.x + dx - width / 2) < snap;
      const snapY =
        !event.altKey && Math.abs(midpoint.y + dy - height / 2) < snap;
      if (snapX) dx = width / 2 - midpoint.x;
      if (snapY) dy = height / 2 - midpoint.y;
      setGuides({ x: snapX, y: snapY });
      elements = sourceElements.map((element) => ({
        ...element,
        x: round(element.x + dx),
        y: round(element.y + dy),
      }));
    } else if (active.kind === "resize") {
      elements =
        sourceElements.length === 1
          ? [
              resizeSingle(
                sourceElements[0],
                active.handle!,
                delta,
                event.shiftKey,
              ),
            ]
          : resizeGroup(sourceElements, active.bounds, active.handle!, delta);
    } else {
      const pivot = center(active.bounds);
      const startAngle = Math.atan2(
        active.start.y - pivot.y,
        active.start.x - pivot.x,
      );
      const currentAngle = Math.atan2(point.y - pivot.y, point.x - pivot.x);
      let angle = (currentAngle - startAngle) / RAD;
      if (event.shiftKey)
        angle =
          Math.round((active.bounds.rotation + angle) / 15) * 15 -
          active.bounds.rotation;
      elements = sourceElements.map((element) => {
        const midpoint = center(element);
        const offset = rotate(
          { x: midpoint.x - pivot.x, y: midpoint.y - pivot.y },
          angle,
        );
        return {
          ...element,
          x: round(pivot.x + offset.x - element.width / 2),
          y: round(pivot.y + offset.y - element.height / 2),
          rotation: round((((element.rotation + angle) % 360) + 360) % 360),
        };
      });
    }
    const replacements = new Map(
      elements.map((element) => [element.id, bounded(element)]),
    );
    active.latest = {
      ...active.source,
      elements: active.source.elements.map(
        (element) => replacements.get(element.id) ?? element,
      ),
    };
    setLive(active.latest);
  }

  function end(cancel = false) {
    const active = gesture.current;
    if (!active) return;
    gesture.current = null;
    if (active.capture.hasPointerCapture(active.pointer))
      active.capture.releasePointerCapture(active.pointer);
    setLive(null);
    setGuides({ x: false, y: false });
    if (!cancel && active.moved && !disabled) {
      const next = mergeGesture(scene, active);
      if (next !== scene) onChange(next);
    }
  }

  // Editing uses the same typography and box styles as the saved renderer.
  // Hide only the saved text beneath the plaintext contenteditable surface.
  const displayScene = editingId
    ? {
        ...currentScene,
        elements: currentScene.elements.map((element) =>
          element.id === editingId ? { ...element, opacity: 0 } : element,
        ),
      }
    : currentScene;

  return (
    <div
      ref={root}
      className={`te-canvas-editor${disabled ? " is-disabled" : ""}${live ? " is-transforming" : ""}${selectionArea ? " is-selecting" : ""}`}
      style={{ width, height }}
      role="region"
      aria-label="Design canvas"
      tabIndex={0}
      onPointerDown={beginMarquee}
      onContextMenu={openContextMenu}
      onPointerMove={move}
      onPointerUp={(event) => {
        if (gesture.current?.pointer === event.pointerId) end();
        if (marquee.current?.pointer === event.pointerId) endMarquee();
      }}
      onPointerCancel={() => { end(true); endMarquee(true); }}
      onLostPointerCapture={() => { end(true); endMarquee(true); }}
      onKeyDown={(event) => {
        if (gesture.current || marquee.current) {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            end(true);
            endMarquee(true);
          }
          return;
        }
        if (
          event.key === "Enter" &&
          event.target === event.currentTarget &&
          selected.length === 1 &&
          selected[0].type === "text"
        ) {
          event.preventDefault();
          event.stopPropagation();
          startEditing(selected[0]);
        }
      }}
    >
      <SceneRenderer scene={displayScene} />
      <div className="te-canvas-hit-area" aria-label="Canvas layers">
        {currentScene.elements.map((element) => (
          <div
            key={element.id}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label={`${element.name || element.type} layer${element.locked ? ", locked" : ""}`}
            aria-pressed={selectedIds.includes(element.id)}
            aria-disabled={disabled}
            className={`te-canvas-hit${element.locked ? " is-locked" : ""}${selectedIds.includes(element.id) ? " is-selected" : ""}`}
            data-layer-id={element.id}
            title={element.locked ? `${element.name || element.type} · Locked` : `${element.name || element.type} · Drag to move${element.type === "text" ? " · Double-click to edit" : ""} · Right-click for actions`}
            style={boxStyle(element)}
            onPointerDown={(event) => selectElement(event, element)}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              startEditing(element);
            }}
            onKeyDown={(event) => {
              if (disabled) return;
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                if (event.key === "Enter" && selectedIds.includes(element.id))
                  startEditing(element);
                else
                  onSelect(
                    event.shiftKey
                      ? selectedIds.includes(element.id)
                        ? selectedIds.filter((id) => id !== element.id)
                        : [...selectedIds, element.id]
                      : [element.id],
                  );
              }
            }}
          />
        ))}
      </div>
      {editingElement && (
        <div
          className="te-canvas-edit-box"
          style={{
            ...boxStyle(editingElement),
            opacity: editingElement.opacity,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <div
            key={editingElement.id}
            ref={editingNode}
            className={`te-canvas-text te-canvas-edit-text gf-font-${editingElement.font}`}
            style={textStyle(editingElement)}
            contentEditable={!disabled}
            suppressContentEditableWarning
            role="textbox"
            aria-label="Edit text"
            aria-multiline="true"
            spellCheck
            onInput={() => updateEditing()}
            onBlur={(event) => {
              if (event.relatedTarget instanceof Element && event.relatedTarget.closest('[role="menu"]')) return;
              finishEditing();
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (
                (event.metaKey || event.ctrlKey) &&
                ["b", "i", "u"].includes(event.key.toLowerCase())
              )
                event.preventDefault();
              if (event.key === "Escape") {
                event.preventDefault();
                finishEditing(true);
                root.current?.focus({ preventScroll: true });
              }
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                finishEditing();
                root.current?.focus({ preventScroll: true });
              }
            }}
            onPaste={(event) => {
              event.preventDefault();
              const text = event.clipboardData
                .getData("text/plain")
                .slice(0, 20_000);
              // insertText preserves the browser's native text undo history.
              // The Range fallback remains plaintext on browsers without it.
              if (document.execCommand("insertText", false, text)) return;
              const selection = window.getSelection();
              if (!selection?.rangeCount) return;
              const range = selection.getRangeAt(0);
              if (!editingNode.current?.contains(range.commonAncestorContainer))
                return;
              range.deleteContents();
              const textNode = document.createTextNode(text);
              range.insertNode(textNode);
              range.setStartAfter(textNode);
              range.collapse(true);
              selection.removeAllRanges();
              selection.addRange(range);
              updateEditing();
            }}
          >
            {editingSeed}
          </div>
        </div>
      )}
      {selected.length > 1 &&
        selected.map((element) => (
          <div
            key={element.id}
            className="te-canvas-outline is-member"
            style={boxStyle(element)}
          />
        ))}
      {selectionBox && (
        <div
          className={`te-canvas-outline${selected.some((element) => element.locked) ? " is-locked" : ""}`}
          data-canvas-selection="true"
          style={boxStyle(selectionBox)}
        >
          {!selectionArea && (
            <span className="te-canvas-layer-label">
              {selected.length === 1 ? `${selected[0].locked ? "Locked · " : ""}${selected[0].name || selected[0].type}` : `${selected.length} layers selected`}
            </span>
          )}
          {!disabled &&
            !editingId &&
            !selectionArea &&
            selected.every((element) => !element.locked) && (
              <>
                {(selected.length > 1
                  ? HANDLES.filter((handle) => handle.length === 2)
                  : HANDLES
                ).map((handle) => (
                  <button
                    key={handle}
                    type="button"
                    className={`te-canvas-handle te-canvas-handle-${handle}`}
                    aria-label={`Resize ${HANDLE_NAMES[handle]}`}
                    title={`Resize ${HANDLE_NAMES[handle]} · Shift preserves proportions`}
                    onPointerDown={(event) =>
                      begin(event, "resize", selectedIds, handle)
                    }
                  />
                ))}
                <span className="te-canvas-rotate-line" />
                <button
                  type="button"
                  className="te-canvas-rotate"
                  aria-label="Rotate selection"
                  title="Rotate · Shift snaps to 15°"
                  onPointerDown={(event) => begin(event, "rotate", selectedIds)}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                  >
                    <path
                      d="M13 7a5 5 0 1 0-1 4M13 3v4H9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </>
            )}
        </div>
      )}
      {selectionArea && <div className="te-canvas-marquee" style={boxStyle(selectionArea)} aria-hidden>
        <span>{selected.length} selected</span>
      </div>}
      {guides.x && (
        <div
          className="te-canvas-guide te-canvas-guide-x"
          style={{ left: width / 2 }}
        />
      )}
      {guides.y && (
        <div
          className="te-canvas-guide te-canvas-guide-y"
          style={{ top: height / 2 }}
        />
      )}
      <span className="te-canvas-screen-reader">
        Drag layers to move them. Drag empty canvas to select layers. Hold Shift
        to add to the selection. Double-click text to edit. Right-click for
        actions. Escape cancels a transformation or selection.
      </span>
    </div>
  );
}
