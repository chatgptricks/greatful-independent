"use client";

import { useRef, useState, type ChangeEvent } from "react";
import {
  SearchIcon,
  PlusIcon,
  LayoutIcon,
  CopyIcon,
  TrashIcon,
  DownloadIcon,
  ArrowRightIcon,
  StarIcon,
} from "@/components/grateful-future/icons";
import {
  BUILT_IN_TEMPLATES,
  FORMATS,
  createDesign,
  createBlankTemplateDesign,
  editTemplateDesign,
  cloneDesign,
  parseLibrary,
  type DesignDocument,
  type DesignTemplate,
  type DesignFormat,
} from "@/lib/template-editor/model";
import { useEditorLibrary } from "@/lib/template-editor/use-library";
import { saveBlob } from "@/lib/template-editor/export";
import { GF_FONT_VARS } from "@/app/admin/(tool)/grateful-future/fonts";
import { DesignPreview } from "./preview";
import { DesignEditor } from "./design-editor";
import { ColorField, FontSelect, Modal } from "./controls";
import "./studio.css";

export function templatePreview(template: DesignTemplate): DesignDocument {
  return {
    id: template.id,
    name: template.name,
    templateId: template.id,
    format: template.format,
    pages: template.pages,
    caption: "",
    createdAt: "",
    updatedAt: "",
  };
}

export default function TemplateStudio() {
  const {
    library,
    ready,
    status,
    error,
    setLibrary,
    retrySave,
    reloadServer,
    canEdit,
  } = useEditorLibrary();
  const [view, setView] = useState<"templates" | "designs" | "brand">(
    "templates",
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All templates");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<{
    kind: "design" | "template";
    id: string;
    name: string;
  } | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState<{
    name: string;
    format: DesignFormat;
  } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const templates = [...BUILT_IN_TEMPLATES, ...library.templates];
  const active = library.designs.find((d) => d.id === activeId);
  const statusText = {
    loading: "Opening workspace…",
    saving: "Saving…",
    saved: "Saved to cloud",
    local: "Saved on this computer",
    error: "Save needs attention",
    conflict: "Newer version available",
  }[status];

  function openTemplate(template: DesignTemplate) {
    if (!canEdit) return;
    const document = createDesign(template);
    setLibrary((current) => ({
      ...current,
      designs: [document, ...current.designs],
    }));
    setActiveId(document.id);
  }
  function openTemplateEditor(template: DesignTemplate) {
    const draft = library.designs.find(
      (d) => d.purpose === "template" && d.editingTemplateId === template.id,
    );
    if (draft) {
      setActiveId(draft.id);
      return;
    }
    if (!canEdit || library.designs.length >= 150) return;
    const document = editTemplateDesign(template);
    setLibrary((current) => ({
      ...current,
      designs: [document, ...current.designs],
    }));
    setActiveId(document.id);
  }
  async function importLibrary(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 30 * 1024 * 1024)
        throw new Error("Choose a backup smaller than 30 MB.");
      const imported = parseLibrary(JSON.parse(await file.text()));
      if (!imported)
        throw new Error("This file is not a valid Greatful workspace backup.");
      if (
        library.designs.length + imported.designs.length > 150 ||
        library.templates.length + imported.templates.length > 80
      )
        throw new Error(
          "This backup would exceed the workspace limit. Export and remove older designs first.",
        );
      const templateIds = new Map(
        imported.templates.map((template) => [
          template.id,
          crypto.randomUUID(),
        ]),
      );
      const restoredTemplates = imported.templates.map((template) => ({
        ...template,
        id: templateIds.get(template.id)!,
        custom: true,
      }));
      const restoredDesigns = imported.designs.map((design) => ({
        ...cloneDesign(design),
        templateId: templateIds.get(design.templateId) ?? design.templateId,
        ...(design.purpose === "template"
          ? {
              purpose: "template" as const,
              editingTemplateId: design.editingTemplateId
                ? (templateIds.get(design.editingTemplateId) ??
                  design.editingTemplateId)
                : undefined,
            }
          : {}),
      }));
      setLibrary((current) => ({
        ...current,
        designs: [...restoredDesigns, ...current.designs],
        templates: [...current.templates, ...restoredTemplates],
        brand: { ...imported.brand },
      }));
      setView("designs");
      setMessage(
        `Imported ${imported.designs.length} designs and ${imported.templates.length} templates.`,
      );
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Could not import that backup.",
      );
    }
  }
  function backup() {
    saveBlob(
      new Blob([JSON.stringify(library, null, 2)], {
        type: "application/json",
      }),
      "greatful-workspace.json",
    );
  }

  return (
    <div className={`gf-root te-root ${GF_FONT_VARS}`}>
      {(error || status === "conflict") && (
        <div className="te-save-error" role="alert">
          <span>
            {error ||
              "Another window saved newer changes. Your edits are preserved locally."}
          </span>
          <button onClick={retrySave}>Retry</button>
          {status === "conflict" && (
            <button onClick={() => setConflictOpen(true)}>
              Load saved version
            </button>
          )}
          <button onClick={backup}>Download backup</button>
        </div>
      )}
      {!ready ? (
        <div className="gf-center">
          <p>Opening your workspace…</p>
        </div>
      ) : active ? (
        <DesignEditor
          key={active.id}
          design={active}
          templates={templates}
          brand={library.brand}
          saveStatus={statusText}
          canEdit={canEdit}
          onExit={() => {
            setActiveId(null);
            setView(active.purpose === "template" ? "templates" : "designs");
            if (active.purpose === "template") setCategory("My templates");
          }}
          onChange={(design) =>
            setLibrary((current) => ({
              ...current,
              designs: current.designs.map((d) =>
                d.id === design.id ? design : d,
              ),
            }))
          }
          onSaveTemplate={(template) => {
            const existingId =
              active.purpose === "template"
                ? active.editingTemplateId
                : undefined;
            if (
              library.templates.length >= 80 &&
              !library.templates.some((t) => t.id === existingId)
            )
              throw new Error("Your library has reached 80 custom templates.");
            setLibrary((current) => ({
              ...current,
              templates: [
                { ...template, id: existingId ?? template.id },
                ...current.templates.filter((t) => t.id !== existingId),
              ],
              designs:
                active.purpose === "template"
                  ? current.designs.filter((d) => d.id !== active.id)
                  : current.designs,
            }));
            if (active.purpose === "template") {
              setActiveId(null);
              setView("templates");
              setCategory("My templates");
              setQuery("");
              setMessage(
                existingId
                  ? "Template updated. Existing posts keep their own content and styling."
                  : "Template created. Use it as the starting point for your next post.",
              );
            }
          }}
        />
      ) : (
        <>
          <header className="te-home-header">
            <a className="te-wordmark" href="/admin/grateful-future">
              <span className="te-logo" aria-hidden>
                g.
              </span>
              <span>
                greatful<span className="te-wordmark-sub">template studio</span>
              </span>
            </a>
            <div className="te-header-right">
              <span className="te-save-status" role="status">
                <span className="te-status-dot" />
                {statusText}
              </span>
              <button
                className="te-button te-new-design"
                onClick={() => openTemplate(BUILT_IN_TEMPLATES[0])}
                disabled={!canEdit || library.designs.length >= 150}
              >
                <PlusIcon />
                New design
              </button>
              <button
                className="te-button te-primary"
                disabled={
                  !canEdit ||
                  library.designs.length >= 150 ||
                  library.templates.length >= 80
                }
                onClick={() =>
                  setNewTemplate({
                    name: "Untitled template",
                    format: "portrait",
                  })
                }
              >
                <PlusIcon />
                Create template
              </button>
            </div>
          </header>
          <div className="te-home-shell">
            <aside className="te-home-sidebar">
              <span className="te-eyebrow">WORKSPACE</span>
              <nav aria-label="Workspace">
                {(
                  [
                    ["templates", "Templates", LayoutIcon],
                    ["designs", "Your designs", CopyIcon],
                    ["brand", "Brand kit", StarIcon],
                  ] as const
                ).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    className={view === id ? "is-active" : ""}
                    onClick={() => {
                      setView(id);
                      setQuery("");
                    }}
                  >
                    <Icon size={18} />
                    {label}
                    {id === "designs" && <span>{library.designs.length}</span>}
                  </button>
                ))}
              </nav>
              <div className="te-sidebar-bottom">
                <a href="/admin/grateful-future/research">
                  Research workspace
                  <ArrowRightIcon size={15} />
                </a>
                <p>
                  A starting point for every
                  <br />
                  story you want to tell.
                </p>
              </div>
            </aside>
            <main className="te-home-main">
              {message && (
                <div className="te-notice" role="status">
                  {message}
                  <button
                    onClick={() => setMessage("")}
                    aria-label="Dismiss notification"
                  >
                    ×
                  </button>
                </div>
              )}
              {view === "templates" && (
                <>
                  <section className="te-hero">
                    <div>
                      <span className="te-eyebrow">
                        LESS SETUP. MORE CREATING.
                      </span>
                      <h1>
                        Good posts start
                        <br />
                        with a great template.
                      </h1>
                      <p>
                        Pick a starting point. Make it yours.
                        <br />
                        Create something worth sharing.
                      </p>
                      <button
                        className="te-button te-primary"
                        onClick={() => openTemplate(BUILT_IN_TEMPLATES[0])}
                        disabled={!canEdit || library.designs.length >= 150}
                      >
                        Create a carousel
                        <ArrowRightIcon size={16} />
                      </button>
                    </div>
                    <div className="te-hero-art" aria-hidden>
                      <div>
                        <DesignPreview
                          design={templatePreview(BUILT_IN_TEMPLATES[1])}
                          page={BUILT_IN_TEMPLATES[1].pages[0]}
                        />
                      </div>
                      <div>
                        <DesignPreview
                          design={templatePreview(BUILT_IN_TEMPLATES[0])}
                          page={BUILT_IN_TEMPLATES[0].pages[0]}
                        />
                      </div>
                      <div>
                        <DesignPreview
                          design={templatePreview(BUILT_IN_TEMPLATES[2])}
                          page={BUILT_IN_TEMPLATES[2].pages[0]}
                        />
                      </div>
                    </div>
                  </section>
                  <div className="te-section-heading">
                    <div>
                      <h2>Find your starting point</h2>
                      <p>Defined layouts. Endless possibilities.</p>
                    </div>
                    <label className="te-search">
                      <SearchIcon />
                      <input
                        aria-label="Search templates"
                        placeholder="Search templates…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="te-filter-row">
                    {[
                      "All templates",
                      ...new Set(BUILT_IN_TEMPLATES.map((t) => t.category)),
                      "My templates",
                    ].map((item) => (
                      <button
                        key={item}
                        className={category === item ? "is-active" : ""}
                        onClick={() => setCategory(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  <div className="te-template-grid">
                    {category === "My templates" &&
                      library.designs
                        .filter((d) => d.purpose === "template")
                        .map((draft) => (
                          <article className="te-template-card" key={draft.id}>
                            <button
                              className="te-template-open"
                              onClick={() => setActiveId(draft.id)}
                            >
                              <div className="te-template-art">
                                <DesignPreview
                                  design={draft}
                                  page={draft.pages[0]}
                                />
                                <span className="te-page-count">
                                  TEMPLATE DRAFT
                                </span>
                                <span className="te-card-action">
                                  Continue editing
                                  <ArrowRightIcon size={15} />
                                </span>
                              </div>
                              <span className="te-card-name">{draft.name}</span>
                              <span className="te-card-description">
                                Your changes are autosaved. Save the template
                                when it’s ready.
                              </span>
                            </button>
                          </article>
                        ))}
                    {category === "My templates" && (
                      <button
                        className="te-blank-template"
                        disabled={
                          !canEdit ||
                          library.designs.length >= 150 ||
                          library.templates.length >= 80
                        }
                        onClick={() =>
                          setNewTemplate({
                            name: "Untitled template",
                            format: "portrait",
                          })
                        }
                      >
                        <PlusIcon size={26} />
                        <strong>Create a template</strong>
                        <span>Start with a blank canvas</span>
                      </button>
                    )}
                    {templates
                      .filter(
                        (t) =>
                          (category === "All templates" ||
                            (category === "My templates"
                              ? t.custom
                              : t.category === category)) &&
                          `${t.name} ${t.description} ${t.category}`
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                      )
                      .map((template) => (
                        <article className="te-template-card" key={template.id}>
                          <button
                            className="te-template-open"
                            disabled={!canEdit || library.designs.length >= 150}
                            onClick={() => openTemplate(template)}
                            aria-label={`Use ${template.name} template`}
                          >
                            <div className="te-template-art">
                              <DesignPreview
                                design={templatePreview(template)}
                                page={template.pages[0]}
                              />
                              <span className="te-card-action">
                                Use template
                                <ArrowRightIcon size={15} />
                              </span>
                              <span className="te-page-count">
                                {template.pages.length > 1
                                  ? `${template.pages.length} pages`
                                  : FORMATS[template.format].label}
                              </span>
                            </div>
                            <span className="te-card-name">
                              {template.name}
                            </span>
                            <span className="te-card-description">
                              {template.description}
                            </span>
                          </button>
                          {template.custom && (
                            <div className="te-design-actions">
                              <button
                                className="te-icon"
                                title="Edit template"
                                aria-label={`Edit ${template.name} template`}
                                disabled={
                                  !canEdit || library.designs.length >= 150
                                }
                                onClick={() => openTemplateEditor(template)}
                              >
                                <LayoutIcon />
                              </button>
                              <button
                                className="te-icon"
                                title="Delete template"
                                aria-label={`Delete ${template.name} template`}
                                onClick={() =>
                                  setConfirm({
                                    kind: "template",
                                    id: template.id,
                                    name: template.name,
                                  })
                                }
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          )}
                        </article>
                      ))}
                  </div>
                  {!(
                    category === "My templates" &&
                    library.designs.some((d) => d.purpose === "template")
                  ) &&
                    !templates.some(
                      (t) =>
                        (category === "All templates" ||
                          (category === "My templates"
                            ? t.custom
                            : t.category === category)) &&
                        `${t.name} ${t.description} ${t.category}`
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                    ) && (
                      <div className="te-empty">
                        <LayoutIcon size={28} />
                        <h3>
                          {category === "My templates"
                            ? "Your next signature template starts here."
                            : "No templates found."}
                        </h3>
                        <p>
                          {category === "My templates"
                            ? "Choose Create template to build one from a blank canvas."
                            : "Try a different search or category."}
                        </p>
                      </div>
                    )}
                </>
              )}
              {view === "designs" && (
                <>
                  <div className="te-section-heading">
                    <div>
                      <span className="te-eyebrow">
                        PICK UP WHERE YOU LEFT OFF
                      </span>
                      <h1>Your designs</h1>
                      <p>Your posts, carousels, and ideas in progress.</p>
                    </div>
                    <div className="te-actions">
                      <button className="te-button" onClick={backup}>
                        <DownloadIcon />
                        Backup
                      </button>
                      <button
                        className="te-button"
                        disabled={!canEdit}
                        onClick={() => importRef.current?.click()}
                      >
                        Import backup
                      </button>
                      <input
                        type="file"
                        ref={importRef}
                        hidden
                        accept="application/json,.json"
                        onChange={importLibrary}
                      />
                    </div>
                  </div>
                  <label className="te-search te-design-search">
                    <SearchIcon />
                    <input
                      aria-label="Search designs"
                      placeholder="Find a design…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <div className="te-template-grid">
                    {library.designs
                      .filter((d) =>
                        d.name.toLowerCase().includes(query.toLowerCase()),
                      )
                      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                      .map((design) => (
                        <article className="te-template-card" key={design.id}>
                          <button
                            className="te-template-open"
                            onClick={() => setActiveId(design.id)}
                          >
                            <div className="te-template-art">
                              <DesignPreview
                                design={design}
                                page={design.pages[0]}
                              />
                              <span className="te-page-count">
                                {design.purpose === "template"
                                  ? "Template draft · "
                                  : ""}
                                {design.pages.length}{" "}
                                {design.pages.length === 1 ? "page" : "pages"}
                              </span>
                              <span className="te-card-action">
                                Open design
                                <ArrowRightIcon size={15} />
                              </span>
                            </div>
                            <span className="te-card-name">{design.name}</span>
                            <span className="te-card-description">
                              Edited{" "}
                              {new Date(design.updatedAt).toLocaleDateString(
                                undefined,
                                { month: "short", day: "numeric" },
                              )}
                            </span>
                          </button>
                          <div className="te-design-actions">
                            <button
                              className="te-icon"
                              title="Duplicate design"
                              aria-label={`Duplicate ${design.name}`}
                              disabled={
                                !canEdit || library.designs.length >= 150
                              }
                              onClick={() => {
                                const copy = cloneDesign(design);
                                setLibrary((current) => ({
                                  ...current,
                                  designs: [copy, ...current.designs],
                                }));
                              }}
                            >
                              <CopyIcon />
                            </button>
                            <button
                              className="te-icon"
                              title="Delete design"
                              aria-label={`Delete ${design.name}`}
                              disabled={!canEdit}
                              onClick={() =>
                                setConfirm({
                                  kind: "design",
                                  id: design.id,
                                  name: design.name,
                                })
                              }
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </article>
                      ))}
                  </div>
                  {!library.designs.length && (
                    <div className="te-empty">
                      <CopyIcon size={32} />
                      <h3>Your first design is one template away.</h3>
                      <p>Choose a layout, add your words, and make it yours.</p>
                      <button
                        className="te-button te-primary"
                        onClick={() => setView("templates")}
                      >
                        Explore templates
                        <ArrowRightIcon />
                      </button>
                    </div>
                  )}
                  {library.designs.length > 0 &&
                    !library.designs.some((d) =>
                      d.name.toLowerCase().includes(query.toLowerCase()),
                    ) && (
                      <div className="te-empty">
                        <h3>No matching designs.</h3>
                        <p>Try another search.</p>
                      </div>
                    )}
                </>
              )}
              {view === "brand" && (
                <>
                  <div className="te-section-heading">
                    <div>
                      <span className="te-eyebrow">
                        MAKE IT RECOGNIZABLY YOURS
                      </span>
                      <h1>Your brand, on repeat.</h1>
                      <p>
                        Keep your go-to colors and type ready for every design.
                      </p>
                    </div>
                  </div>
                  <div className="te-brand-layout">
                    <fieldset className="te-brand-form" disabled={!canEdit}>
                      <label className="te-field">
                        Brand name
                        <input
                          value={library.brand.name}
                          maxLength={100}
                          onChange={(e) =>
                            setLibrary((current) => ({
                              ...current,
                              brand: { ...current.brand, name: e.target.value },
                            }))
                          }
                        />
                      </label>
                      <FontSelect
                        value={library.brand.font}
                        onChange={(font) =>
                          setLibrary((current) => ({
                            ...current,
                            brand: { ...current.brand, font },
                          }))
                        }
                      />
                      <ColorField
                        label="Background color"
                        value={library.brand.background}
                        onChange={(background) =>
                          setLibrary((current) => ({
                            ...current,
                            brand: { ...current.brand, background },
                          }))
                        }
                      />
                      <ColorField
                        label="Text color"
                        value={library.brand.text}
                        onChange={(text) =>
                          setLibrary((current) => ({
                            ...current,
                            brand: { ...current.brand, text },
                          }))
                        }
                      />
                      <p className="te-help">
                        Use “Apply brand” in the editor to apply these settings
                        to every page. Template layouts and your content stay in
                        place.
                      </p>
                    </fieldset>
                    <div
                      className={`te-brand-sample gf-font-${library.brand.font}`}
                      style={{
                        background: library.brand.background,
                        color: library.brand.text,
                      }}
                    >
                      <span>YOUR BRAND, DEFINED.</span>
                      <strong>{library.brand.name || "Your brand"}</strong>
                      <p>
                        Good things deserve
                        <br />a signature style.
                      </p>
                      <span>MADE WITH GREATFUL ↗</span>
                    </div>
                  </div>
                </>
              )}
            </main>
          </div>
        </>
      )}
      {newTemplate && (
        <Modal title="Create a template" onClose={() => setNewTemplate(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (
                !canEdit ||
                library.designs.length >= 150 ||
                library.templates.length >= 80
              )
                return;
              const document = createBlankTemplateDesign(
                newTemplate.name.trim() || "Untitled template",
                newTemplate.format,
              );
              setLibrary((current) => ({
                ...current,
                designs: [document, ...current.designs],
              }));
              setActiveId(document.id);
              setNewTemplate(null);
            }}
          >
            <p>
              Start with an empty canvas. Add your own text, images, colors, and
              pages to build a reusable template.
            </p>
            <label className="te-field">
              Template name
              <input
                autoFocus
                required
                maxLength={100}
                value={newTemplate.name}
                onChange={(event) =>
                  setNewTemplate({ ...newTemplate, name: event.target.value })
                }
              />
            </label>
            <fieldset className="te-format-options">
              <legend>Choose a format</legend>
              {Object.entries(FORMATS).map(([id, format]) => (
                <label
                  key={id}
                  className={newTemplate.format === id ? "is-active" : ""}
                >
                  <input
                    type="radio"
                    name="template-format"
                    value={id}
                    checked={newTemplate.format === id}
                    onChange={() =>
                      setNewTemplate({
                        ...newTemplate,
                        format: id as DesignFormat,
                      })
                    }
                  />
                  <span
                    className="te-format-shape"
                    style={{ aspectRatio: `${format.width}/${format.height}` }}
                  />
                  <strong>{format.label}</strong>
                  <small>
                    {format.width} × {format.height}
                  </small>
                </label>
              ))}
            </fieldset>
            <div className="te-modal-actions">
              <button
                className="te-button"
                type="button"
                onClick={() => setNewTemplate(null)}
              >
                Cancel
              </button>
              <button className="te-button te-primary" disabled={!canEdit}>
                Open template editor
                <ArrowRightIcon size={15} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={`Delete ${confirm.kind}?`}
          onClose={() => setConfirm(null)}
        >
          <p>“{confirm.name}” will be removed from your workspace.</p>
          <div className="te-modal-actions">
            <button className="te-button" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button
              className="te-button te-primary"
              onClick={() => {
                setLibrary((current) =>
                  confirm.kind === "design"
                    ? {
                        ...current,
                        designs: current.designs.filter(
                          (d) => d.id !== confirm.id,
                        ),
                      }
                    : {
                        ...current,
                        templates: current.templates.filter(
                          (t) => t.id !== confirm.id,
                        ),
                      },
                );
                setConfirm(null);
              }}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
      {conflictOpen && (
        <Modal
          title="Load the saved version?"
          onClose={() => setConflictOpen(false)}
        >
          <p>
            This replaces your local edits with the latest saved workspace.
            Download a backup first if you want to keep your current changes.
          </p>
          <div className="te-modal-actions">
            <button className="te-button" onClick={backup}>
              Download backup
            </button>
            <button
              className="te-button te-primary"
              onClick={() => {
                setActiveId(null);
                setConflictOpen(false);
                void reloadServer();
              }}
            >
              Load saved version
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
