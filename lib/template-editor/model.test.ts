import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILT_IN_TEMPLATES,
  DEFAULT_BRAND,
  EMPTY_LIBRARY,
  FORMATS,
  cloneDesign,
  createBlankTemplateDesign,
  createDesign,
  designAsTemplate,
  duplicatePage,
  editTemplateDesign,
  parseLibrary,
  storyForDesign,
  type EditorLibrary,
} from "./model";

function library(): EditorLibrary {
  return {
    version: 1,
    designs: [createDesign(BUILT_IN_TEMPLATES[0])],
    templates: [],
    brand: { ...DEFAULT_BRAND },
  };
}

test("every built-in template can become a valid, independent persisted design", () => {
  const designs = BUILT_IN_TEMPLATES.map(createDesign);
  assert.equal(BUILT_IN_TEMPLATES.length, 8);
  assert.ok(designs.some((d) => d.pages.length >= 3));
  assert.ok(designs.some((d) => d.format === "story"));
  const original: EditorLibrary = { ...EMPTY_LIBRARY, designs };
  assert.deepEqual(parseLibrary(JSON.stringify(original)), original);
  assert.deepEqual(FORMATS.story, {
    label: "Story",
    width: 1080,
    height: 1920,
  });
  for (const design of designs) {
    const template = BUILT_IN_TEMPLATES.find(
      (t) => t.id === design.templateId,
    )!;
    assert.notEqual(design.pages[0].id, template.pages[0].id);
    assert.notEqual(design.pages[0].image.id, template.pages[0].image.id);
    assert.notEqual(design.pages[0].style, template.pages[0].style);
  }
});

test("copying a design isolates page, image and style changes from the original", () => {
  const original = createDesign(BUILT_IN_TEMPLATES[0]);
  original.caption = "A caption worth keeping";
  const copy = cloneDesign(original);
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.name, `${original.name} copy`);
  assert.equal(copy.caption, original.caption);
  copy.pages[0].style.heading = "Changed";
  copy.pages[0].image.url = "/another-image.png";
  assert.notEqual(copy.pages[0].style.heading, original.pages[0].style.heading);
  assert.notEqual(copy.pages[0].image.url, original.pages[0].image.url);
  assert.equal(
    new Set([...original.pages, ...copy.pages].map((p) => p.image.id)).size,
    original.pages.length * 2,
  );
});

test("page duplication and saved templates allocate independent identities", () => {
  const design = createDesign(BUILT_IN_TEMPLATES[0]);
  const repeated = duplicatePage(design.pages[0]);
  assert.notEqual(repeated.id, design.pages[0].id);
  assert.notEqual(repeated.image.id, design.pages[0].image.id);
  const template = designAsTemplate(design, "  My series  ");
  assert.equal(template.name, "My series");
  assert.equal(template.custom, true);
  assert.equal(template.format, design.format);
  assert.notEqual(template.pages[0].id, design.pages[0].id);
  template.pages[0].style.heading = "Reusable";
  assert.notEqual(
    template.pages[0].style.heading,
    design.pages[0].style.heading,
  );
  const next = createDesign(template);
  assert.equal(next.templateId, template.id);
  assert.equal(next.pages[0].style.heading, "Reusable");
});

test("renderer adapter preserves page order, every page style, and caption", () => {
  const design = createDesign(BUILT_IN_TEMPLATES[0]);
  design.pages.reverse();
  design.caption = "The edited caption";
  const story = storyForDesign(design);
  assert.equal(story.title, design.name);
  assert.equal(story.leadImageId, design.pages[0].image.id);
  assert.equal(story.caption.draft, design.caption);
  assert.equal(story.curation.captionEdited, design.caption);
  assert.deepEqual(
    story.curation.order,
    design.pages.map((p) => p.image.id),
  );
  assert.deepEqual(story.curation.selectedImageIds, story.curation.order);
  for (const p of design.pages)
    assert.deepEqual(story.curation.slideStyles[p.image.id], p.style);
});

test("malformed, unsupported, and over-capacity libraries cannot replace saved work", () => {
  for (const value of [
    null,
    undefined,
    "{",
    [],
    {},
    { ...EMPTY_LIBRARY, version: 2 },
  ])
    assert.equal(parseLibrary(value), null);
  const invalidPages = library();
  invalidPages.designs[0].pages = [];
  assert.equal(parseLibrary(invalidPages), null);
  invalidPages.designs[0].pages = Array.from({ length: 21 }, () =>
    duplicatePage(BUILT_IN_TEMPLATES[0].pages[0]),
  );
  assert.equal(parseLibrary(invalidPages), null);
  assert.equal(
    parseLibrary({
      ...EMPTY_LIBRARY,
      designs: Array.from({ length: 151 }, () =>
        createDesign(BUILT_IN_TEMPLATES[1]),
      ),
    }),
    null,
  );
  const template = designAsTemplate(
    createDesign(BUILT_IN_TEMPLATES[1]),
    "Reusable",
  );
  assert.equal(
    parseLibrary({
      ...EMPTY_LIBRARY,
      templates: Array.from({ length: 81 }, () => template),
    }),
    null,
  );
  assert.equal(
    parseLibrary({
      ...library(),
      brand: { ...DEFAULT_BRAND, font: "url(https://example.com)" },
    }),
    null,
  );
});

test("unsafe rich HTML is dropped while its plain text remains usable", () => {
  for (const html of [
    '<img src="x" onerror="alert(1)">',
    '<svg onload="alert(1)"></svg>',
    '<b onclick="alert(1)">A thought</b>',
    '<span style="background:url(https://example.com)">A thought</span>',
    '<span class="gf-font-geist" onmouseover="alert(1)">A thought</span>',
    "<style>body { display: none; }</style>",
    "<b><i>unbalanced</b></i>",
    '<span style="font-weight:700; color:red">A thought</span>',
  ]) {
    const input = library();
    input.designs[0].pages[0].style.heading = "Safe plain text";
    input.designs[0].pages[0].style.headingHtml = html;
    input.designs[0].pages[0].style.bodyHtml = html;
    const parsed = parseLibrary(input)!;
    assert.ok(parsed);
    assert.equal(parsed.designs[0].pages[0].style.heading, "Safe plain text");
    assert.equal(parsed.designs[0].pages[0].style.headingHtml, undefined);
    assert.equal(parsed.designs[0].pages[0].style.bodyHtml, undefined);
  }
});

test("supported inline formatting survives round trips without introducing arbitrary attributes", () => {
  const input = library();
  const html =
    '<b>Hello</b><br><span class="gf-font-geist" style="font-weight: 700; font-style: italic; text-decoration-line: underline">world &amp; everyone</span>';
  input.designs[0].pages[0].style.headingHtml = html;
  const parsed = parseLibrary(input)!;
  assert.equal(parsed.designs[0].pages[0].style.headingHtml, html);
  assert.deepEqual(parseLibrary(JSON.stringify(parsed)), parsed);
});

test("image imports reject executable or temporary URLs and mislabeled raster payloads", () => {
  for (const url of [
    "javascript:alert(1)",
    "blob:https://example.com/id",
    "file:///etc/passwd",
    "//example.com/track.png",
    "/%2fexample.com/x",
    "https://user:password@example.com/x.png",
    "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=",
    "data:image/png;base64,PHNjcmlwdD4=",
    "data:image/png;base64,not*base64",
  ]) {
    const input = library();
    input.designs[0].pages[0].image.url = url;
    assert.equal(parseLibrary(input), null, url);
  }
  const input = library();
  input.designs[0].pages[0].image.url =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5ioAAAAASUVORK5CYII=";
  assert.ok(parseLibrary(input));
  input.designs[0].pages[0].image.url = "https://example.com/image.jpg";
  assert.ok(parseLibrary(input));
});

test("duplicate identities and invalid frame dimensions are rejected", () => {
  const input = library();
  input.designs.push({ ...input.designs[0] });
  assert.equal(parseLibrary(input), null);
  input.designs.pop();
  input.designs[0].pages[1].id = input.designs[0].pages[0].id;
  assert.equal(parseLibrary(input), null);
  const duplicatedImage = library();
  duplicatedImage.designs[0].pages[1].image.id =
    duplicatedImage.designs[0].pages[0].image.id;
  assert.equal(parseLibrary(duplicatedImage), null);
  for (const width of [0, -1, Infinity, NaN, 30_001]) {
    const sized = library();
    sized.designs[0].pages[0].image.width = width;
    assert.equal(parseLibrary(sized), null);
  }
});

test("numeric style controls are finite and bounded, and unknown fields are removed", () => {
  const input = library();
  input.designs[0].pages[0].style.textScale = 50;
  input.designs[0].pages[0].style.mediaX = -999;
  input.designs[0].pages[0].style.textOpacity = Infinity;
  input.designs[0].pages[0].style.bgColor =
    "url(https://example.com/track.png)";
  Object.assign(input.designs[0].pages[0].style, {
    extra: "unexpected",
    constructor: { prototype: { polluted: true } },
  });
  const style = parseLibrary(input)!.designs[0].pages[0].style;
  assert.equal(style.textScale, 2.5);
  assert.equal(style.mediaX, -200);
  assert.equal(style.textOpacity, undefined);
  assert.equal(style.bgColor, undefined);
  assert.equal(Object.hasOwn(style, "extra"), false);
  assert.equal(Object.hasOwn(style, "constructor"), false);
});

test("custom template backups round-trip and do not share mutable page objects", () => {
  const input = library();
  input.templates = [designAsTemplate(input.designs[0], "Weekly series")];
  const parsed = parseLibrary(input)!;
  assert.deepEqual(parsed, input);
  parsed.templates[0].pages[0].style.heading = "Changed after loading";
  assert.notEqual(
    input.templates[0].pages[0].style.heading,
    parsed.templates[0].pages[0].style.heading,
  );
  assert.notEqual(
    parsed.templates[0].pages[0].style.heading,
    parsed.designs[0].pages[0].style.heading,
  );
});

test("manual template drafts start blank and retain their purpose after saving", () => {
  const drafts = Object.keys(FORMATS).map((format) =>
    createBlankTemplateDesign(
      "  My new template  ",
      format as keyof typeof FORMATS,
    ),
  );
  for (const draft of drafts) {
    assert.equal(draft.name, "My new template");
    assert.equal(draft.purpose, "template");
    assert.equal(draft.templateId, "blank-template");
    assert.equal(draft.editingTemplateId, undefined);
    assert.equal(draft.caption, "");
    assert.equal(draft.pages.length, 1);
    assert.equal(draft.pages[0].image.url, "/template-editor/folds.svg");
    assert.deepEqual(draft.pages[0].style, {
      template: "text",
      heading: "",
      body: "",
      bgMode: "color",
      bgColor: "#f3efe6",
      textColor: "#263e35",
      font: "geist",
      align: "center",
      textAlign: "left",
    });
  }
  assert.equal(new Set(drafts.map((d) => d.id)).size, drafts.length);
  assert.equal(new Set(drafts.map((d) => d.pages[0].id)).size, drafts.length);
  assert.equal(
    new Set(drafts.map((d) => d.pages[0].image.id)).size,
    drafts.length,
  );
  const input: EditorLibrary = { ...EMPTY_LIBRARY, designs: drafts };
  assert.deepEqual(parseLibrary(JSON.stringify(input)), input);
  assert.equal(
    createBlankTemplateDesign("   ", "portrait").name,
    "Untitled template",
  );
});

test("editing a saved template creates an independent persisted draft", () => {
  const template = designAsTemplate(
    createDesign(BUILT_IN_TEMPLATES[0]),
    "My series",
  );
  const original = structuredClone(template);
  const draft = editTemplateDesign(template);
  const anotherDraft = editTemplateDesign(template);
  assert.equal(draft.purpose, "template");
  assert.equal(draft.editingTemplateId, template.id);
  assert.equal(draft.templateId, template.id);
  assert.equal(draft.format, template.format);
  assert.equal(draft.name, template.name);
  assert.notEqual(draft.id, anotherDraft.id);
  for (const [index, page] of draft.pages.entries()) {
    assert.notEqual(page.id, template.pages[index].id);
    assert.notEqual(page.image.id, template.pages[index].image.id);
    assert.deepEqual(page.style, template.pages[index].style);
  }
  draft.pages[0].style.heading = "Only the draft changes";
  draft.pages[0].image.url = "/another-image.png";
  draft.pages.push(duplicatePage(draft.pages[0]));
  assert.deepEqual(template, original);
  assert.deepEqual(anotherDraft.pages[0].style, original.pages[0].style);
  const input: EditorLibrary = {
    ...EMPTY_LIBRARY,
    designs: [draft],
    templates: [template],
  };
  assert.deepEqual(parseLibrary(JSON.stringify(input)), input);
});

test("using or copying a template produces an ordinary design without an editing target", () => {
  const blank = createBlankTemplateDesign("My template", "square");
  const template = designAsTemplate(blank, blank.name);
  const editingDraft = editTemplateDesign(template);
  const designs = [
    createDesign(template),
    cloneDesign(blank),
    cloneDesign(editingDraft),
  ];
  for (const design of designs) {
    assert.equal(Object.hasOwn(design, "purpose"), false);
    assert.equal(Object.hasOwn(design, "editingTemplateId"), false);
    assert.equal(design.format, "square");
    assert.equal(design.pages[0].style.template, "text");
  }
  assert.equal(editingDraft.purpose, "template");
  assert.equal(editingDraft.editingTemplateId, template.id);
  const input: EditorLibrary = { ...EMPTY_LIBRARY, designs };
  assert.deepEqual(parseLibrary(JSON.stringify(input)), input);
});

test("imported template draft metadata is validated without changing legacy designs", () => {
  const input = library();
  const draft = createBlankTemplateDesign("Manual template", "portrait");
  for (const purpose of ["design", "", null, true, {}]) {
    assert.equal(
      parseLibrary({ ...input, designs: [{ ...draft, purpose }] }),
      null,
    );
  }
  for (const editingTemplateId of ["", "../other", "a b", null, 123, {}]) {
    assert.equal(
      parseLibrary({ ...input, designs: [{ ...draft, editingTemplateId }] }),
      null,
    );
  }
  assert.equal(
    parseLibrary({
      ...input,
      designs: [{ ...input.designs[0], editingTemplateId: "some-template" }],
    }),
    null,
  );
  assert.ok(
    parseLibrary({
      ...input,
      designs: [{ ...draft, editingTemplateId: "some-template" }],
    }),
  );
  assert.deepEqual(parseLibrary(input), input);
});
