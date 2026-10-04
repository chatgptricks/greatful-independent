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
  type DesignDocument,
  type DesignFormat,
  type DesignTemplate,
} from "@/lib/template-editor/model";
import { exportFrames, fileName, saveBlob } from "@/lib/template-editor/export";
import { ColorField, Modal } from "./controls";
import { CanvasEditor } from "./canvas";
import { ElementInspector } from "./element-inspector";
import "./wysiwyg.css";
import { DesignFrame, DesignPreview, FRAME_WIDTH } from "./preview";

type Tab =
  | "templates"
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
  saveStatus: string;
  canEdit: boolean;
  onChange: (design: DesignDocument) => void;
  onExit: () => void;
  onSaveTemplate: (template: DesignTemplate) => void;
};

export function DesignEditor({
  design: initial,
  templates,
  brand,
  saveStatus,
  canEdit,
  onChange,
  onExit,
  onSaveTemplate,
}: Props) {
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
  const [removeOpen, setRemoveOpen] = useState(false);
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

  const commit = useCallback(
    (change: (d: DesignDocument) => DesignDocument, group = "") => {
      if (!canEdit || job) return;
      const previous = current.current;
      const next = { ...change(previous), updatedAt: new Date().toISOString() };
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
      onChangeRef.current(next);
    },
    [canEdit, job],
  );
  const travel = useCallback(
    (direction: "undo" | "redo") => {
      if (!canEdit || job) return;
      const h = history.current;
      const next = (direction === "undo" ? h.past : h.future).pop();
      if (!next) return;
      (direction === "undo" ? h.future : h.past).push(current.current);
      h.group = "";
      setHistoryState({ undo: h.past.length > 0, redo: h.future.length > 0 });
      const updated = { ...next, updatedAt: new Date().toISOString() };
      current.current = updated;
      setDesign(updated);
      onChangeRef.current(updated);
    },
    [canEdit, job],
  );
  const changeScene = useCallback(
    (next: CanvasScene, group = "") => {
      commit(
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
  function addElement(element: CanvasElement) {
    if (scene.elements.length >= 100) {
      setNotice("Each page supports up to 100 elements.");
      return;
    }
    changeScene({ ...scene, elements: [...scene.elements, element] });
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
          "input, textarea, select, [contenteditable=true], dialog",
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
      if (mod && key === "c" && selected.length) {
        event.preventDefault();
        copied.current = structuredClone(
          scene.elements.filter((e) => selected.includes(e.id)),
        );
        return;
      }
      if (mod && (key === "d" || key === "v")) {
        const source =
          key === "d"
            ? scene.elements.filter((e) => selected.includes(e.id) && !e.locked)
            : copied.current;
        if (!source.length) return;
        event.preventDefault();
        const copies = source
          .slice(0, 100 - scene.elements.length)
          .map((e) => ({
            ...e,
            id: crypto.randomUUID(),
            locked: false,
            x: Math.min(10000, e.x + 12),
            y: Math.min(10000, e.y + 12),
          }));
        changeScene({ ...scene, elements: [...scene.elements, ...copies] });
        setSelected(copies.map((e) => e.id));
        return;
      }
      if ((key === "delete" || key === "backspace") && selected.length) {
        event.preventDefault();
        changeScene({
          ...scene,
          elements: scene.elements.filter(
            (e) => !selected.includes(e.id) || e.locked,
          ),
        });
        setSelected([]);
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

  function addPage(duplicate = false) {
    if (design.pages.length >= 20) return;
    const next = duplicatePage(page);
    if (!duplicate)
      next.canvas = { background: scene.background, elements: [] };
    commit((d) => ({
      ...d,
      pages: [
        ...d.pages.slice(0, index + 1),
        next,
        ...d.pages.slice(index + 1),
      ],
    }));
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
      commit((d) => ({
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
  function applyBrand() {
    commit((d) => ({
      ...d,
      pages: d.pages.map((p) => {
        const content = p.canvas ?? sceneForPage(p, d.format);
        return {
          ...p,
          canvas: {
            background: brand.background,
            elements: content.elements.map((e) =>
              e.type === "text"
                ? { ...e, font: brand.font, color: brand.text }
                : e,
            ),
          },
        };
      }),
    }));
    setNotice(`Applied ${brand.name || "your brand"} to all pages.`);
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
    <div className="te-editor te-wysiwyg">
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
                <button className="te-button te-full" onClick={applyBrand}>
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
                : "Click to select · Double-click to edit"}
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
                  onClick={() => setRemoveOpen(true)}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
            <div className="te-page-strip">
              {design.pages.map((p, i) => (
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
              ["⌘/Ctrl C / V", "Copy / paste elements"],
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
      {removeOpen && (
        <Modal
          title={`Delete page ${index + 1}?`}
          onClose={() => setRemoveOpen(false)}
        >
          <p>You can restore this page with Undo.</p>
          <div className="te-modal-actions">
            <button className="te-button" onClick={() => setRemoveOpen(false)}>
              Cancel
            </button>
            <button
              className="te-button te-primary"
              onClick={() => {
                commit((d) => ({
                  ...d,
                  pages: d.pages.filter((p) => p.id !== page.id),
                }));
                setPageId(design.pages[Math.max(0, index - 1)].id);
                setRemoveOpen(false);
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
