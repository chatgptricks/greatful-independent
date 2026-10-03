"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
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
  TEMPLATES,
  SlideThumb,
  type SlideElement,
} from "@/components/grateful-future/slide-templates";
import {
  FORMATS,
  designAsTemplate,
  duplicatePage,
  type BrandKit,
  type DesignDocument,
  type DesignFormat,
  type DesignTemplate,
} from "@/lib/template-editor/model";
import type { SlideStyle } from "@/lib/grateful-future/types";
import { exportFrames, fileName, saveBlob } from "@/lib/template-editor/export";
import { ColorField, FontSelect, Modal, Range } from "./controls";
import { DesignFrame, DesignPreview, FRAME_WIDTH } from "./preview";

type Tab = "templates" | "content" | "media" | "style";
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
  const [design, setDesign] = useState(initial);
  const current = useRef(initial);
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
  const [tab, setTab] = useState<Tab>("content");
  const [selected, setSelected] = useState<SlideElement | null>(null);
  const [notice, setNotice] = useState("");
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [exportMenu, setExportMenu] = useState(false);
  const [job, setJob] = useState<{
    design: DesignDocument;
    pageId?: string;
  } | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
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
  function patchStyle(patch: Partial<SlideStyle>, group = "") {
    commit(
      (d) => ({
        ...d,
        pages: d.pages.map((p) =>
          p.id === page.id ? { ...p, style: { ...p.style, ...patch } } : p,
        ),
      }),
      group ? `${page.id}:${group}` : "",
    );
  }
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          "input, textarea, select, [contenteditable=true], dialog",
        )
      )
        return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        travel(event.shiftKey ? "redo" : "undo");
      }
      if (event.key === "Escape") {
        setSelected(null);
        setExportMenu(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [travel]);
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
      next.style = {
        ...next.style,
        heading: isTemplateDraft ? "" : "Your next idea.",
        body: isTemplateDraft ? "" : "Add the details that bring it to life.",
        headingHtml: undefined,
        bodyHtml: undefined,
      };
    commit((d) => ({
      ...d,
      pages: [
        ...d.pages.slice(0, index + 1),
        next,
        ...d.pages.slice(index + 1),
      ],
    }));
    setPageId(next.id);
    setSelected(null);
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
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const targetId = page.id;
    setUploading(true);
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
        throw new Error("Choose a JPG, PNG, or WebP image.");
      if (file.size > 15 * 1024 * 1024)
        throw new Error("Choose an image smaller than 15 MB.");
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error("Image processing is unavailable in this browser.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const url = canvas.toDataURL("image/webp", 0.88);
      if (url.length > 2_000_000)
        throw new Error(
          "This image is too large after processing. Use a smaller image.",
        );
      commit((d) => ({
        ...d,
        pages: d.pages.map((p) =>
          p.id === targetId
            ? {
                ...p,
                image: {
                  ...p.image,
                  url,
                  width: canvas.width,
                  height: canvas.height,
                  source: "upload",
                  description: file.name,
                  rightsNote: "Uploaded by you",
                },
                style: {
                  ...p.style,
                  ...(p.style.template === "text"
                    ? ({ template: "fullbleed", textColor: "#ffffff" } as const)
                    : {}),
                  mediaOpacity: 1,
                  mediaScale: 1,
                  mediaInX: 0,
                  mediaInY: 0,
                },
              }
            : p,
        ),
      }));
      setNotice("Image added to this page.");
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "Could not open this image.",
      );
    } finally {
      setUploading(false);
    }
  }
  function applyBrand() {
    commit((d) => ({
      ...d,
      pages: d.pages.map((p) => ({
        ...p,
        style: {
          ...p.style,
          font: brand.font,
          bgMode: "color",
          bgColor: brand.background,
          textColor: brand.text,
          headingHtml: undefined,
          bodyHtml: undefined,
        },
      })),
    }));
    setNotice(`Applied ${brand.name || "your brand"} to all pages.`);
  }
  const inspector = (
    <>
      <div className="te-panel-heading">
        <h2>Appearance</h2>
        <span>PAGE {index + 1}</span>
      </div>
      <FontSelect
        value={page.style.font ?? "geist"}
        onChange={(font) =>
          patchStyle({ font, headingHtml: undefined, bodyHtml: undefined })
        }
      />
      <Range
        label="Text size"
        value={page.style.textScale ?? 1}
        min={0.5}
        max={2.5}
        step={0.05}
        unit="×"
        onChange={(textScale) => patchStyle({ textScale }, "textScale")}
      />
      <label className="te-field">
        Text alignment
        <select
          value={page.style.textAlign ?? "left"}
          onChange={(e) =>
            patchStyle({ textAlign: e.target.value as SlideStyle["textAlign"] })
          }
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>
      <label className="te-field">
        Text position
        <select
          value={page.style.align ?? "center"}
          onChange={(e) =>
            patchStyle({
              align: e.target.value as SlideStyle["align"],
              textX: 0,
              textY: 0,
            })
          }
        >
          <option value="top">Top</option>
          <option value="center">Center</option>
          <option value="bottom">Bottom</option>
        </select>
      </label>
      <Range
        label="Line spacing"
        value={page.style.lineHeight ?? 1}
        min={0.7}
        max={2}
        step={0.05}
        unit="×"
        onChange={(lineHeight) => patchStyle({ lineHeight }, "lineHeight")}
      />
      <ColorField
        label="Text color"
        value={page.style.textColor ?? "#ffffff"}
        onChange={(textColor) => patchStyle({ textColor }, "textColor")}
      />
      <ColorField
        label="Background"
        value={page.style.bgColor ?? "#0c0c0c"}
        onChange={(bgColor) =>
          patchStyle({ bgColor, bgMode: "color" }, "bgColor")
        }
      />
      <button className="te-button te-full" onClick={applyBrand}>
        <StarIcon />
        Apply brand to all pages
      </button>
      <button
        className="te-button te-full te-mobile-template"
        onClick={() => setTemplateName(design.name)}
      >
        <LayoutIcon />
        {saveTemplateLabel}
      </button>
      <p className="te-help">
        Double-click text on the canvas to edit it. Drag text or images to
        reposition them.
      </p>
      <button
        className="te-text-button"
        onClick={() =>
          patchStyle({
            textX: 0,
            textY: 0,
            mediaX: 0,
            mediaY: 0,
            mediaW: undefined,
            mediaH: undefined,
            mediaScale: 1,
            mediaInX: 0,
            mediaInY: 0,
          })
        }
      >
        Reset positions
      </button>
    </>
  );

  return (
    <div className="te-editor">
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
                ["templates", LayoutIcon, "Layouts"],
                ["content", TextIcon, "Content"],
                ["media", ImageIcon, "Media"],
                ["style", StarIcon, "Style"],
              ] as const
            ).map(([id, Icon, label]) => (
              <button
                key={id}
                className={tab === id ? "is-active" : ""}
                onClick={() => setTab(id)}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <fieldset disabled={disabled} className="te-panel-scroll">
            {tab === "templates" && (
              <>
                <div className="te-panel-heading">
                  <h2>Page layouts</h2>
                </div>
                <p className="te-help">
                  Change the layout of this page. Your words and image stay with
                  it.
                </p>
                <div className="te-layout-grid">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      className={
                        page.style.template === t.id ? "is-active" : ""
                      }
                      onClick={() =>
                        patchStyle({ template: t.id, textX: 0, textY: 0 })
                      }
                    >
                      <SlideThumb template={t.id} />
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
                <div className="te-panel-heading">
                  <h2>Template styles</h2>
                </div>
                <div className="te-style-presets">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() =>
                        patchStyle({
                          ...t.pages[0].style,
                          heading: page.style.heading,
                          body: page.style.body,
                          headingHtml: page.style.headingHtml,
                          bodyHtml: page.style.bodyHtml,
                        })
                      }
                    >
                      <span
                        style={{
                          background: t.pages[0].style.bgColor ?? "#242424",
                          color: t.pages[0].style.textColor ?? "#fff",
                        }}
                      >
                        Aa
                      </span>
                      <span>
                        {t.name}
                        <small>{t.category}</small>
                      </span>
                      <ArrowRightIcon size={14} />
                    </button>
                  ))}
                </div>
              </>
            )}
            {tab === "content" && (
              <>
                <div className="te-panel-heading">
                  <h2>
                    {isTemplateDraft ? "Build your template" : "Make it yours"}
                  </h2>
                  <span>PAGE {index + 1}</span>
                </div>
                {isTemplateDraft && (
                  <p className="te-help">
                    Add text below, choose a layout, or upload an image. Add
                    pages to build the full template. Your draft autosaves as
                    you work.
                  </p>
                )}
                {page.style.template === "plain" ? (
                  <p className="te-help">
                    This is a photo-only layout. Choose a different layout to
                    show your text.
                  </p>
                ) : null}
                <label className="te-field">
                  Heading
                  <textarea
                    rows={4}
                    maxLength={500}
                    value={page.style.heading ?? ""}
                    onChange={(e) =>
                      patchStyle(
                        { heading: e.target.value, headingHtml: undefined },
                        "heading",
                      )
                    }
                    placeholder="Your main idea…"
                  />
                </label>
                <label className="te-field">
                  Body
                  <textarea
                    rows={6}
                    maxLength={2000}
                    value={page.style.body ?? ""}
                    onChange={(e) =>
                      patchStyle(
                        { body: e.target.value, bodyHtml: undefined },
                        "body",
                      )
                    }
                    placeholder="Bring your idea to life…"
                  />
                </label>
                <div className="te-panel-heading">
                  <h2>Post caption</h2>
                  <span>ALL PAGES</span>
                </div>
                <label className="te-field">
                  <span className="te-sr-only">Post caption</span>
                  <textarea
                    rows={5}
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
            {tab === "media" && (
              <>
                <div className="te-panel-heading">
                  <h2>Your imagery</h2>
                </div>
                <button
                  className="te-upload"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  <ImageIcon size={28} />
                  <strong>
                    {uploading ? "Preparing image…" : "Upload an image"}
                  </strong>
                  <span>JPG, PNG or WebP · up to 15 MB</span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  accept="image/jpeg,image/png,image/webp"
                  onChange={upload}
                />
                <p className="te-help">
                  Replaces the image on this page. Uploaded images are saved
                  with your design.
                </p>
                <Range
                  label="Image zoom"
                  value={page.style.mediaScale ?? 1}
                  min={1}
                  max={3}
                  step={0.05}
                  unit="×"
                  onChange={(mediaScale) =>
                    patchStyle({ mediaScale }, "mediaScale")
                  }
                />
                <Range
                  label="Horizontal crop"
                  value={page.style.mediaInX ?? 0}
                  min={-50}
                  max={50}
                  onChange={(mediaInX) => patchStyle({ mediaInX }, "mediaInX")}
                />
                <Range
                  label="Vertical crop"
                  value={page.style.mediaInY ?? 0}
                  min={-50}
                  max={50}
                  onChange={(mediaInY) => patchStyle({ mediaInY }, "mediaInY")}
                />
                <Range
                  label="Image opacity"
                  value={Math.round((page.style.mediaOpacity ?? 1) * 100)}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(value) =>
                    patchStyle({ mediaOpacity: value / 100 }, "mediaOpacity")
                  }
                />
                <div className="te-panel-heading">
                  <h2>Images in this design</h2>
                </div>
                <div className="te-media-grid">
                  {design.pages.map((p) => (
                    <button
                      key={p.id}
                      onClick={() =>
                        commit((d) => ({
                          ...d,
                          pages: d.pages.map((target) =>
                            target.id === page.id
                              ? {
                                  ...target,
                                  image: { ...p.image, id: target.image.id },
                                }
                              : target,
                          ),
                        }))
                      }
                      aria-label={`Use image from page ${design.pages.indexOf(p) + 1}`}
                    >
                      <DesignPreview
                        design={{
                          ...design,
                          pages: [{ ...p, style: { template: "plain" } }],
                        }}
                        page={{ ...p, style: { template: "plain" } }}
                      />
                    </button>
                  ))}
                </div>
              </>
            )}
            {tab === "style" && inspector}
          </fieldset>
        </aside>
        <main className="te-canvas-column">
          <div className="te-canvas-toolbar">
            <label>
              Format
              <select
                aria-label="Design format"
                disabled={disabled}
                value={design.format}
                onChange={(e) => {
                  commit((d) => ({
                    ...d,
                    format: e.target.value as DesignFormat,
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
            <span>
              {index + 1} / {design.pages.length}
            </span>
          </div>
          <div className="te-canvas-space" ref={workspaceRef}>
            <div
              className="te-canvas-stage"
              style={{ width: FRAME_WIDTH * Math.max(0.15, fit) * zoom }}
            >
              <DesignPreview
                design={design}
                page={page}
                selected={selected}
                onSet={disabled ? undefined : (patch) => patchStyle(patch)}
                onSelect={(element) => {
                  setSelected(element);
                  if (element === "text") setTab("content");
                  if (element === "media") setTab("media");
                }}
              />
            </div>
          </div>
          <div className="te-canvas-bottom">
            <span>
              Page {index + 1} ·{" "}
              {TEMPLATES.find((t) => t.id === page.style.template)?.label}
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
                    setSelected(null);
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
