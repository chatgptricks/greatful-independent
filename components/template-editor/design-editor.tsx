"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  ImageIcon,
  LayoutIcon,
  PlusIcon,
  StarIcon,
  TextIcon,
  TrashIcon,
} from "@/components/grateful-future/icons";
import {
  FORMATS,
  designAsTemplate,
  duplicatePage,
  createCanvasElement,
  sceneForPage,
  resizeCanvasScene,
  type CanvasElement,
  type CanvasScene,
  type BrandKit,
  type SavedBrandKit,
  type BrandAsset,
  type DesignDocument,
  type DesignFormat,
  type DesignTemplate,
  type DesignPage,
} from "@/lib/template-editor/model";
import { exportFrames, fileName, saveBlob } from "@/lib/template-editor/export";
import { ColorField, Modal } from "./controls";
import { CanvasEditor } from "./canvas";
import { BrandPanel } from "./brand-panel";
import { QuickToolbar } from "./quick-toolbar";
import { useContextMenu, type ContextMenuItem } from "./context-menu";
import { copySelection, duplicateSelection, pasteSelection, removeSelection, setSelectionLocked, reorderSelection, alignSelection, type SceneCommandResult } from "@/lib/template-editor/commands";
import { ElementInspector } from "./element-inspector";
import "./wysiwyg.css";
import { DesignFrame, DesignPreview, FRAME_WIDTH } from "./preview";

type Tab =
  | "templates"
  | "brand"
  | "text"
  | "elements"
  | "media"
  | "layers"
  | "caption"
  | "style";
type Props = {
  design: DesignDocument;
  templates: DesignTemplate[];
  brand: BrandKit;
  brandKits: SavedBrandKit[];
  activeBrandKitId: string;
  onSelectBrandKit: (id: string) => void;
  onSaveBrandAsset: (asset: BrandAsset, kitId: string) => boolean | void;
  onManageBrand: () => void;
  saveStatus: string;
  canEdit: boolean;
  onChange: (design: DesignDocument) => boolean | void;
  onExit: () => void;
  onSaveTemplate: (template: DesignTemplate) => void;
};

export function DesignEditor({
  design: initial,
  templates,
  brand,
  brandKits,
  activeBrandKitId,
  onSelectBrandKit,
  onSaveBrandAsset,
  onManageBrand,
  saveStatus,
  canEdit,
  onChange,
  onExit,
  onSaveTemplate,
}: Props) {
  const { openMenu } = useContextMenu();
  const [editingRequest, setEditingRequest] = useState<{id: string; serial: number}>();
  const [renameLayer, setRenameLayer] = useState<{id: string; name: string} | null>(null);
  const [design, setDesign] = useState<DesignDocument>(initial);
  const current = useRef<DesignDocument>(design);
  const history = useRef<{
    past: DesignDocument[];
    future: DesignDocument[];
    group: string;
    time: number;
  }>({ past: [], future: [], group: "", time: 0 });
  const [historyState, setHistoryState] = useState({
    undo: false,
    redo: false,
  });
  const [pageId, setPageId] = useState(initial.pages[0].id);
  const activePage = useRef(pageId);
  useEffect(() => {
    activePage.current = pageId;
  }, [pageId]);
  const [tab, setTab] = useState<Tab>("text");
  const [selected, setSelected] = useState<string[]>([]);
  const copied = useRef<CanvasElement[]>([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [notice, setNotice] = useState("");
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [exportMenu, setExportMenu] = useState(false);
  const [job, setJob] = useState<{
    design: DesignDocument;
    pageId?: string;
  } | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [removePageId, setRemovePageId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(1);
  const [dragged, setDragged] = useState<string | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const page = design.pages.find((p) => p.id === pageId) ?? design.pages[0];
  const index = design.pages.indexOf(page);
  const format = FORMATS[design.format];
  const canvasHeight = (FRAME_WIDTH * format.height) / format.width;
  const scene = page.canvas ?? sceneForPage(page, design.format);
  const scale = Math.max(0.15, fit) * zoom;
  const isTemplateDraft = design.purpose === "template";
  const saveTemplateLabel = isTemplateDraft
    ? design.editingTemplateId
      ? "Update template"
      : "Save template"
    : "Save as template";
  const disabled = !canEdit || Boolean(job);
  const blocked = useRef(disabled);
  useEffect(() => { blocked.current = disabled; }, [disabled]);

  const commit = useCallback(
    (change: (d: DesignDocument) => DesignDocument, group = "") => {
      if (blocked.current) return false;
      const previous = current.current;
      const next = { ...change(previous), updatedAt: new Date().toISOString() };
      if (onChangeRef.current(next) === false) return false;
      const h = history.current;
      if (!group || group !== h.group || Date.now() - h.time > 650) {
        h.past.push(previous);
        if (h.past.length > 60) h.past.shift();
      }
      h.group = group;
      h.time = Date.now();
      h.future = [];
      setHistoryState({ undo: h.past.length > 0, redo: false });
      current.current = next;
      setDesign(next);
      return true;
    },
    [],
  );
  const travel = useCallback(
    (direction: "undo" | "redo") => {
      if (blocked.current) return;
      const h = history.current;
      const source = direction === "undo" ? h.past : h.future;
      const next = source.at(-1);
      if (!next) return;
      const updated = { ...next, updatedAt: new Date().toISOString() };
      if (onChangeRef.current(updated) === false) return;
      source.pop();
      (direction === "undo" ? h.future : h.past).push(current.current);
      h.group = "";
      setHistoryState({ undo: h.past.length > 0, redo: h.future.length > 0 });
      current.current = updated;
      setDesign(updated);
    },
    [],
  );
  const changeScene = useCallback(
    (next: CanvasScene, group = "") => {
      return commit(
        (d) => ({
          ...d,
          pages: d.pages.map((p) =>
            p.id === page.id ? { ...p, canvas: next } : p,
          ),
        }),
        group ? `${page.id}:${group}` : "",
      );
    },
    [commit, page.id],
  );
  function applyCommand(command: (live: CanvasScene) => SceneCommandResult) {
    if (blocked.current) return;
    const target = current.current.pages.find((item) => item.id === page.id);
    if (!target) return;
    const live = target.canvas ?? sceneForPage(target, current.current.format);
    const result = command(live);
    if (result.scene !== live && !changeScene(result.scene)) return;
    setSelected(result.selectedIds);
    if (result.limited) setNotice("This page has reached its 100-element limit.");
  }
  function copyElements(ids: string[], cut = false) {
    if (cut && blocked.current) return;
    const copyIds = cut ? ids.filter((id) => !scene.elements.find((e) => e.id === id)?.locked) : ids;
    const target = current.current.pages.find((item) => item.id === page.id);
    if (!target) return;
    copied.current = copySelection(target.canvas ?? sceneForPage(target, current.current.format), copyIds);
    if (cut) applyCommand((live) => removeSelection(live, copyIds));
    setNotice(`${copied.current.length} element${copied.current.length === 1 ? "" : "s"} ${cut ? "cut" : "copied"}. Paste on any page in this design.`);
  }
  function elementMenu(ids: string[]): ContextMenuItem[] {
    const elements = scene.elements.filter((e) => ids.includes(e.id));
    const editable = elements.filter((e) => !e.locked);
    const single = elements.length === 1 ? elements[0] : undefined;
    return [
      ...(single?.type === "text" ? [{id: "edit-text", label: "Edit text", disabled: disabled || single.locked, onSelect: () => setEditingRequest({id: single.id, serial: Date.now()})}] : []),
      {id: "copy", label: "Copy", shortcut: "⌘/Ctrl C", onSelect: () => copyElements(ids)},
      {id: "cut", label: "Cut", shortcut: "⌘/Ctrl X", disabled: disabled || !editable.length, onSelect: () => copyElements(ids, true)},
      {id: "duplicate", label: "Duplicate", shortcut: "⌘/Ctrl D", disabled: disabled || !editable.length || scene.elements.length >= 100, onSelect: () => applyCommand((live) => duplicateSelection(live, ids))},
      {id: "paste", label: "Paste", shortcut: "⌘/Ctrl V", disabled: disabled || !copied.current.length || scene.elements.length >= 100, onSelect: () => applyCommand((live) => pasteSelection(live, copied.current))},
      {id: "front", label: "Bring to front", separator: true, disabled: disabled || !editable.length, onSelect: () => applyCommand((live) => reorderSelection(live, ids, "front"))},
      {id: "forward", label: "Bring forward", shortcut: "⌘/Ctrl ]", disabled: disabled || !editable.length, onSelect: () => applyCommand((live) => reorderSelection(live, ids, "forward"))},
      {id: "backward", label: "Send backward", shortcut: "⌘/Ctrl [", disabled: disabled || !editable.length, onSelect: () => applyCommand((live) => reorderSelection(live, ids, "backward"))},
      {id: "back", label: "Send to back", disabled: disabled || !editable.length, onSelect: () => applyCommand((live) => reorderSelection(live, ids, "back"))},
      {id: "center", label: "Center horizontally on page", separator: true, disabled: disabled || !editable.length, onSelect: () => applyCommand((live) => alignSelection(live, ids, "center", {width: FRAME_WIDTH, height: canvasHeight}, "group"))},
      {id: "middle", label: "Center vertically on page", disabled: disabled || !editable.length, onSelect: () => applyCommand((live) => alignSelection(live, ids, "middle", {width: FRAME_WIDTH, height: canvasHeight}, "group"))},
      {id: "lock", label: editable.length ? "Lock" : "Unlock", separator: true, disabled, onSelect: () => applyCommand((live) => setSelectionLocked(live, ids, editable.length > 0))},
      ...(single ? [{id: "rename", label: "Rename layer", disabled, onSelect: () => setRenameLayer({id: single.id, name: single.name})}] : []),
      ...(single?.type === "image" ? [{id:"save-brand", label:"Save image to brand kit", disabled:disabled || (brandKits.find((kit) => kit.id === activeBrandKitId)?.assets.length ?? 0) >= 40, onSelect:() => {
        if (blocked.current) return;
        if (onSaveBrandAsset({id:crypto.randomUUID(),name:single.name,src:single.src,width:single.width,height:single.height,kind:"image"}, activeBrandKitId) === false) return;
        setNotice("Image saved to your brand kit. Reuse it from the Brand tab.");
      }}] : []),
      {id: "properties", label: "Show properties", onSelect: () => setTab("style")},
      {id: "delete", label: "Delete", shortcut: "⌫", separator: true, danger: true, disabled: disabled || !editable.length, onSelect: () => applyCommand((live) => removeSelection(live, ids))},
    ];
  }
  function canvasMenu(event: React.MouseEvent, targetId: string | null) {
    const ids = targetId ? (selected.includes(targetId) ? selected : [targetId]) : [];
    setSelected(ids);
    const rect = event.currentTarget.closest(".te-free-stage")?.getBoundingClientRect();
    const position = rect ? {x: Math.max(0, (event.clientX - rect.left) / scale), y: Math.max(0, (event.clientY - rect.top) / scale)} : undefined;
    openMenu(event, {
      label: ids.length > 1 ? `${ids.length} selected elements` : ids.length ? scene.elements.find((e) => e.id === ids[0])?.name ?? "Element" : "Canvas",
      items: ids.length ? elementMenu(ids) : [
        {id: "paste", label: "Paste here", shortcut: "⌘/Ctrl V", disabled: disabled || !copied.current.length || scene.elements.length >= 100, onSelect: () => applyCommand((live) => pasteSelection(live, copied.current, position))},
        {id: "text", label: "Add text", shortcut: "T", disabled, onSelect: () => addText()},
        {id: "shape", label: "Add rectangle", shortcut: "R", disabled, onSelect: () => addShape("rectangle")},
        {id: "image", label: "Upload image", disabled: disabled || uploading, onSelect: () => fileRef.current?.click()},
        {id: "select", label: "Select all unlocked elements", shortcut: "⌘/Ctrl A", separator: true, disabled: !scene.elements.some((e) => !e.locked), onSelect: () => setSelected(scene.elements.filter((e) => !e.locked).map((e) => e.id))},
        {id: "background", label: "Page background & properties", onSelect: () => setTab("style")},
        {id: "undo", label: "Undo", shortcut: "⌘/Ctrl Z", separator: true, disabled: disabled || !historyState.undo, onSelect: () => travel("undo")},
        {id: "redo", label: "Redo", shortcut: "⌘/Ctrl ⇧ Z", disabled: disabled || !historyState.redo, onSelect: () => travel("redo")},
      ],
    });
  }
  function pageMenu(event: React.MouseEvent, target: DesignPage) {
    const targetIndex = design.pages.findIndex((p) => p.id === target.id);
    openMenu(event, {label: `Page ${targetIndex + 1}`, items: [
      {id: "open-page", label: "Go to page", onSelect: () => {setPageId(target.id); setSelected([]);}},
      {id: "duplicate-page", label: "Duplicate page", disabled: disabled || design.pages.length >= 20, onSelect: () => addPage(true, target)},
      {id: "add-page", label: "Add blank page after", disabled: disabled || design.pages.length >= 20, onSelect: () => addPage(false, target)},
      {id: "left", label: "Move page left", separator: true, disabled: disabled || targetIndex === 0, onSelect: () => movePage(targetIndex, targetIndex - 1)},
      {id: "right", label: "Move page right", disabled: disabled || targetIndex === design.pages.length - 1, onSelect: () => movePage(targetIndex, targetIndex + 1)},
      {id: "export-page", label: "Download page as PNG", separator: true, disabled: Boolean(job) || uploading, onSelect: () => setJob({design: structuredClone(design), pageId: target.id})},
      {id: "delete-page", label: "Delete page", danger: true, separator: true, disabled: disabled || design.pages.length <= 1, onSelect: () => setRemovePageId(target.id)},
    ]});
  }
  function workspaceMenu(event: React.MouseEvent) {
    openMenu(event, {label: design.name || "Design workspace", items: [
      {id: "undo", label: "Undo", shortcut: "⌘/Ctrl Z", disabled: disabled || !historyState.undo, onSelect: () => travel("undo")},
      {id: "redo", label: "Redo", shortcut: "⌘/Ctrl ⇧ Z", disabled: disabled || !historyState.redo, onSelect: () => travel("redo")},
      {id: "paste", label: "Paste elements", shortcut: "⌘/Ctrl V", disabled: disabled || !copied.current.length, onSelect: () => applyCommand((live) => pasteSelection(live, copied.current))},
      {id: "add", label: "Add blank page", separator: true, disabled: disabled || design.pages.length >= 20, onSelect: () => addPage()},
      {id: "template", label: saveTemplateLabel, disabled, onSelect: () => setTemplateName(design.name)},
      {id: "fit", label: "Fit to workspace", separator: true, onSelect: () => setZoom(1)},
      {id: "layers", label: "Show layers", onSelect: () => setTab("layers")},
      {id: "help", label: "Keyboard shortcuts", onSelect: () => setShowShortcuts(true)},
    ]});
  }
  function addElement(element: CanvasElement) {
    const target = current.current.pages.find((item) => item.id === page.id);
    if (!target) return;
    const live = target.canvas ?? sceneForPage(target, current.current.format);
    if (live.elements.length >= 100) {
      setNotice("Each page supports up to 100 elements.");
      return;
    }
    if (!changeScene({ ...live, elements: [...live.elements, element] })) return;
    setSelected([element.id]);
  }
  const addText = (size = 28, text = "Add your text") =>
    addElement(
      createCanvasElement("text", {
        text,
        name: text,
        x: 32,
        y: canvasHeight / 2 - 40,
        width: 296,
        height: Math.max(60, size * 2.6),
        font: brand.font,
        fontSize: size,
        fontWeight: size >= 24 ? 700 : 400,
        color: brand.text,
      }),
    );
  const addShape = (shape: "rectangle" | "ellipse", line = false) =>
    addElement(
      createCanvasElement("shape", {
        shape,
        name: line ? "Line" : shape === "ellipse" ? "Circle" : "Rectangle",
        x: 100,
        y: canvasHeight / 2 - (line ? 1 : 70),
        width: 160,
        height: line ? 3 : 140,
        fill: brand.text,
        radius: 0,
      }),
    );
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          "input, textarea, select, [contenteditable=true], dialog, [role=menu]",
        ) ||
        disabled
      )
        return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === "z") {
        event.preventDefault();
        travel(event.shiftKey ? "redo" : "undo");
        return;
      }
      if (mod && key === "a") {
        event.preventDefault();
        setSelected(scene.elements.filter((e) => !e.locked).map((e) => e.id));
        return;
      }
      if (mod && (key === "c" || key === "x") && selected.length) {
        event.preventDefault();
        copyElements(selected, key === "x");
        return;
      }
      if (mod && key === "d" && selected.length) {
        event.preventDefault();
        applyCommand((live) => duplicateSelection(live, selected));
        return;
      }
      if (mod && key === "v" && copied.current.length) {
        event.preventDefault();
        applyCommand((live) => pasteSelection(live, copied.current));
        return;
      }
      if ((key === "delete" || key === "backspace") && selected.length) {
        event.preventDefault();
        applyCommand((live) => removeSelection(live, selected));
        return;
      }
      if (mod && (key === "]" || key === "[")) {
        event.preventDefault();
        applyCommand((live) => reorderSelection(live, selected, key === "]" ? (event.shiftKey ? "front" : "forward") : (event.shiftKey ? "back" : "backward")));
        return;
      }
      if (key.startsWith("arrow") && selected.length) {
        event.preventDefault();
        const distance = event.shiftKey ? 10 : 1;
        const dx =
          key === "arrowleft" ? -distance : key === "arrowright" ? distance : 0;
        const dy =
          key === "arrowup" ? -distance : key === "arrowdown" ? distance : 0;
        changeScene(
          {
            ...scene,
            elements: scene.elements.map((e) =>
              selected.includes(e.id) && !e.locked
                ? {
                    ...e,
                    x: Math.max(-3600, Math.min(3600, e.x + dx)),
                    y: Math.max(-3600, Math.min(3600, e.y + dy)),
                  }
                : e,
            ),
          },
          "nudge",
        );
        return;
      }
      if (key === "escape") {
        setSelected([]);
        setExportMenu(false);
        return;
      }
      if (!mod && !event.altKey && key === "t") {
        event.preventDefault();
        addText();
      }
      if (!mod && !event.altKey && key === "r") {
        event.preventDefault();
        addShape("rectangle");
      }
      if (!mod && !event.altKey && key === "o") {
        event.preventDefault();
        addShape("ellipse");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  useEffect(() => {
    const node = workspaceRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setFit(
        Math.min(
          entry.contentRect.width / FRAME_WIDTH,
          entry.contentRect.height /
            ((FRAME_WIDTH * format.height) / format.width),
          1.55,
        ),
      ),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [format.height, format.width]);
  useEffect(() => {
    if (!job) return;
    let ignore = false;
    const frames = Array.from(
      exportRef.current?.querySelectorAll<HTMLElement>(".te-frame") ?? [],
    );
    exportFrames(frames, job.design.name, job.design.caption, (p) => {
      if (!ignore) setProgress(p);
    })
      .then(() => {
        if (!ignore)
          setNotice(
            `${frames.length === 1 ? "PNG" : "Carousel ZIP"} downloaded at ${FORMATS[job.design.format].width} × ${FORMATS[job.design.format].height}.`,
          );
      })
      .catch((reason) => {
        if (!ignore)
          setNotice(
            reason instanceof Error
              ? reason.message
              : "Export failed. Please try again.",
          );
      })
      .finally(() => {
        if (!ignore) {
          setJob(null);
          setProgress(0);
        }
      });
    return () => {
      ignore = true;
    };
  }, [job]);

  function addPage(duplicate = false, source: DesignPage = page) {
    if (disabled || design.pages.length >= 20) return;
    const liveSource = current.current.pages.find((p) => p.id === source.id);
    if (!liveSource) return;
    const sourceIndex = current.current.pages.indexOf(liveSource);
    const next = duplicatePage(liveSource);
    if (!duplicate)
      next.canvas = { background: source.canvas?.background ?? scene.background, elements: [] };
    const accepted = commit((d) => ({
      ...d,
      pages: [
        ...d.pages.slice(0, sourceIndex + 1),
        next,
        ...d.pages.slice(sourceIndex + 1),
      ],
    }));
    if (!accepted) return;
    setPageId(next.id);
    setSelected([]);
  }
  function movePage(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= design.pages.length) return;
    commit((d) => {
      const pages = [...d.pages];
      const [moved] = pages.splice(from, 1);
      pages.splice(to, 0, moved);
      return { ...d, pages };
    });
  }
  async function upload(file: File, replaceId?: string) {
    if (disabled || uploading) return;
    const targetId = page.id;
    setUploading(true);
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
        throw new Error("Choose a JPG, PNG, or WebP image.");
      if (file.size > 15 * 1024 * 1024)
        throw new Error("Choose an image smaller than 15 MB.");
      const bitmap = await createImageBitmap(file);
      if (!mounted.current) {
        bitmap.close();
        return;
      }
      const ratio = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const context = canvas.getContext("2d");
      if (!context) {
        bitmap.close();
        throw new Error("Image processing is unavailable.");
      }
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const src = canvas.toDataURL("image/webp", 0.88);
      if (src.length > 2_000_000)
        throw new Error(
          "This image is too large after processing. Use a smaller image.",
        );
      const targetPage = current.current.pages.find((p) => p.id === targetId);
      if (!targetPage)
        throw new Error(
          "The page was removed. Choose a page and upload again.",
        );
      const targetScene =
        targetPage.canvas ?? sceneForPage(targetPage, current.current.format);
      if (
        replaceId &&
        !targetScene.elements.some(
          (e) => e.id === replaceId && e.type === "image" && !e.locked,
        )
      )
        throw new Error(
          "The image was removed or locked. Select an image and try again.",
        );
      if (!replaceId && targetScene.elements.length >= 100)
        throw new Error("Each page supports up to 100 elements.");
      const w = Math.max(1, Math.min(280, canvas.width / 3)),
        h = Math.max(
          1,
          Math.min(canvasHeight * 0.7, (w * canvas.height) / canvas.width),
        );
      const image = createCanvasElement("image", {
        src,
        name: file.name.slice(0, 100),
        x: (360 - w) / 2,
        y: (canvasHeight - h) / 2,
        width: w,
        height: h,
      });
      const accepted = commit((d) => ({
        ...d,
        pages: d.pages.map((p) => {
          if (p.id !== targetId) return p;
          const live = p.canvas ?? sceneForPage(p, d.format);
          if (!replaceId && live.elements.length >= 100) return p;
          return {
            ...p,
            canvas: {
              ...live,
              elements: replaceId
                ? live.elements.map((e) =>
                    e.id === replaceId && e.type === "image"
                      ? { ...e, src, name: file.name.slice(0, 100) }
                      : e,
                  )
                : [...live.elements, image],
            },
          };
        }),
      }));
      if (!accepted) return;
      if (activePage.current === targetId) setSelected([replaceId ?? image.id]);
      setNotice(
        replaceId
          ? "Image replaced."
          : "Image added. Drag its handles to resize it.",
      );
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "Could not open this image.",
      );
    } finally {
      if (mounted.current) setUploading(false);
    }
  }
  function applyBrand(all = true) {
    const accepted = commit((d) => ({
      ...d,
      pages: d.pages.map((p) => {
        if (!all && p.id !== page.id) return p;
        const content = p.canvas ?? sceneForPage(p, d.format);
        return {
          ...p,
          canvas: {
            background: brand.background,
            elements: content.elements.map((e) =>
              e.type === "text" && !e.locked
                ? { ...e, font: brand.font, color: brand.text }
                : e,
            ),
          },
        };
      }),
    }));
    if (!accepted) return;
    setNotice(`Applied ${brand.name || "your brand"} to ${all ? "all pages" : "this page"}.`);
  }
  const inspector = (
    <ElementInspector
      scene={scene}
      selectedIds={selected}
      onSelect={setSelected}
      onChange={changeScene}
      width={360}
      height={canvasHeight}
      disabled={disabled}
    />
  );

  return (
    <div className="te-editor te-wysiwyg" onContextMenu={workspaceMenu}>
                <input
                  ref={fileRef}
                  hidden
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void upload(file);
                  }}
                />
      <header className="te-editor-header">
        <button
          className="te-icon"
          onClick={onExit}
          aria-label={
            isTemplateDraft ? "Back to my templates" : "Back to your designs"
          }
          title={
            isTemplateDraft ? "Back to my templates" : "Back to your designs"
          }
          disabled={Boolean(job)}
        >
          <ArrowLeftIcon size={20} />
        </button>
        <span className="te-editor-divider" />
        <div className="te-document-title">
          <input
            aria-label={isTemplateDraft ? "Template name" : "Design name"}
            value={design.name}
            maxLength={100}
            disabled={disabled}
            onChange={(e) =>
              commit((d) => ({ ...d, name: e.target.value }), "name")
            }
            onBlur={() => {
              if (!design.name.trim())
                commit((d) => ({
                  ...d,
                  name: isTemplateDraft
                    ? "Untitled template"
                    : "Untitled design",
                }));
            }}
          />
          <span role="status">
            {isTemplateDraft ? "Template draft · " : ""}
            {saveStatus}
          </span>
        </div>
        <div className="te-history">
          <button
            className="te-icon"
            disabled={disabled || !historyState.undo}
            onClick={() => travel("undo")}
            title="Undo (⌘Z)"
            aria-label="Undo"
          >
            ↶
          </button>
          <button
            className="te-icon"
            disabled={disabled || !historyState.redo}
            onClick={() => travel("redo")}
            title="Redo (⌘⇧Z)"
            aria-label="Redo"
          >
            ↷
          </button>
        </div>
        <div className="te-editor-header-actions">
          <button
            className={`te-button te-save-template ${isTemplateDraft ? "te-primary te-draft-save" : ""}`}
            disabled={disabled}
            onClick={() => setTemplateName(design.name)}
          >
            <LayoutIcon />
            {saveTemplateLabel}
          </button>
          <div className="te-export-anchor">
            <button
              className={`te-button ${isTemplateDraft ? "" : "te-primary"}`}
              disabled={Boolean(job) || uploading}
              onClick={() => setExportMenu((v) => !v)}
            >
              <DownloadIcon />
              {job ? `Exporting ${progress}%` : "Export"}
            </button>
            {exportMenu && (
              <>
                <button
                  className="te-menu-dismiss"
                  aria-label="Close export menu"
                  onClick={() => setExportMenu(false)}
                />
                <div className="te-export-menu">
                  <span className="te-eyebrow">
                    {format.width} × {format.height} PX
                  </span>
                  <button
                    onClick={() => {
                      setExportMenu(false);
                      setJob({
                        design: structuredClone(design),
                        pageId: page.id,
                      });
                    }}
                  >
                    Current page <span>PNG</span>
                  </button>
                  <button
                    onClick={() => {
                      setExportMenu(false);
                      setJob({ design: structuredClone(design) });
                    }}
                  >
                    All {design.pages.length} pages{" "}
                    <span>{design.pages.length > 1 ? "ZIP" : "PNG"}</span>
                  </button>
                  <button
                    onClick={() => {
                      saveBlob(
                        new Blob([design.caption], { type: "text/plain" }),
                        `${fileName(design.name)}-caption.txt`,
                      );
                      setExportMenu(false);
                    }}
                    disabled={!design.caption.trim()}
                  >
                    Caption <span>TXT</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      {notice && (
        <div className="te-notice te-editor-notice" role="status">
          {notice}
          <button
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}
      <div className="te-editor-body">
        <aside className="te-editor-sidebar">
          <nav className="te-tool-tabs" aria-label="Editor tools">
            {(
              [
                ["templates", LayoutIcon, "Design"],
                ["text", TextIcon, "Text"],
                ["elements", PlusIcon, "Elements"],
                ["media", ImageIcon, "Uploads"],
                ["brand", StarIcon, "Brand"],
                ["layers", CopyIcon, "Layers"],
                ["caption", TextIcon, "Caption"],
                ["style", StarIcon, "Properties"],
              ] as const
            ).map(([id, Icon, label]) => (
              <button
                key={id}
                className={tab === id ? "is-active" : ""}
                onClick={() => setTab(id)}
                aria-pressed={tab === id}
              >
                <Icon size={20} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <fieldset disabled={disabled} className="te-panel-scroll">
            {tab === "text" && (
              <>
                <div className="te-panel-heading">
                  <h2>Add text</h2>
                  <span>T</span>
                </div>
                <button
                  className="te-add-text te-add-heading"
                  onClick={() => addText(30, "Add a heading")}
                >
                  Add a heading
                </button>
                <button
                  className="te-add-text te-add-subheading"
                  onClick={() => addText(20, "Add a subheading")}
                >
                  Add a subheading
                </button>
                <button
                  className="te-add-text"
                  onClick={() => addText(13, "Add your body text")}
                >
                  Add body text
                </button>
                <p className="te-help">
                  Double-click any text on the canvas to type. Select it to
                  change its font, alignment, case, color, and spacing.
                </p>
                <div className="te-panel-heading">
                  <h2>Your brand</h2>
                </div>
                <button className="te-button te-full" onClick={() => applyBrand()}>
                  <StarIcon /> Apply brand to all pages
                </button>
              </>
            )}
            {tab === "elements" && (
              <>
                <div className="te-panel-heading">
                  <h2>Shapes & lines</h2>
                </div>
                <div className="te-shape-picker">
                  <button onClick={() => addShape("rectangle")}>
                    <span className="te-shape-rect" />
                    Rectangle
                  </button>
                  <button onClick={() => addShape("ellipse")}>
                    <span className="te-shape-circle" />
                    Circle
                  </button>
                  <button onClick={() => addShape("rectangle", true)}>
                    <span className="te-shape-line" />
                    Line
                  </button>
                </div>
                <p className="te-help">
                  Drag, resize, and rotate shapes on the canvas. Use Properties
                  for fill, borders, and rounded corners.
                </p>
                <div className="te-panel-heading">
                  <h2>Page background</h2>
                </div>
                <ColorField
                  label="Background color"
                  value={scene.background}
                  onChange={(background) =>
                    changeScene({ ...scene, background }, "background")
                  }
                />
                <div className="te-swatches">
                  {[
                    "#ffffff",
                    "#f3efe6",
                    "#dce5d8",
                    "#263e35",
                    "#0c0c0c",
                    "#a78bfa",
                    "#ff7547",
                    "#2767ff",
                  ].map((color) => (
                    <button
                      key={color}
                      aria-label={`Background ${color}`}
                      style={{ background: color }}
                      onClick={() =>
                        changeScene({ ...scene, background: color })
                      }
                    />
                  ))}
                </div>
              </>
            )}
            {tab === "templates" && (
              <>
                <div className="te-panel-heading">
                  <h2>Page templates</h2>
                </div>
                <p className="te-help">
                  Apply a template to this page, then edit every element. Undo
                  restores the previous page.
                </p>
                <div className="te-canvas-templates">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        const next = duplicatePage(t.pages[0]);
                        changeScene(
                          resizeCanvasScene(
                            sceneForPage(next, t.format),
                            t.format,
                            design.format,
                          ),
                        );
                        setSelected([]);
                      }}
                    >
                      <DesignPreview
                        design={{ ...design, format: t.format, pages: t.pages }}
                        page={t.pages[0]}
                      />
                      <span>{t.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {tab === "media" && (
              <>
                <div className="te-panel-heading">
                  <h2>Images</h2>
                </div>
                <button
                  className="te-upload"
                  disabled={uploading || scene.elements.length >= 100}
                  onClick={() => fileRef.current?.click()}
                >
                  <ImageIcon size={26} />
                  <strong>
                    {uploading ? "Preparing image…" : "Upload an image"}
                  </strong>
                  <span>JPG, PNG or WebP · up to 15 MB</span>
                </button>
                {selected.length === 1 &&
                  scene.elements.find((e) => e.id === selected[0])?.type ===
                    "image" && (
                    <label className="te-button te-full te-replace-image">
                      Replace selected image
                      <input
                        type="file"
                        hidden
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file) void upload(file, selected[0]);
                        }}
                      />
                    </label>
                  )}
                <p className="te-help">
                  Drop or paste an image onto the workspace. Add as many images
                  as your page needs.
                </p>
                <div className="te-panel-heading">
                  <h2>Studio artwork</h2>
                </div>
                <div className="te-artwork-grid">
                  {[
                    "forest",
                    "dunes",
                    "coral",
                    "folds",
                    "orbits",
                    "sculpture",
                  ].map((name) => (
                    <button
                      key={name}
                      aria-label={`Add ${name} artwork`}
                      onClick={() =>
                        addElement(
                          createCanvasElement("image", {
                            name: `${name} artwork`,
                            src: `/template-editor/${name}.svg`,
                            x: 40,
                            y: canvasHeight / 2 - 140,
                            width: 280,
                            height: 280,
                          }),
                        )
                      }
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/template-editor/${name}.svg`} alt={name} />
                    </button>
                  ))}
                </div>
              </>
            )}
            {tab === "brand" && <BrandPanel kits={brandKits} activeId={activeBrandKitId} scene={scene} selectedIds={selected} disabled={disabled}
              onSelectKit={onSelectBrandKit} onSaveAsset={onSaveBrandAsset} onChange={(recipe) => {
                const target = current.current.pages.find((item) => item.id === page.id);
                if (target) {
                  const live = target.canvas ?? sceneForPage(target, current.current.format);
                  const next = recipe(live);
                  if (next !== live) changeScene(next);
                }
              }} onApply={applyBrand} onManage={onManageBrand}
              onInsert={(asset) => {
                const ratio = Math.min(280 / asset.width, (canvasHeight * .65) / asset.height);
                const width = Math.max(1, asset.width * ratio);
                const height = Math.max(1, asset.height * ratio);
                addElement(createCanvasElement("image", {name:asset.name, src:asset.src, fit:"contain", x:(360-width)/2, y:(canvasHeight-height)/2, width,height}));
              }} />}
            {tab === "layers" && (
              <>
                <div className="te-panel-heading">
                  <h2>Layers</h2>
                  <span>{scene.elements.length}/100</span>
                </div>
                <p className="te-help">
                  Top layers appear in front. Shift-click to select several
                  elements.
                </p>
                <div className="te-layers">
                  {[...scene.elements].reverse().map((e) => (
                    <div
                      key={e.id}
                      onContextMenu={(event) => canvasMenu(event, e.id)}
                      className={selected.includes(e.id) ? "is-active" : ""}
                    >
                      <button
                        className="te-layer-name"
                        aria-label={`Select layer ${e.name}`}
                        onClick={(event) =>
                          setSelected(
                            event.shiftKey
                              ? selected.includes(e.id)
                                ? selected.filter((id) => id !== e.id)
                                : [...selected, e.id]
                              : [e.id],
                          )
                        }
                      >
                        <span>
                          {e.type === "text"
                            ? "T"
                            : e.type === "image"
                              ? "▧"
                              : "□"}
                        </span>
                        <span>
                          {e.type === "text"
                            ? e.text.slice(0, 40) || "Empty text"
                            : e.name}
                        </span>
                      </button>
                      <button className="te-icon te-layer-more" aria-label={`Actions for ${e.name}`} aria-haspopup="menu" onClick={(event) => canvasMenu(event, e.id)}>•••</button>
                      <button
                        className="te-icon"
                        title={e.locked ? "Unlock layer" : "Lock layer"}
                        aria-label={`${e.locked ? "Unlock" : "Lock"} ${e.name}`}
                        onClick={() =>
                          changeScene({
                            ...scene,
                            elements: scene.elements.map((layer) =>
                              layer.id === e.id
                                ? { ...layer, locked: !layer.locked }
                                : layer,
                            ),
                          })
                        }
                      >
                        {e.locked ? "▣" : "◇"}
                      </button>
                    </div>
                  ))}
                </div>
                {!scene.elements.length && (
                  <p className="te-help">
                    Your canvas is empty. Add text, shapes, or an image to get
                    started.
                  </p>
                )}
              </>
            )}
            {tab === "caption" && (
              <>
                <div className="te-panel-heading">
                  <h2>Post caption</h2>
                </div>
                <label className="te-field">
                  Caption
                  <textarea
                    rows={10}
                    maxLength={2200}
                    placeholder="Write a caption for your post…"
                    value={design.caption}
                    onChange={(e) =>
                      commit(
                        (d) => ({ ...d, caption: e.target.value }),
                        "caption",
                      )
                    }
                  />
                  <span className="te-field-note">
                    {design.caption.length}/2,200 · Included with carousel
                    export
                  </span>
                </label>
              </>
            )}
            {tab === "style" && inspector}
            <button
              className="te-shortcuts-link"
              onClick={() => setShowShortcuts(true)}
            >
              Keyboard shortcuts <span>⌘</span>
            </button>
          </fieldset>
        </aside>
        <main className="te-canvas-column">
          <QuickToolbar scene={scene} selectedIds={selected} disabled={disabled} onChange={changeScene}
            onDuplicate={() => applyCommand((live) => duplicateSelection(live, selected))}
            onDelete={() => applyCommand((live) => removeSelection(live, selected))}
            onMore={(event) => selected.length ? openMenu(event, {label: "Selected elements", items: elementMenu(selected)}) : canvasMenu(event, null)}
            onAddText={() => addText()} onUpload={() => fileRef.current?.click()} />
          <div className="te-canvas-toolbar">
            <label>
              Resize
              <select
                aria-label="Design format"
                disabled={disabled}
                value={design.format}
                onChange={(e) => {
                  const nextFormat = e.target.value as DesignFormat;
                  commit((d) => ({
                    ...d,
                    format: nextFormat,
                    pages: d.pages.map((p) => ({
                      ...p,
                      canvas: p.canvas
                        ? resizeCanvasScene(p.canvas, d.format, nextFormat)
                        : undefined,
                    })),
                  }));
                  setZoom(1);
                }}
              >
                {Object.entries(FORMATS).map(([id, f]) => (
                  <option key={id} value={id}>
                    {f.label} · {f.width} × {f.height}
                  </option>
                ))}
              </select>
            </label>
            <span className="te-selection-hint">
              {selected.length
                ? `${selected.length} selected · Shift-click for more`
                : "Drag to select · Double-click text to edit"}
            </span>
            <button
              className="te-text-button te-properties-trigger"
              onClick={() => setTab("style")}
            >
              Properties
            </button>
          </div>
          <div
            className="te-canvas-space"
            ref={workspaceRef}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("Files")) e.preventDefault();
            }}
            onDrop={(e) => {
              const file = e.dataTransfer.files[0];
              if (file) {
                e.preventDefault();
                void upload(file);
              }
            }}
            onPaste={(e) => {
              const file = Array.from(e.clipboardData.files).find((f) =>
                f.type.startsWith("image/"),
              );
              if (
                file &&
                !(e.target as HTMLElement).closest("[contenteditable=true]")
              ) {
                e.preventDefault();
                void upload(file);
              }
            }}
          >
            <div
              className="te-canvas-stage te-free-stage"
              style={{
                width: FRAME_WIDTH * scale,
                height: canvasHeight * scale,
              }}
            >
              <div
                style={{
                  width: FRAME_WIDTH,
                  height: canvasHeight,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
              >
                {page.canvas ? (
                  <CanvasEditor
                    key={page.id}
                    scene={scene}
                    width={FRAME_WIDTH}
                    height={canvasHeight}
                    selectedIds={selected}
                    onSelect={setSelected}
                    onChange={changeScene}
                    disabled={disabled}
                    onContextMenu={canvasMenu}
                    editingRequest={editingRequest}
                  />
                ) : (
                  <div className="te-legacy-canvas">
                    <DesignFrame design={design} page={page} />
                    <button
                      className="te-button te-primary"
                      disabled={disabled}
                      onClick={() => changeScene(scene)}
                    >
                      Edit individual elements
                    </button>
                    <span>
                      Convert this older layout to editable layers. Undo
                      restores it.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="te-canvas-bottom">
            <span>
              Page {index + 1} · {scene.elements.length} elements
            </span>
            <div>
              <button
                className="te-icon"
                aria-label="Zoom out"
                disabled={zoom <= 0.5}
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
              >
                −
              </button>
              <button
                className="te-text-button"
                onClick={() => setZoom(1)}
                title="Fit to workspace"
              >
                {Math.round(fit * zoom * 100)}%
              </button>
              <button
                className="te-icon"
                aria-label="Zoom in"
                disabled={zoom >= 2}
                onClick={() => setZoom((z) => Math.min(2, z + 0.25))}
              >
                +
              </button>
            </div>
          </div>
          <section className="te-pages" aria-label="Carousel pages">
            <div className="te-pages-heading">
              <span>
                PAGES <small>{design.pages.length}/20</small>
              </span>
              <div>
                <button
                  className="te-icon"
                  title="Move page left"
                  aria-label="Move page left"
                  disabled={disabled || index === 0}
                  onClick={() => movePage(index, index - 1)}
                >
                  <ArrowLeftIcon />
                </button>
                <button
                  className="te-icon"
                  title="Move page right"
                  aria-label="Move page right"
                  disabled={disabled || index === design.pages.length - 1}
                  onClick={() => movePage(index, index + 1)}
                >
                  <ArrowRightIcon />
                </button>
                <button
                  className="te-icon"
                  title="Duplicate page"
                  aria-label="Duplicate page"
                  disabled={disabled || design.pages.length >= 20}
                  onClick={() => addPage(true)}
                >
                  <CopyIcon />
                </button>
                <button
                  className="te-icon"
                  title="Delete page"
                  aria-label="Delete page"
                  disabled={disabled || design.pages.length <= 1}
                  onClick={() => setRemovePageId(page.id)}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
            <div className="te-page-strip">
              {design.pages.map((p, i) => (
                <div key={p.id} className="te-page-card" onContextMenu={(event) => pageMenu(event, p)}>
                <button
                  draggable={!disabled}
                  onDragStart={() => setDragged(p.id)}
                  onDragEnd={() => setDragged(null)}
                  onDragOver={(e) => {
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragged)
                      movePage(
                        design.pages.findIndex((item) => item.id === dragged),
                        i,
                      );
                    setDragged(null);
                  }}
                  key={p.id}
                  className={`te-page-thumb ${p.id === page.id ? "is-active" : ""}`}
                  onClick={() => {
                    setPageId(p.id);
                    setSelected([]);
                  }}
                  aria-label={`Page ${i + 1}`}
                  aria-pressed={p.id === page.id}
                >
                  <DesignPreview design={design} page={p} />
                  <span>{i + 1}</span>
                </button>
                <button className="te-page-more" aria-label={`Page ${i + 1} actions`} aria-haspopup="menu" onClick={(event) => pageMenu(event, p)}>•••</button>
                </div>
              ))}
              <button
                className="te-add-page"
                disabled={disabled || design.pages.length >= 20}
                onClick={() => addPage()}
              >
                <PlusIcon size={22} />
                <span>Add page</span>
              </button>
            </div>
          </section>
        </main>
        <aside className="te-inspector">
          <fieldset disabled={disabled}>{inspector}</fieldset>
        </aside>
      </div>
      {renameLayer && <Modal title="Rename layer" onClose={() => setRenameLayer(null)}>
        <form onSubmit={(event) => {
          event.preventDefault();
          changeScene({...scene, elements: scene.elements.map((element) => element.id === renameLayer.id ? {...element, name: renameLayer.name.trim() || element.name} : element)});
          setRenameLayer(null);
        }}>
          <label className="te-field">Layer name<input autoFocus required maxLength={100} value={renameLayer.name} onChange={(event) => setRenameLayer({...renameLayer, name: event.target.value})} /></label>
          <div className="te-modal-actions"><button type="button" className="te-button" onClick={() => setRenameLayer(null)}>Cancel</button><button className="te-button te-primary" disabled={disabled}>Save name</button></div>
        </form>
      </Modal>}
      {showShortcuts && (
        <Modal
          title="Keyboard shortcuts"
          onClose={() => setShowShortcuts(false)}
        >
          <div className="te-shortcuts-list">
            {[
              ["T", "Add text"],
              ["R / O", "Rectangle / circle"],
              ["⌘/Ctrl Z", "Undo"],
              ["⌘/Ctrl Shift Z", "Redo"],
              ["⌘/Ctrl D", "Duplicate selected"],
              ["⌘/Ctrl C / X / V", "Copy / cut / paste elements"],
              ["⌘/Ctrl [ / ]", "Send backward / bring forward"],
              ["Shift F10", "Open actions menu"],
              ["Drag empty canvas", "Select multiple elements"],
              ["⌘/Ctrl A", "Select all unlocked elements"],
              ["Arrow keys", "Move selected elements"],
              ["Shift + arrows", "Move in larger steps"],
              ["Delete", "Remove selected elements"],
              ["Shift + click", "Select multiple elements"],
              ["Escape", "Deselect / cancel gesture"],
            ].map(([key, action]) => (
              <div key={key}>
                <span>{action}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {templateName !== null && (
        <Modal
          title={
            design.editingTemplateId
              ? "Update your template"
              : "Save as a reusable template"
          }
          onClose={() => setTemplateName(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                if (blocked.current) return;
                onSaveTemplate(
                  designAsTemplate(design, templateName.trim() || design.name),
                );
                setTemplateName(null);
                setNotice("Template saved. Find it under My templates.");
              } catch (reason) {
                setNotice(
                  reason instanceof Error
                    ? reason.message
                    : "Could not save template.",
                );
                setTemplateName(null);
              }
            }}
          >
            <p>
              Save this layout, styling, and all {design.pages.length} pages as
              a starting point for future posts.
            </p>
            <label className="te-field">
              Template name
              <input
                autoFocus
                value={templateName}
                maxLength={100}
                required
                onChange={(e) => setTemplateName(e.target.value)}
              />
            </label>
            <div className="te-modal-actions">
              <button
                type="button"
                className="te-button"
                onClick={() => setTemplateName(null)}
              >
                Cancel
              </button>
              <button className="te-button te-primary">
                <CheckIcon />
                {design.editingTemplateId ? "Update template" : "Save template"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {removePageId && (
        <Modal
          title={`Delete page ${design.pages.findIndex((p) => p.id === removePageId) + 1}?`}
          onClose={() => setRemovePageId(null)}
        >
          <p>You can restore this page with Undo.</p>
          <div className="te-modal-actions">
            <button className="te-button" onClick={() => setRemovePageId(null)}>
              Cancel
            </button>
            <button
              className="te-button te-primary"
              onClick={() => {
                commit((d) => ({
                  ...d,
                  pages: d.pages.filter((p) => p.id !== removePageId),
                }));
                if (page.id === removePageId) setPageId(design.pages.find((p) => p.id !== removePageId)!.id);
                setSelected([]);
                setRemovePageId(null);
              }}
            >
              Delete page
            </button>
          </div>
        </Modal>
      )}
      {job && (
        <div
          ref={exportRef}
          className="gf-export-layer te-export-layer"
          aria-hidden
        >
          {job.design.pages
            .filter((p) => !job.pageId || p.id === job.pageId)
            .map((p) => (
              <DesignFrame key={p.id} design={job.design} page={p} />
            ))}
        </div>
      )}
    </div>
  );
}
