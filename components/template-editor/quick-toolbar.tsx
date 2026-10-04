"use client";

import type { MouseEvent } from "react";
import type { CanvasScene, TextElement } from "@/lib/template-editor/model";
import { FONTS } from "./controls";

export function QuickToolbar({ scene, selectedIds, disabled, onChange, onDuplicate, onDelete, onMore, onAddText, onUpload }: {
  scene: CanvasScene;
  selectedIds: string[];
  disabled: boolean;
  onChange: (scene: CanvasScene, group?: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMore: (event: MouseEvent<HTMLButtonElement>) => void;
  onAddText: () => void;
  onUpload: () => void;
}) {
  const selected = scene.elements.filter((element) => selectedIds.includes(element.id));
  const editable = selected.filter((element) => !element.locked);
  const texts = editable.filter((element): element is TextElement => element.type === "text");
  const text = texts[0];
  const locked = selected.length > 0 && editable.length === 0;
  function patchText(patch: Partial<TextElement>) {
    onChange({ ...scene, elements: scene.elements.map((element) =>
      selectedIds.includes(element.id) && !element.locked && element.type === "text"
        ? { ...element, ...patch } : element,
    ) }, "quick-text");
  }
  return <div className="te-quick-toolbar" role="toolbar" aria-label="Quick formatting" onKeyDown={(event) => {
    if ((event.target as HTMLElement).matches("input, select")) event.stopPropagation();
  }}>
    {!selected.length ? <>
      <span className="te-quick-label">Make it yours</span>
      <button disabled={disabled} onClick={onAddText}>+ Text</button>
      <button disabled={disabled} onClick={onUpload}>Upload image</button>
      <span className="te-quick-tip">Drag to select · Right-click for actions</span>
    </> : <>
      <span className="te-quick-label">{selected.length > 1 ? `${selected.length} selected` : locked ? "Locked layer" : selected[0].type === "text" ? "Text" : selected[0].type === "image" ? "Image" : "Shape"}</span>
      {text && <>
        <select aria-label="Quick font" disabled={disabled} value={text.font} onChange={(event) => patchText({ font: event.target.value })}>
          {FONTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <input aria-label="Quick font size" title="Font size in export pixels" type="number" min={3} max={1500} disabled={disabled} value={Math.round(text.fontSize * 3)} onChange={(event) => {
          const value = event.target.valueAsNumber;
          if (Number.isFinite(value) && value >= 3 && value <= 1500) patchText({ fontSize: value / 3 });
        }} />
        <button aria-label="Quick bold" title="Bold" aria-pressed={texts.every((item) => item.fontWeight >= 700)} disabled={disabled} onClick={() => patchText({fontWeight: texts.every((item) => item.fontWeight >= 700) ? 400 : 700})}><b>B</b></button>
        <button aria-label="Quick italic" title="Italic" aria-pressed={texts.every((item) => item.italic)} disabled={disabled} onClick={() => patchText({italic: !texts.every((item) => item.italic)})}><i>I</i></button>
        <button aria-label="Quick underline" title="Underline" aria-pressed={texts.every((item) => item.underline)} disabled={disabled} onClick={() => patchText({underline: !texts.every((item) => item.underline)})}><u>U</u></button>
        <button aria-label="Quick uppercase" title="Toggle uppercase" aria-pressed={texts.every((item) => item.text === item.text.toUpperCase())} disabled={disabled} onClick={() => {
          const upper = !texts.every((item) => item.text === item.text.toUpperCase());
          onChange({...scene, elements: scene.elements.map((item) => selectedIds.includes(item.id) && !item.locked && item.type === "text" ? {...item, text: (upper ? item.text.toUpperCase() : item.text.toLowerCase()).slice(0, 20_000)} : item)});
        }}>aA</button>
        <select aria-label="Quick text alignment" disabled={disabled} value={text.align} onChange={(event) => patchText({align: event.target.value as TextElement["align"]})}>
          <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
        </select>
        <input aria-label="Quick text color" title="Text color" type="color" value={text.color} disabled={disabled} onChange={(event) => patchText({color: event.target.value})} />
      </>}
      <span className="te-quick-spacer" />
      <button aria-label="Quick duplicate" title="Duplicate (⌘/Ctrl D)" disabled={disabled || !editable.length || scene.elements.length >= 100} onClick={onDuplicate}>Duplicate</button>
      <button aria-label="Quick delete" title="Delete selected" disabled={disabled || !editable.length} onClick={onDelete}>Delete</button>
    </>}
    <button aria-label="More canvas actions" title="More actions" aria-haspopup="menu" onClick={onMore}>•••</button>
  </div>;
}
