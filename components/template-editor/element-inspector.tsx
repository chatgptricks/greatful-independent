"use client";

import { useState, type ReactNode } from "react";
import { CopyIcon, TrashIcon } from "@/components/grateful-future/icons";
import type {
  CanvasElement,
  CanvasScene,
  ImageElement,
  ShapeElement,
  TextElement,
} from "@/lib/template-editor/model";
import { ColorField, FontSelect, Range } from "./controls";
import "./element-inspector.css";

type Props = {
  scene: CanvasScene;
  selectedIds: string[];
  onChange: (scene: CanvasScene, group?: string) => void;
  onSelect: (ids: string[]) => void;
  /** Canvas dimensions in the model's 360px-wide coordinate system. */
  width: number;
  height: number;
  disabled?: boolean;
};

const OUTPUT_SCALE = 3;
const MAX_ELEMENTS = 100;
const px = (value: number | undefined) =>
  value === undefined ? undefined : Number((value * OUTPUT_SCALE).toFixed(2));
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function shared<T, K extends keyof T>(items: T[], key: K): T[K] | undefined {
  const first = items[0]?.[key];
  return items.every((item) => item[key] === first) ? first : undefined;
}

function NumberField({
  label,
  value,
  min = -30000,
  max = 30000,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number | undefined;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const formatted = value === undefined ? "" : String(Number(value.toFixed(2)));
  return (
    <label className="te-field te-element-number">
      <span>
        {label}
        {unit && <small>{unit}</small>}
      </span>
      <input
        type="number"
        aria-label={label}
        placeholder="Mixed"
        value={editing ? draft : formatted}
        min={min}
        max={max}
        step={step}
        onFocus={() => {
          setDraft(formatted);
          setEditing(true);
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          event.stopPropagation();
        }}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          if (text !== "" && Number.isFinite(Number(text))) {
            onChange(clamp(Number(text), min, max));
          }
        }}
      />
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="te-element-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Toggle({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={active ? "is-active" : ""}
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function AlignIcon({ align }: { align: "left" | "center" | "right" }) {
  const x = align === "left" ? 4 : align === "right" ? 10 : 7;
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden
    >
      <path d={`M4 5h16M${x} 10h10M4 15h16M${x} 20h10`} />
    </svg>
  );
}

function PageAlignIcon({
  align,
}: {
  align: "left" | "center" | "right" | "top" | "middle" | "bottom";
}) {
  const paths = {
    left: "M4 3v18M8 6h12v4H8zM8 14h8v4H8z",
    center: "M12 3v18M4 6h16v4H4zM7 14h10v4H7z",
    right: "M20 3v18M4 6h12v4H4zM8 14h8v4H8z",
    top: "M3 4h18M6 8h4v12H6zM14 8h4v8h-4z",
    middle: "M3 12h18M6 4h4v16H6zM14 7h4v10h-4z",
    bottom: "M3 20h18M6 4h4v12H6zM14 8h4v8h-4z",
  };
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={paths[align]} />
    </svg>
  );
}

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden
    >
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d={locked ? "M8 10V6a4 4 0 0 1 8 0v4" : "M8 10V6a4 4 0 0 1 8 0"} />
    </svg>
  );
}

export function ElementInspector({
  scene,
  selectedIds,
  onChange,
  onSelect,
  width,
  height,
  disabled = false,
}: Props) {
  const selected = new Set(selectedIds);
  const elements = scene.elements.filter((element) => selected.has(element.id));
  const editable = elements.filter((element) => !element.locked);
  const displayed = editable.length ? editable : elements;
  const texts = displayed.filter(
    (element): element is TextElement => element.type === "text",
  );
  const images = displayed.filter(
    (element): element is ImageElement => element.type === "image",
  );
  const shapes = displayed.filter(
    (element): element is ShapeElement => element.type === "shape",
  );
  const editableIds = new Set(editable.map((element) => element.id));
  const groupPrefix = `inspector:${editable.map((element) => element.id).join(",")}`;
  const allLocked = elements.length > 0 && editable.length === 0;
  const hasLocked = editable.length !== elements.length;
  const noEdits = disabled || allLocked;

  function update(
    group: string,
    transform: (element: CanvasElement) => CanvasElement,
  ) {
    if (noEdits) return;
    onChange(
      {
        ...scene,
        elements: scene.elements.map((element) =>
          editableIds.has(element.id) ? transform(element) : element,
        ),
      },
      `${groupPrefix}:${group}`,
    );
  }

  function updateText(patch: Partial<TextElement>, group: string) {
    update(group, (element) =>
      element.type === "text" ? { ...element, ...patch } : element,
    );
  }

  function updateImage(patch: Partial<ImageElement>, group: string) {
    update(group, (element) =>
      element.type === "image" ? { ...element, ...patch } : element,
    );
  }

  function updateShape(patch: Partial<ShapeElement>, group: string) {
    update(group, (element) =>
      element.type === "shape" ? { ...element, ...patch } : element,
    );
  }

  function alignToPage(
    align: "left" | "center" | "right" | "top" | "middle" | "bottom",
  ) {
    update(`align-${align}`, (element) => {
      // Align the visible bounds, including the size introduced by rotation.
      const angle = (element.rotation * Math.PI) / 180;
      const visualWidth =
        Math.abs(element.width * Math.cos(angle)) +
        Math.abs(element.height * Math.sin(angle));
      const visualHeight =
        Math.abs(element.width * Math.sin(angle)) +
        Math.abs(element.height * Math.cos(angle));
      const insetX = (element.width - visualWidth) / 2;
      const insetY = (element.height - visualHeight) / 2;
      if (align === "left")
        return { ...element, x: clamp(-insetX, -10000, 10000) };
      if (align === "center")
        return {
          ...element,
          x: clamp((width - element.width) / 2, -10000, 10000),
        };
      if (align === "right")
        return {
          ...element,
          x: clamp(width - element.width + insetX, -10000, 10000),
        };
      if (align === "top")
        return { ...element, y: clamp(-insetY, -10000, 10000) };
      if (align === "middle")
        return {
          ...element,
          y: clamp((height - element.height) / 2, -10000, 10000),
        };
      return {
        ...element,
        y: clamp(height - element.height + insetY, -10000, 10000),
      };
    });
  }

  function reorder(direction: "forward" | "backward") {
    if (noEdits) return;
    const next = [...scene.elements];
    // Move each selected block one step while preserving its relative order.
    if (direction === "forward") {
      for (let index = next.length - 2; index >= 0; index--) {
        if (
          editableIds.has(next[index].id) &&
          !editableIds.has(next[index + 1].id)
        ) {
          [next[index], next[index + 1]] = [next[index + 1], next[index]];
        }
      }
    } else {
      for (let index = 1; index < next.length; index++) {
        if (
          editableIds.has(next[index].id) &&
          !editableIds.has(next[index - 1].id)
        ) {
          [next[index], next[index - 1]] = [next[index - 1], next[index]];
        }
      }
    }
    if (next.some((element, index) => element !== scene.elements[index])) {
      onChange({ ...scene, elements: next });
    }
  }

  function duplicate() {
    if (noEdits || scene.elements.length + editable.length > MAX_ELEMENTS)
      return;
    const copies = editable.map((element) => ({
      ...element,
      id: crypto.randomUUID(),
      name: `${element.name.slice(0, 195)} copy`,
      x: Math.min(10000, element.x + 12),
      y: Math.min(10000, element.y + 12),
    }));
    onChange({ ...scene, elements: [...scene.elements, ...copies] });
    onSelect(copies.map((element) => element.id));
  }

  function toggleLock() {
    if (disabled) return;
    // A mixed selection locks the remaining editable elements; the next click unlocks all.
    onChange({
      ...scene,
      elements: scene.elements.map((element) =>
        selected.has(element.id) ? { ...element, locked: !allLocked } : element,
      ),
    });
  }

  function remove() {
    if (noEdits) return;
    onChange({
      ...scene,
      elements: scene.elements.filter(
        (element) => !editableIds.has(element.id),
      ),
    });
    onSelect(
      elements.filter((element) => element.locked).map((element) => element.id),
    );
  }

  const commonFont = shared(texts, "font");
  const commonWeight = shared(texts, "fontWeight");
  const commonItalic = shared(texts, "italic");
  const commonUnderline = shared(texts, "underline");
  const canForward = scene.elements.some(
    (element, index) =>
      editableIds.has(element.id) &&
      index < scene.elements.length - 1 &&
      !editableIds.has(scene.elements[index + 1].id),
  );
  const canBackward = scene.elements.some(
    (element, index) =>
      editableIds.has(element.id) &&
      index > 0 &&
      !editableIds.has(scene.elements[index - 1].id),
  );
  const canDuplicate = scene.elements.length + editable.length <= MAX_ELEMENTS;
  const pageAlignLabels = {
    left: "Align left",
    center: "Center horizontally",
    right: "Align right",
    top: "Align top",
    middle: "Center vertically",
    bottom: "Align bottom",
  };

  return (
    <aside
      className="te-element-inspector"
      aria-label="Element properties"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <header className="te-element-heading">
        <div>
          <span className="te-eyebrow">
            {elements.length ? "SELECTION" : "CANVAS"}
          </span>
          <h2>
            {elements.length > 1
              ? `${elements.length} elements`
              : elements[0]?.name || "Page settings"}
          </h2>
        </div>
        {elements.length > 0 && (
          <div className="te-element-heading-actions">
            <button
              type="button"
              className="te-icon"
              aria-label={
                allLocked
                  ? "Unlock selected elements"
                  : "Lock selected elements"
              }
              title={allLocked ? "Unlock selection" : "Lock selection"}
              disabled={disabled}
              onClick={toggleLock}
            >
              <LockIcon locked={allLocked} />
            </button>
            <button
              type="button"
              className="te-icon"
              aria-label="Clear selection"
              title="Clear selection"
              onClick={() => onSelect([])}
            >
              ×
            </button>
          </div>
        )}
      </header>

      {!elements.length ? (
        <>
          <fieldset disabled={disabled}>
            <Section title="Page">
              <ColorField
                label="Background"
                value={scene.background}
                onChange={(background) =>
                  onChange({ ...scene, background }, "page-background")
                }
              />
              <p className="te-element-hint">
                {Math.round(width * OUTPUT_SCALE)} ×{" "}
                {Math.round(height * OUTPUT_SCALE)} px
              </p>
            </Section>
          </fieldset>
          <div className="te-element-empty">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              aria-hidden
            >
              <path d="m5 3 14 10-7 1-3 7z" />
            </svg>
            <strong>Make it yours</strong>
            <p>
              Select an element to edit its style, size, and position.
              Double-click text to write directly on the canvas.
            </p>
            <p>
              Shift-click to select more. Drag to move; use the corner handles
              to resize.
            </p>
          </div>
        </>
      ) : (
        <>
          {hasLocked && (
            <p className="te-element-lock-note">
              <LockIcon locked />
              {allLocked
                ? "Unlock to edit this selection."
                : "Locked elements stay unchanged."}
            </p>
          )}

          <fieldset disabled={noEdits}>
            {elements.length === 1 && (
              <label className="te-field te-element-name">
                Layer name
                <input
                  value={elements[0].name}
                  maxLength={120}
                  onChange={(event) =>
                    update("name", (element) => ({
                      ...element,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
            )}

            {texts.length > 0 && (
              <Section
                title={
                  texts.length === elements.length
                    ? "Text"
                    : `Text · ${texts.length}`
                }
              >
                {texts.length === 1 && (
                  <label className="te-field">
                    Text content
                    <textarea
                      rows={3}
                      maxLength={20000}
                      value={texts[0].text}
                      onChange={(event) =>
                        updateText({ text: event.target.value }, "text")
                      }
                    />
                  </label>
                )}
                <FontSelect
                  value={commonFont ?? ""}
                  onChange={(font) => updateText({ font }, "font")}
                />
                {commonFont === undefined && (
                  <p className="te-element-mixed">Multiple typefaces</p>
                )}
                <div className="te-element-grid">
                  <NumberField
                    label="Font size"
                    unit="px"
                    min={3}
                    max={1500}
                    value={px(shared(texts, "fontSize"))}
                    onChange={(value) =>
                      updateText(
                        { fontSize: value / OUTPUT_SCALE },
                        "font-size",
                      )
                    }
                  />
                  <NumberField
                    label="Line spacing"
                    min={0.5}
                    max={5}
                    step={0.05}
                    value={shared(texts, "lineHeight")}
                    onChange={(lineHeight) =>
                      updateText({ lineHeight }, "line-height")
                    }
                  />
                </div>
                <NumberField
                  label="Letter spacing"
                  unit="px"
                  min={-60}
                  max={300}
                  step={0.1}
                  value={px(shared(texts, "letterSpacing"))}
                  onChange={(value) =>
                    updateText(
                      { letterSpacing: value / OUTPUT_SCALE },
                      "letter-spacing",
                    )
                  }
                />
                <div
                  className="te-element-segments te-element-type-tools"
                  role="group"
                  aria-label="Text styling"
                >
                  <Toggle
                    label="Bold"
                    active={commonWeight !== undefined && commonWeight >= 600}
                    onClick={() =>
                      updateText(
                        {
                          fontWeight:
                            commonWeight !== undefined && commonWeight >= 600
                              ? 400
                              : 700,
                        },
                        "bold",
                      )
                    }
                  >
                    <b>B</b>
                  </Toggle>
                  <Toggle
                    label="Italic"
                    active={commonItalic === true}
                    onClick={() =>
                      updateText({ italic: commonItalic !== true }, "italic")
                    }
                  >
                    <i>I</i>
                  </Toggle>
                  <Toggle
                    label="Underline"
                    active={commonUnderline === true}
                    onClick={() =>
                      updateText(
                        { underline: commonUnderline !== true },
                        "underline",
                      )
                    }
                  >
                    <u>U</u>
                  </Toggle>
                  <button
                    type="button"
                    aria-label="Uppercase"
                    title="Uppercase"
                    onClick={() =>
                      update("uppercase", (element) =>
                        element.type === "text"
                          ? { ...element, text: element.text.toUpperCase() }
                          : element,
                      )
                    }
                  >
                    AA
                  </button>
                  <button
                    type="button"
                    aria-label="Lowercase"
                    title="Lowercase"
                    onClick={() =>
                      update("lowercase", (element) =>
                        element.type === "text"
                          ? { ...element, text: element.text.toLowerCase() }
                          : element,
                      )
                    }
                  >
                    aa
                  </button>
                </div>
                <div
                  className="te-element-segments"
                  role="group"
                  aria-label="Text alignment"
                >
                  {(["left", "center", "right"] as const).map((align) => (
                    <Toggle
                      key={align}
                      label={`Align text ${align}`}
                      active={shared(texts, "align") === align}
                      onClick={() => updateText({ align }, "text-align")}
                    >
                      <AlignIcon align={align} />
                    </Toggle>
                  ))}
                </div>
                <ColorField
                  label="Text color"
                  value={shared(texts, "color") ?? "Mixed"}
                  onChange={(color) => updateText({ color }, "text-color")}
                />
              </Section>
            )}

            {images.length > 0 && (
              <Section
                title={
                  images.length === elements.length
                    ? "Image"
                    : `Images · ${images.length}`
                }
              >
                <div
                  className="te-element-segments"
                  role="group"
                  aria-label="Image fit"
                >
                  <Toggle
                    label="Fill image frame"
                    active={shared(images, "fit") === "cover"}
                    onClick={() => updateImage({ fit: "cover" }, "image-fit")}
                  >
                    Fill frame
                  </Toggle>
                  <Toggle
                    label="Fit entire image"
                    active={shared(images, "fit") === "contain"}
                    onClick={() => updateImage({ fit: "contain" }, "image-fit")}
                  >
                    Fit image
                  </Toggle>
                </div>
                <Range
                  label={
                    shared(images, "cropX") === undefined
                      ? "Horizontal crop · Mixed"
                      : "Horizontal crop"
                  }
                  value={shared(images, "cropX") ?? 50}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(cropX) => updateImage({ cropX }, "crop-x")}
                />
                <Range
                  label={
                    shared(images, "cropY") === undefined
                      ? "Vertical crop · Mixed"
                      : "Vertical crop"
                  }
                  value={shared(images, "cropY") ?? 50}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(cropY) => updateImage({ cropY }, "crop-y")}
                />
                <NumberField
                  label="Corner radius"
                  unit="px"
                  min={0}
                  max={1080}
                  value={px(shared(images, "radius"))}
                  onChange={(value) =>
                    updateImage(
                      { radius: value / OUTPUT_SCALE },
                      "image-radius",
                    )
                  }
                />
              </Section>
            )}

            {shapes.length > 0 && (
              <Section
                title={
                  shapes.length === elements.length
                    ? "Shape"
                    : `Shapes · ${shapes.length}`
                }
              >
                <div
                  className="te-element-segments"
                  role="group"
                  aria-label="Shape type"
                >
                  <Toggle
                    label="Rectangle"
                    active={shared(shapes, "shape") === "rectangle"}
                    onClick={() =>
                      updateShape({ shape: "rectangle" }, "shape-type")
                    }
                  >
                    Rectangle
                  </Toggle>
                  <Toggle
                    label="Ellipse"
                    active={shared(shapes, "shape") === "ellipse"}
                    onClick={() =>
                      updateShape({ shape: "ellipse" }, "shape-type")
                    }
                  >
                    Ellipse
                  </Toggle>
                </div>
                <ColorField
                  label="Fill"
                  value={shared(shapes, "fill") ?? "Mixed"}
                  onChange={(fill) => updateShape({ fill }, "shape-fill")}
                />
                <ColorField
                  label="Border color"
                  value={shared(shapes, "stroke") ?? "Mixed"}
                  onChange={(stroke) => updateShape({ stroke }, "shape-stroke")}
                />
                <div className="te-element-grid">
                  <NumberField
                    label="Border width"
                    unit="px"
                    min={0}
                    max={90}
                    value={px(shared(shapes, "strokeWidth"))}
                    onChange={(value) =>
                      updateShape(
                        { strokeWidth: value / OUTPUT_SCALE },
                        "stroke-width",
                      )
                    }
                  />
                  <NumberField
                    label="Corner radius"
                    unit="px"
                    min={0}
                    max={1080}
                    value={px(shared(shapes, "radius"))}
                    onChange={(value) =>
                      updateShape(
                        { radius: value / OUTPUT_SCALE },
                        "shape-radius",
                      )
                    }
                  />
                </div>
              </Section>
            )}

            <Section title="Position & size">
              <div className="te-element-grid">
                <NumberField
                  label="X"
                  unit="px"
                  value={px(shared(displayed, "x"))}
                  onChange={(value) =>
                    update("x", (element) => ({
                      ...element,
                      x: value / OUTPUT_SCALE,
                    }))
                  }
                />
                <NumberField
                  label="Y"
                  unit="px"
                  value={px(shared(displayed, "y"))}
                  onChange={(value) =>
                    update("y", (element) => ({
                      ...element,
                      y: value / OUTPUT_SCALE,
                    }))
                  }
                />
                <NumberField
                  label="Width"
                  unit="px"
                  min={3}
                  max={30000}
                  value={px(shared(displayed, "width"))}
                  onChange={(value) =>
                    update("width", (element) => ({
                      ...element,
                      width: value / OUTPUT_SCALE,
                    }))
                  }
                />
                <NumberField
                  label="Height"
                  unit="px"
                  min={3}
                  max={30000}
                  value={px(shared(displayed, "height"))}
                  onChange={(value) =>
                    update("height", (element) => ({
                      ...element,
                      height: value / OUTPUT_SCALE,
                    }))
                  }
                />
                <NumberField
                  label="Rotation"
                  unit="°"
                  min={-3600}
                  max={3600}
                  value={shared(displayed, "rotation")}
                  onChange={(rotation) =>
                    update("rotation", (element) => ({ ...element, rotation }))
                  }
                />
                <NumberField
                  label="Opacity"
                  unit="%"
                  min={0}
                  max={100}
                  value={
                    shared(displayed, "opacity") === undefined
                      ? undefined
                      : shared(displayed, "opacity")! * 100
                  }
                  onChange={(value) =>
                    update("opacity", (element) => ({
                      ...element,
                      opacity: value / 100,
                    }))
                  }
                />
              </div>
              <span className="te-element-label">Align to page</span>
              <div
                className="te-element-segments te-element-align"
                role="group"
                aria-label="Align to page"
              >
                {(
                  [
                    "left",
                    "center",
                    "right",
                    "top",
                    "middle",
                    "bottom",
                  ] as const
                ).map((align) => (
                  <button
                    key={align}
                    type="button"
                    aria-label={pageAlignLabels[align]}
                    title={pageAlignLabels[align]}
                    onClick={() => alignToPage(align)}
                  >
                    <PageAlignIcon align={align} />
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Arrange">
              <div className="te-element-grid te-element-actions">
                <button
                  type="button"
                  disabled={!canBackward}
                  onClick={() => reorder("backward")}
                  title="Send backward one layer"
                >
                  <span aria-hidden>↓</span> Backward
                </button>
                <button
                  type="button"
                  disabled={!canForward}
                  onClick={() => reorder("forward")}
                  title="Bring forward one layer"
                >
                  <span aria-hidden>↑</span> Forward
                </button>
                <button
                  type="button"
                  disabled={!canDuplicate}
                  title={
                    canDuplicate
                      ? "Duplicate selection"
                      : "A page can contain up to 100 elements"
                  }
                  onClick={duplicate}
                >
                  <CopyIcon /> Duplicate
                </button>
                <button
                  type="button"
                  className="te-element-delete"
                  onClick={remove}
                >
                  <TrashIcon /> Delete
                </button>
              </div>
            </Section>
          </fieldset>
          <button
            type="button"
            className="te-element-lock"
            disabled={disabled}
            onClick={toggleLock}
          >
            <LockIcon locked={allLocked} />
            {allLocked ? "Unlock selection" : "Lock selection"}
          </button>
        </>
      )}
    </aside>
  );
}
