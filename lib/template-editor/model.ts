import type { SlideStyle, Story, StoryImage } from "../grateful-future/types";

export type DesignFormat = "portrait" | "square" | "story";

export const FORMATS: Record<
  DesignFormat,
  { label: string; width: number; height: number }
> = {
  portrait: { label: "Portrait post", width: 1080, height: 1350 },
  square: { label: "Square post", width: 1080, height: 1080 },
  story: { label: "Story", width: 1080, height: 1920 },
};

export type DesignPage = { id: string; image: StoryImage; style: SlideStyle };
export type DesignDocument = {
  id: string;
  name: string;
  templateId: string;
  format: DesignFormat;
  pages: DesignPage[];
  caption: string;
  createdAt: string;
  updatedAt: string;
};
export type DesignTemplate = {
  id: string;
  name: string;
  description: string;
  category: string;
  format: DesignFormat;
  pages: DesignPage[];
  custom?: boolean;
};
export type BrandKit = {
  name: string;
  font: string;
  background: string;
  text: string;
};
export type EditorLibrary = {
  version: 1;
  designs: DesignDocument[];
  templates: DesignTemplate[];
  brand: BrandKit;
};

export const DEFAULT_BRAND: BrandKit = {
  name: "My brand",
  font: "geist",
  background: "#f3efe6",
  text: "#263e35",
};
export const EMPTY_LIBRARY: EditorLibrary = {
  version: 1,
  designs: [],
  templates: [],
  brand: { ...DEFAULT_BRAND },
};
export const TEMPLATE_CATEGORIES = [
  "All",
  "Editorial",
  "Carousels",
  "Quotes",
  "Announcements",
  "Education",
  "Stories",
];

function page(key: string, artwork: string, style: SlideStyle): DesignPage {
  return {
    id: `${key}-page`,
    image: {
      id: `${key}-image`,
      url: `/template-editor/${artwork}.svg`,
      source: "upload",
      kind: "atmospheric",
      directive: "",
      width: 1080,
      height: 1350,
      rightsNote: "Original Greatful template artwork",
      cosmosManual: false,
      description: "Abstract editorial artwork. Replace with your own image.",
      mediaType: "image",
    },
    style,
  };
}

const ink = "#273f35";
const paper = "#f4efe5";

export const BUILT_IN_TEMPLATES: DesignTemplate[] = [
  {
    id: "slow-mornings",
    name: "Slow mornings",
    category: "Carousels",
    format: "portrait",
    description:
      "A four-page story with a striking cover, a thought, and room to reflect.",
    pages: [
      page("slow-1", "forest", {
        template: "fullbleed",
        heading: "Make room\nfor slower days.",
        body: "A LITTLE LESS RUSH. A LITTLE MORE LIFE.  →",
        font: "dmserif",
        align: "bottom",
        textAlign: "left",
        textScale: 1.2,
      }),
      page("slow-2", "forest", {
        template: "quote",
        heading: "You do not have to fill every quiet moment.",
        body: "01 / LEAVE SOME SPACE",
        font: "dmserif",
        bgMode: "color",
        bgColor: paper,
        textColor: ink,
        textScale: 1.15,
      }),
      page("slow-3", "dunes", {
        template: "stacked",
        heading: "Find your own pace.",
        body: "Choose one small thing to do with your full attention today.",
        font: "dmserif",
        bgMode: "color",
        bgColor: paper,
        textColor: ink,
        mediaRadius: 4,
      }),
      page("slow-4", "forest", {
        template: "overlay",
        heading: "Start with\none quiet minute.",
        body: "SAVE THIS FOR YOUR NEXT SLOW MORNING",
        font: "dmserif",
        textScale: 1.2,
      }),
    ],
  },
  {
    id: "quiet-thought",
    name: "A thought worth keeping",
    category: "Quotes",
    format: "portrait",
    description: "An elegant, type-led quote in warm paper and forest green.",
    pages: [
      page("thought", "folds", {
        template: "quote",
        heading: "Good things\ntake their\nown time.",
        body: "A NOTE TO MYSELF",
        font: "dmserif",
        bgMode: "color",
        bgColor: "#dce5d8",
        textColor: ink,
        textScale: 1.35,
        lineHeight: 1.05,
      }),
    ],
  },
  {
    id: "studio-notes",
    name: "Studio notes",
    category: "Editorial",
    format: "portrait",
    description:
      "A considered image-and-text composition for stories, ideas, and discoveries.",
    pages: [
      page("studio", "dunes", {
        template: "stacked",
        heading: "The beauty\nin between.",
        body: "STUDIO NOTES — VOL. 01\nA new perspective on the everyday.",
        font: "dmserif",
        textScale: 1.25,
        textAlign: "left",
        bgMode: "color",
        bgColor: paper,
        textColor: "#533c2a",
        mediaRadius: 3,
      }),
    ],
  },
  {
    id: "new-chapter",
    name: "Something new",
    category: "Announcements",
    format: "square",
    description:
      "Bold color and confident typography for a launch or an important date.",
    pages: [
      page("chapter", "coral", {
        template: "overlay",
        heading: "A new\nchapter.",
        body: "SOMETHING GOOD IS COMING.\nOCTOBER 24 · SAVE THE DATE",
        font: "space",
        textScale: 1.65,
        fontWeight: 700,
        textAlign: "left",
        align: "bottom",
        textColor: "#fff6e6",
        lineHeight: 0.9,
      }),
    ],
  },
  {
    id: "small-rituals",
    name: "Small rituals, big ideas",
    category: "Education",
    format: "portrait",
    description:
      "A ready-to-write five-page lesson: cover, three useful ideas, and a closing prompt.",
    pages: [
      page("ritual-1", "folds", {
        template: "stacked",
        heading: "3 small rituals.\nA fresh perspective.",
        body: "YOUR EVERYDAY FIELD GUIDE  →",
        font: "geist",
        fontWeight: 700,
        bgMode: "color",
        bgColor: "#e9eedb",
        textColor: ink,
        textAlign: "left",
      }),
      page("ritual-2", "folds", {
        template: "overlay",
        heading: "01\nBegin with less.",
        body: "Clear a little space. Choose one thing that deserves your attention.",
        font: "geist",
        fontWeight: 700,
        bgMode: "color",
        bgColor: ink,
        mediaOpacity: 0,
        textAlign: "left",
        textScale: 1.15,
      }),
      page("ritual-3", "dunes", {
        template: "stacked",
        heading: "02\nNotice the ordinary.",
        body: "Write down something you usually walk past. There is a story in the details.",
        font: "geist",
        fontWeight: 700,
        bgMode: "color",
        bgColor: paper,
        textColor: ink,
        textAlign: "left",
      }),
      page("ritual-4", "orbits", {
        template: "overlay",
        heading: "03\nMake it yours.",
        body: "Start small enough to repeat. A useful ritual fits the life you already have.",
        font: "geist",
        fontWeight: 700,
        textAlign: "left",
        textScale: 1.15,
      }),
      page("ritual-5", "folds", {
        template: "overlay",
        heading: "Which one\nwill you try?",
        body: "SAVE YOUR FAVORITE.\nSHARE IT WITH SOMEONE WHO NEEDS IT.",
        font: "geist",
        fontWeight: 700,
        textScale: 1.3,
      }),
    ],
  },
  {
    id: "somewhere-quiet",
    name: "Somewhere quiet",
    category: "Stories",
    format: "story",
    description: "A full-height visual story with a calm, cinematic title.",
    pages: [
      page("quiet", "forest", {
        template: "fullbleed",
        heading: "A moment\nto breathe.",
        body: "TAKE THE SCENIC ROUTE",
        font: "dmserif",
        textScale: 1.4,
        align: "bottom",
        textAlign: "left",
      }),
    ],
  },
  {
    id: "form-feeling",
    name: "Form & feeling",
    category: "Editorial",
    format: "square",
    description:
      "An architectural composition for your work, a product, or a visual idea.",
    pages: [
      page("form", "sculpture", {
        template: "stacked",
        heading: "Form & feeling.",
        body: "OBJECTS WITH A POINT OF VIEW",
        font: "space",
        textAlign: "left",
        bgMode: "color",
        bgColor: "#e8e4dd",
        textColor: "#403a32",
        textScale: 1.1,
      }),
    ],
  },
  {
    id: "fresh-perspective",
    name: "A fresh perspective",
    category: "Quotes",
    format: "square",
    description:
      "Bright blue, playful geometry, and a short thought that makes people pause.",
    pages: [
      page("perspective", "orbits", {
        template: "overlay",
        heading: "See things\na little\ndifferently.",
        body: "THERE IS ALWAYS ANOTHER ANGLE.",
        font: "space",
        fontWeight: 700,
        textScale: 1.4,
        lineHeight: 0.9,
        textAlign: "left",
        textColor: "#f7f2df",
      }),
    ],
  },
];

export function duplicatePage(source: DesignPage): DesignPage {
  return {
    id: crypto.randomUUID(),
    image: { ...source.image, id: crypto.randomUUID() },
    style: { ...source.style },
  };
}

export function createDesign(template: DesignTemplate): DesignDocument {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: template.name,
    templateId: template.id,
    format: template.format,
    pages: template.pages.map(duplicatePage),
    caption: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function cloneDesign(design: DesignDocument): DesignDocument {
  const now = new Date().toISOString();
  return {
    ...design,
    id: crypto.randomUUID(),
    name: `${design.name} copy`,
    pages: design.pages.map(duplicatePage),
    createdAt: now,
    updatedAt: now,
  };
}

export function designAsTemplate(
  design: DesignDocument,
  name: string,
): DesignTemplate {
  return {
    id: crypto.randomUUID(),
    name: name.trim() || design.name,
    description: `Your reusable ${design.pages.length}-page template.`,
    category: "My templates",
    format: design.format,
    pages: design.pages.map(duplicatePage),
    custom: true,
  };
}

/** Adapts a design to the established slide renderer and export contract. */
export function storyForDesign(design: DesignDocument): Story {
  const images = design.pages.map((p) => p.image);
  const ids = images.map((image) => image.id);
  return {
    id: design.id,
    title: design.name,
    description: "",
    status: "queue",
    researchCompletedAt: design.createdAt,
    leadImageId: images[0]?.id ?? "",
    techOvert: false,
    dossier: {
      verificationStatus: "unverifiable",
      verifiedFacts: [],
      primarySources: [],
      contestedPoints: [],
    },
    caption: {
      draft: design.caption,
      titleOverImage: { use: false, text: "" },
    },
    images,
    curation: {
      selectedImageIds: ids,
      order: [...ids],
      captionEdited: design.caption,
      publishedAt: null,
      slideStyles: Object.fromEntries(
        design.pages.map((p) => [p.image.id, p.style]),
      ),
    },
  };
}

const FONT_IDS = new Set([
  "serif",
  "sans",
  "walsheim",
  "walsheimcond",
  "kyoto",
  "century",
  "libre",
  "geist",
  "playfair",
  "dmserif",
  "lora",
  "cormorant",
  "crimson",
  "inter",
  "space",
  "montserrat",
  "bebas",
  "plexmono",
  "caveat",
]);
const LAYOUTS = new Set([
  "plain",
  "overlay",
  "fullbleed",
  "quote",
  "stacked",
  "blur",
  "split",
  "masonry",
]);
const MAX_LIBRARY_CHARS = 30 * 1024 * 1024;
const MAX_IMAGE_CHARS = 12 * 1024 * 1024;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const string = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length <= max;
const identity = (value: unknown): value is string =>
  string(value, 120) && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value);
const format = (value: unknown): value is DesignFormat =>
  value === "portrait" || value === "square" || value === "story";
const color = (value: unknown): value is string =>
  typeof value === "string" &&
  /^(?:#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})|black|white|transparent)$/i.test(
    value,
  );

/** Retain only a small, balanced inline grammar. Unsafe HTML is discarded;
 * its existing plain-text mirror remains available to the renderer. This
 * works identically during server validation and in the browser. */
function safeRichHtml(value: unknown): string | undefined {
  if (!string(value, 20_000)) return undefined;
  const stack: string[] = [];
  const chunks = value.split(/(<[^>]*>)/g);
  const result: string[] = [];
  for (const chunk of chunks) {
    if (!chunk.startsWith("<")) {
      if (chunk.includes("<")) return undefined;
      result.push(chunk);
      continue;
    }
    if (/^<br\s*\/?\s*>$/i.test(chunk)) {
      result.push("<br>");
      continue;
    }
    const close = chunk.match(/^<\/(b|strong|i|em|u|s|strike|span)>$/i);
    if (close) {
      const tag = close[1].toLowerCase();
      if (stack.pop() !== tag) return undefined;
      result.push(`</${tag}>`);
      continue;
    }
    const basic = chunk.match(/^<(b|strong|i|em|u|s|strike)>$/i);
    if (basic) {
      const tag = basic[1].toLowerCase();
      stack.push(tag);
      result.push(`<${tag}>`);
      continue;
    }
    const span = chunk.match(
      /^<span((?:\s+(?:class|style)="[^"]*"){0,2})\s*>$/i,
    );
    if (!span) return undefined;
    const attrs: string[] = [];
    const seen = new Set<string>();
    for (const match of span[1].matchAll(/\s+(class|style)="([^"]*)"/gi)) {
      const key = match[1].toLowerCase();
      if (seen.has(key)) return undefined;
      seen.add(key);
      if (key === "class") {
        if (
          !match[2].startsWith("gf-font-") ||
          !FONT_IDS.has(match[2].slice(8))
        )
          return undefined;
        attrs.push(`class="${match[2]}"`);
      } else {
        const declarations = match[2]
          .split(";")
          .map((v) => v.trim())
          .filter(Boolean);
        if (
          !declarations.every((v) =>
            /^(?:font-weight\s*:\s*(?:[1-9]00|normal|bold)|font-style\s*:\s*(?:normal|italic)|text-decoration(?:-line)?\s*:\s*(?:none|underline|line-through|underline line-through|line-through underline))$/i.test(
              v,
            ),
          )
        )
          return undefined;
        attrs.push(`style="${declarations.join("; ")}"`);
      }
    }
    stack.push("span");
    result.push(`<span${attrs.length ? ` ${attrs.join(" ")}` : ""}>`);
  }
  return stack.length ? undefined : result.join("");
}

const NUMERIC_STYLE: Partial<Record<keyof SlideStyle, [number, number]>> = {
  textX: [-400, 400],
  textY: [-400, 400],
  textScale: [0.5, 2.5],
  textOpacity: [0, 1],
  lineHeight: [0.7, 2],
  letterSpacing: [-0.2, 1],
  fontWeight: [100, 900],
  mediaOpacity: [0, 1],
  mediaRadius: [0, 200],
  cardScale: [0.4, 1.6],
  cardW: [0.4, 1.6],
  cardH: [0.4, 1.6],
  mediaX: [-200, 200],
  mediaY: [-200, 200],
  mediaW: [20, 320],
  mediaH: [20, 320],
  mediaInX: [-50, 50],
  mediaInY: [-50, 50],
  mediaScale: [0.4, 4],
  mediaStart: [0, 86_400],
  mediaEnd: [0, 86_400],
};

function parseStyle(value: unknown): SlideStyle | null {
  if (
    !object(value) ||
    typeof value.template !== "string" ||
    !LAYOUTS.has(value.template)
  )
    return null;
  const style: SlideStyle = {
    template: value.template as SlideStyle["template"],
  };
  for (const key of [
    "heading",
    "body",
    "creditText",
    "creditSource",
  ] as const) {
    if (value[key] !== undefined) {
      if (!string(value[key], 10_000)) return null;
      style[key] = value[key];
    }
  }
  for (const key of ["headingHtml", "bodyHtml"] as const) {
    const html = safeRichHtml(value[key]);
    if (html !== undefined) style[key] = html;
  }
  if (typeof value.font === "string" && FONT_IDS.has(value.font))
    style.font = value.font;
  if (
    value.align === "top" ||
    value.align === "center" ||
    value.align === "bottom"
  )
    style.align = value.align;
  if (
    value.textAlign === "left" ||
    value.textAlign === "center" ||
    value.textAlign === "right"
  )
    style.textAlign = value.textAlign;
  if (value.bgMode === "color" || value.bgMode === "blur")
    style.bgMode = value.bgMode;
  if (color(value.bgColor)) style.bgColor = value.bgColor;
  if (color(value.textColor)) style.textColor = value.textColor;
  if (typeof value.credit === "boolean") style.credit = value.credit;
  for (const [key, bounds] of Object.entries(NUMERIC_STYLE)) {
    const n = value[key];
    if (typeof n === "number" && Number.isFinite(n))
      Object.assign(style, {
        [key]: Math.max(bounds[0], Math.min(bounds[1], n)),
      });
  }
  return style;
}

function safeImageUrl(value: unknown): value is string {
  if (!string(value, MAX_IMAGE_CHARS) || !value) return false;
  if (value.startsWith("data:")) {
    const match = value.match(
      /^data:image\/(png|jpeg|webp|gif|avif);base64,([A-Za-z0-9+/]+={0,2})$/,
    );
    if (!match || match[2].length % 4 !== 0) return false;
    try {
      const head = atob(match[2].slice(0, 64));
      if (match[1] === "png") return head.startsWith("\x89PNG\r\n\x1a\n");
      if (match[1] === "jpeg") return head.startsWith("\xff\xd8\xff");
      if (match[1] === "gif")
        return head.startsWith("GIF87a") || head.startsWith("GIF89a");
      if (match[1] === "webp")
        return head.startsWith("RIFF") && head.slice(8, 12) === "WEBP";
      return head.slice(4, 8) === "ftyp" && /avif|avis/.test(head.slice(8));
    } catch {
      return false;
    }
  }
  if (/^\/(?!\/)[a-zA-Z0-9_./%?=&-]+$/.test(value))
    return !/%(?:2f|5c)/i.test(value);
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function parsePages(value: unknown): DesignPage[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 20) return null;
  const pages: DesignPage[] = [];
  const pageIds = new Set<string>();
  const imageIds = new Set<string>();
  for (const p of value) {
    if (!object(p) || !identity(p.id) || pageIds.has(p.id) || !object(p.image))
      return null;
    const image = p.image;
    if (
      !identity(image.id) ||
      imageIds.has(image.id) ||
      !safeImageUrl(image.url)
    )
      return null;
    if (image.mediaType !== undefined && image.mediaType !== "image")
      return null;
    if (
      typeof image.width !== "number" ||
      !Number.isFinite(image.width) ||
      image.width <= 0 ||
      image.width > 30_000 ||
      typeof image.height !== "number" ||
      !Number.isFinite(image.height) ||
      image.height <= 0 ||
      image.height > 30_000
    )
      return null;
    const style = parseStyle(p.style);
    if (!style) return null;
    const source: StoryImage["source"] = [
      "google",
      "pinterest",
      "apify",
      "cosmos_manual",
      "web",
      "x",
      "upload",
    ].includes(String(image.source))
      ? (image.source as StoryImage["source"])
      : "upload";
    pages.push({
      id: p.id,
      style,
      image: {
        id: image.id,
        url: image.url,
        width: image.width,
        height: image.height,
        source,
        kind: image.kind === "real_subject" ? "real_subject" : "atmospheric",
        directive: string(image.directive, 2000) ? image.directive : "",
        rightsNote: string(image.rightsNote, 2000) ? image.rightsNote : "",
        cosmosManual: image.cosmosManual === true,
        ...(string(image.description, 5000)
          ? { description: image.description }
          : {}),
        ...(string(image.sourceUrl, 4000) &&
        /^https?:\/\//.test(image.sourceUrl)
          ? { sourceUrl: image.sourceUrl }
          : {}),
        mediaType: "image",
      },
    });
    pageIds.add(p.id);
    imageIds.add(image.id);
  }
  return pages;
}

/** Validate untrusted imports and browser storage before anything is rendered.
 * Limits are deliberately shared by both paths. The returned object contains
 * only known fields, fresh objects, safe image URLs, and normalized styles. */
export function parseLibrary(input: unknown): EditorLibrary | null {
  try {
    if (typeof input === "string") {
      if (input.length > MAX_LIBRARY_CHARS) return null;
      input = JSON.parse(input);
    } else if (JSON.stringify(input)?.length > MAX_LIBRARY_CHARS) return null;
    if (
      !object(input) ||
      input.version !== 1 ||
      !Array.isArray(input.designs) ||
      input.designs.length > 150 ||
      !Array.isArray(input.templates) ||
      input.templates.length > 80 ||
      !object(input.brand)
    )
      return null;
    const b = input.brand;
    if (
      !string(b.name, 200) ||
      typeof b.font !== "string" ||
      !FONT_IDS.has(b.font) ||
      !color(b.background) ||
      !color(b.text)
    )
      return null;
    const library: EditorLibrary = {
      version: 1,
      designs: [],
      templates: [],
      brand: {
        name: b.name,
        font: b.font,
        background: b.background,
        text: b.text,
      },
    };
    const designIds = new Set<string>();
    const templateIds = new Set<string>();
    for (const d of input.designs) {
      if (
        !object(d) ||
        !identity(d.id) ||
        designIds.has(d.id) ||
        !identity(d.templateId) ||
        !string(d.name, 200) ||
        !format(d.format) ||
        !string(d.caption, 20_000) ||
        !string(d.createdAt, 40) ||
        !Number.isFinite(Date.parse(d.createdAt)) ||
        !string(d.updatedAt, 40) ||
        !Number.isFinite(Date.parse(d.updatedAt))
      )
        return null;
      const pages = parsePages(d.pages);
      if (!pages) return null;
      library.designs.push({
        id: d.id,
        name: d.name,
        templateId: d.templateId,
        format: d.format,
        pages,
        caption: d.caption,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      });
      designIds.add(d.id);
    }
    for (const t of input.templates) {
      if (
        !object(t) ||
        !identity(t.id) ||
        templateIds.has(t.id) ||
        !string(t.name, 200) ||
        !string(t.description, 2000) ||
        !string(t.category, 100) ||
        !format(t.format)
      )
        return null;
      const pages = parsePages(t.pages);
      if (!pages) return null;
      library.templates.push({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        format: t.format,
        pages,
        custom: true,
      });
      templateIds.add(t.id);
    }
    return library;
  } catch {
    return null;
  }
}
