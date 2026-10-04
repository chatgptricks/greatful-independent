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

/** Scene coordinates and font sizes use a 360px-wide canvas at every format. */
export type CanvasElementBase = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
};
export type TextElement = CanvasElementBase & {
  type: "text";
  text: string;
  font: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  color: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing: number;
};
export type ImageElement = CanvasElementBase & {
  type: "image";
  src: string;
  fit: "cover" | "contain";
  /** Object-position percentages, from 0 through 100; 50 centers the image. */
  cropX: number;
  cropY: number;
  radius: number;
};
export type ShapeElement = CanvasElementBase & {
  type: "shape";
  shape: "rectangle" | "ellipse";
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
};
export type CanvasElement = TextElement | ImageElement | ShapeElement;
export type CanvasScene = { background: string; elements: CanvasElement[] };
export type DesignPage = {
  id: string;
  image: StoryImage;
  style: SlideStyle;
  /** Absent on legacy pages until the editor explicitly adopts a scene. */
  canvas?: CanvasScene;
};
export type DesignDocument = {
  id: string;
  name: string;
  templateId: string;
  format: DesignFormat;
  pages: DesignPage[];
  caption: string;
  createdAt: string;
  updatedAt: string;
  /** A saved editor draft for authoring a reusable template. */
  purpose?: "template";
  /** The reusable template this draft edits; ordinary designs never carry it. */
  editingTemplateId?: string;
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
export type BrandAsset = {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
  kind: "logo" | "image";
};
export type SavedBrandKit = BrandKit & {
  id: string;
  palette: string[];
  assets: BrandAsset[];
};
export const MAX_BRAND_KITS = 20;
export const MAX_BRAND_ASSETS = 40;
export const MAX_BRAND_COLORS = 20;
export const MAX_BRAND_ASSET_CHARS = 2_000_000;
export const DEFAULT_BRAND_KIT_ID = "brand-default";
export type EditorLibrary = {
  version: 1;
  designs: DesignDocument[];
  templates: DesignTemplate[];
  /** Compatibility projection of the active kit. Update kits via withBrandKits. */
  brand: BrandKit;
  brandKits: SavedBrandKit[];
  activeBrandKitId: string;
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
  brandKits: [{ ...DEFAULT_BRAND, id: DEFAULT_BRAND_KIT_ID, palette: [DEFAULT_BRAND.background, DEFAULT_BRAND.text], assets: [] }],
  activeBrandKitId: DEFAULT_BRAND_KIT_ID,
};

function brandProjection(kit: BrandKit): BrandKit {
  return { name: kit.name, font: kit.font, background: kit.background, text: kit.text };
}

/** Returns detached kit objects, including migration of a legacy in-memory library. */
export function libraryBrandKits(library: EditorLibrary): SavedBrandKit[] {
  if (library.brandKits?.length) return library.brandKits.map(kit => ({
    ...kit,
    palette: [...kit.palette],
    assets: kit.assets.map(asset => ({ ...asset })),
  }));
  return [{ ...brandProjection(library.brand), id: DEFAULT_BRAND_KIT_ID, palette: [library.brand.background, library.brand.text], assets: [] }];
}

export function activeBrandKit(library: EditorLibrary): SavedBrandKit {
  const kits = libraryBrandKits(library);
  return kits.find(kit => kit.id === library.activeBrandKitId) ?? kits[0];
}

export function createBrandKit(name = "My brand", base: BrandKit = DEFAULT_BRAND): SavedBrandKit {
  return {
    ...brandProjection(base),
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 200) || "Untitled brand",
    palette: Array.from(new Set([base.background, base.text])),
    assets: [],
  };
}

/** The single write path keeps the active-kit projection in sync with its source. */
export function withBrandKits(library: EditorLibrary, kits: SavedBrandKit[], activeId = library.activeBrandKitId): EditorLibrary {
  const parsed = parseBrandKits(kits);
  if (!parsed) throw new Error("Use 1–20 valid brand kits, with at most 20 colors and 40 images per kit.");
  const active = parsed.find(kit => kit.id === activeId) ?? parsed[0];
  return { ...library, brand: brandProjection(active), brandKits: parsed, activeBrandKitId: active.id };
}
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

export function createCanvasElement<T extends CanvasElement["type"]>(
  type: T,
  options?: Partial<Omit<Extract<CanvasElement, { type: T }>, "type" | "id">>,
): Extract<CanvasElement, { type: T }>;
export function createCanvasElement(
  type: CanvasElement["type"],
  options: Partial<CanvasElement> = {},
): CanvasElement {
  const base = {
    name: type === "text" ? "Text" : type === "image" ? "Image" : "Shape",
    x: 36,
    y: 60,
    width: 288,
    height: 90,
    rotation: 0,
    opacity: 1,
    locked: false,
  };
  const defaults = {
    text: {
      text: "Your text",
      font: "geist",
      fontSize: 32,
      fontWeight: 700,
      italic: false,
      underline: false,
      color: DEFAULT_BRAND.text,
      align: "left",
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    image: {
      height: 216,
      src: "/template-editor/folds.svg",
      fit: "cover",
      cropX: 50,
      cropY: 50,
      radius: 0,
    },
    shape: {
      width: 180,
      height: 120,
      shape: "rectangle",
      fill: "#dce5d8",
      stroke: DEFAULT_BRAND.text,
      strokeWidth: 0,
      radius: 0,
    },
  };
  return {
    ...base,
    ...defaults[type],
    ...options,
    type,
    id: crypto.randomUUID(),
  } as CanvasElement;
}

export function duplicatePage(source: DesignPage): DesignPage {
  return {
    id: crypto.randomUUID(),
    image: { ...source.image, id: crypto.randomUUID() },
    style: { ...source.style },
    ...(source.canvas
      ? {
          canvas: {
            background: source.canvas.background,
            elements: source.canvas.elements.map((element) => ({
              ...element,
              id: crypto.randomUUID(),
            })),
          },
        }
      : {}),
  };
}

/** Adapt scene coordinates between the three formats without stretching type. */
export function resizeCanvasScene(
  scene: CanvasScene,
  from: DesignFormat,
  to: DesignFormat,
): CanvasScene {
  const factor = FORMATS[to].height / FORMATS[from].height;
  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));
  return {
    ...scene,
    elements: scene.elements.map((element) => ({
      ...element,
      y: clamp(element.y * factor, -10_000, 10_000),
      ...(element.type !== "text"
        ? { height: clamp(element.height * factor, 1, 10_000) }
        : {}),
    })),
  };
}

/** Adapt a legacy composition only when requested. Existing documents remain
 * untouched until the editor writes the returned scene. Stable migration IDs
 * also make repeated previews deterministic before that first write. */
export function sceneForPage(
  page: DesignPage,
  format: DesignFormat,
): CanvasScene {
  if (page.canvas) return page.canvas;
  const style = page.style;
  const width = 360;
  const height = (width * FORMATS[format].height) / FORMATS[format].width;
  const layout = style.template;
  const scene: CanvasScene = {
    background:
      style.bgColor ??
      (layout === "masonry"
        ? "#f3eee3"
        : layout === "quote"
          ? "#0d0d0f"
          : "#141417"),
    elements: [],
  };
  const limit = (n: number, low: number, high: number) =>
    Math.max(low, Math.min(high, n));
  const id = (part: string) => `${page.id.slice(0, 80)}-canvas-${part}`;
  const image = (
    part: string,
    x: number,
    y: number,
    w: number,
    h: number,
    radius = 0,
    opacity = style.mediaOpacity ?? 1,
  ) => {
    const element = createCanvasElement("image", {
      name:
        part === "image"
          ? "Image"
          : part === "backdrop"
            ? "Backdrop"
            : "Image panel",
      x,
      y,
      width: w,
      height: h,
      src: page.image.url,
      radius,
      opacity,
      cropX: limit(50 - (style.mediaInX ?? 0), 0, 100),
      cropY: limit(50 - (style.mediaInY ?? 0), 0, 100),
    });
    element.id = id(part);
    scene.elements.push(element);
  };
  const shade = (opacity: number) => {
    const element = createCanvasElement("shape", {
      name: "Image shading",
      x: 0,
      y: 0,
      width,
      height,
      fill: "#000000",
      stroke: "transparent",
      opacity,
    });
    element.id = id("shade");
    scene.elements.push(element);
  };
  const scale = style.textScale ?? 1;
  const isCard = layout === "stacked" || layout === "blur";
  const isQuote = layout === "quote";
  const isCover = layout === "masonry";
  const font = style.font ?? "libre";
  const align =
    style.align ??
    (layout === "fullbleed" || layout === "split"
      ? "bottom"
      : isCover
        ? "top"
        : "center");
  const textAlign =
    style.textAlign ??
    (layout === "overlay" || layout === "blur" || isCover ? "center" : "left");
  const textColor = style.textColor ?? (isCover ? "#1c1a17" : "#ffffff");
  const heading = style.heading ?? "";
  const body = style.body ?? "";
  const padding = isCard
    ? layout === "blur"
      ? 26
      : 20
    : isQuote
      ? 24
      : isCover
        ? 26
        : 22;
  const textWidth = width - padding * 2;
  const headSize = isCard
    ? layout === "blur"
      ? 18
      : 20 * scale
    : (isQuote ? 21 : isCover ? 29 : 22) * scale;
  const bodySize = isCard
    ? layout === "blur"
      ? 12.5
      : 13
    : (isQuote ? 12 : isCover ? 13.5 : 13) * scale;
  const headLine = isCard
    ? layout === "blur"
      ? 1.25
      : 1.2
    : (isQuote ? 1.34 : isCover ? 1.1 : 1.18) * (style.lineHeight ?? 1);
  const bodyLine =
    (isCover ? 1.45 : 1.5) * (isCard ? 1 : (style.lineHeight ?? 1));
  const textHeight = (text: string, size: number, line: number) => {
    if (!text) return 0;
    const columns = Math.max(1, Math.floor(textWidth / (size * 0.52)));
    const lines = text
      .split("\n")
      .reduce(
        (count, paragraph) =>
          count + Math.max(1, Math.ceil(paragraph.length / columns)),
        0,
      );
    return Math.min(10_000, Math.ceil(lines * size * line + 2));
  };
  const headHeight = textHeight(heading, headSize, headLine);
  const bodyHeight = textHeight(body, bodySize, bodyLine);
  const gap = heading && body ? (isQuote ? 16 : isCard ? 8 : 10) : 0;
  const quoteHeight = isQuote ? 37 : 0;
  const blockHeight = headHeight + bodyHeight + gap + quoteHeight;
  let textY =
    align === "top"
      ? padding
      : align === "bottom"
        ? height - blockHeight - padding
        : (height - blockHeight) / 2;

  if (isCard) {
    const cardW = style.cardW ?? style.cardScale ?? 1;
    const cardH = style.cardH ?? style.cardScale ?? 1;
    const imageWidth = textWidth * (layout === "blur" ? 0.78 : 1) * cardW;
    const imageHeight = textWidth * (layout === "blur" ? 0.78 : 0.75) * cardH;
    const groupHeight = imageHeight + (blockHeight ? 14 + blockHeight : 0);
    const start =
      align === "top"
        ? padding
        : align === "bottom"
          ? height - groupHeight - padding
          : (height - groupHeight) / 2;
    if (style.bgMode !== "color") {
      image("backdrop", 0, 0, width, height, 0, 0.3);
      shade(0.3);
    }
    image(
      "image",
      (width - imageWidth) / 2 + ((style.mediaX ?? 0) / 100) * imageWidth,
      start + ((style.mediaY ?? 0) / 100) * imageHeight,
      imageWidth,
      imageHeight,
      style.mediaRadius ?? (layout === "blur" ? 18 : 12),
    );
    textY = start + imageHeight + 14;
  } else if (isCover) {
    image(
      "image",
      width * 0.19,
      height * 0.48,
      width * 0.62,
      width * 0.62 * 0.75,
      16,
    );
  } else if (layout === "split") {
    image("image", 0, 0, width / 2, height, style.mediaRadius ?? 0);
    image("image-right", width / 2, 0, width / 2, height);
    shade(0.32);
  } else if (layout !== "text" && !isQuote) {
    const imageWidth = (width * (style.mediaW ?? 100)) / 100;
    const imageHeight = (height * (style.mediaH ?? 100)) / 100;
    image(
      "image",
      (width - imageWidth) / 2 + (width * (style.mediaX ?? 0)) / 100,
      (height - imageHeight) / 2 + (height * (style.mediaY ?? 0)) / 100,
      imageWidth,
      imageHeight,
      style.mediaRadius ?? 0,
    );
    if (layout === "overlay") shade(0.42);
    if (layout === "fullbleed") shade(0.28);
  } else if (style.bgMode === "blur") {
    image("backdrop", 0, 0, width, height, 0, 0.3);
    shade(0.3);
  }

  const x = limit(
    padding + (width * (style.textX ?? 0)) / 100,
    -10_000,
    10_000,
  );
  textY = limit(
    textY + (blockHeight * (style.textY ?? 0)) / 100,
    -10_000,
    10_000,
  );
  const text = (
    part: string,
    content: string,
    y: number,
    h: number,
    fontSize: number,
    lineHeight: number,
    opacity = style.textOpacity ?? 1,
  ) => {
    if (!content) return;
    const element = createCanvasElement("text", {
      name:
        part === "heading"
          ? "Heading"
          : part === "body"
            ? "Body"
            : "Quote mark",
      text: content,
      x,
      y: limit(y, -10_000, 10_000),
      width: textWidth,
      height: Math.max(1, h),
      font,
      fontSize,
      fontWeight:
        part === "heading" && !isQuote ? (style.fontWeight ?? 600) : 400,
      color: textColor,
      align: textAlign,
      lineHeight,
      opacity,
      letterSpacing: (style.letterSpacing ?? 0) * fontSize,
    });
    element.id = id(part);
    scene.elements.push(element);
  };
  if (layout !== "plain") {
    if (isQuote)
      text("quote", "“", textY, 37, 54, 0.7, (style.textOpacity ?? 1) * 0.85);
    text(
      "heading",
      heading,
      textY + quoteHeight,
      headHeight,
      headSize,
      headLine,
    );
    text(
      "body",
      body,
      textY + quoteHeight + headHeight + gap,
      bodyHeight,
      bodySize,
      bodyLine,
      (style.textOpacity ?? 1) * (isQuote ? 0.68 : 0.92),
    );
  }
  return scene;
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

export function createBlankDesign(
  name: string,
  format: DesignFormat,
): DesignDocument {
  return createDesign({
    id: "blank-design",
    name: name.trim() || "Untitled design",
    description: "",
    category: "My templates",
    format,
    pages: [
      {
        ...page("blank-design", "folds", {
          template: "text",
          heading: "",
          body: "",
          bgMode: "color",
          bgColor: DEFAULT_BRAND.background,
          textColor: DEFAULT_BRAND.text,
          font: DEFAULT_BRAND.font,
          align: "center",
          textAlign: "left",
        }),
        canvas: { background: DEFAULT_BRAND.background, elements: [] },
      },
    ],
  });
}

export function createBlankTemplateDesign(
  name: string,
  format: DesignFormat,
): DesignDocument {
  return {
    ...createBlankDesign(name.trim() || "Untitled template", format),
    templateId: "blank-template",
    purpose: "template",
  };
}

export function editTemplateDesign(template: DesignTemplate): DesignDocument {
  return {
    ...createDesign(template),
    purpose: "template",
    editingTemplateId: template.id,
  };
}

export function cloneDesign(design: DesignDocument): DesignDocument {
  const now = new Date().toISOString();
  const copy: DesignDocument = {
    ...design,
    id: crypto.randomUUID(),
    name: `${design.name} copy`,
    pages: design.pages.map(duplicatePage),
    createdAt: now,
    updatedAt: now,
  };
  delete copy.purpose;
  delete copy.editingTemplateId;
  return copy;
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
  "text",
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

function parseBrand(value: unknown): BrandKit | null {
  if (!object(value) || !string(value.name, 200) || typeof value.font !== "string" || !FONT_IDS.has(value.font) || !color(value.background) || !color(value.text)) return null;
  return { name: value.name, font: value.font, background: value.background, text: value.text };
}

function parseBrandKits(value: unknown): SavedBrandKit[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_BRAND_KITS) return null;
  const kits: SavedBrandKit[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    const brand = parseBrand(candidate);
    if (!brand || !object(candidate) || !identity(candidate.id) || ids.has(candidate.id) ||
      !Array.isArray(candidate.palette) || candidate.palette.length > MAX_BRAND_COLORS || !candidate.palette.every(color) ||
      !Array.isArray(candidate.assets) || candidate.assets.length > MAX_BRAND_ASSETS) return null;
    const assets: BrandAsset[] = [];
    const assetIds = new Set<string>();
    for (const asset of candidate.assets) {
      if (!object(asset) || !identity(asset.id) || assetIds.has(asset.id) || !string(asset.name, 200) ||
        !string(asset.src, MAX_BRAND_ASSET_CHARS) || !safeImageUrl(asset.src) ||
        !numberIn(asset.width, 1, 100_000) || !numberIn(asset.height, 1, 100_000) ||
        (asset.kind !== "logo" && asset.kind !== "image")) return null;
      assets.push({ id: asset.id, name: asset.name, src: asset.src, width: asset.width, height: asset.height, kind: asset.kind });
      assetIds.add(asset.id);
    }
    kits.push({ ...brand, id: candidate.id, palette: [...candidate.palette], assets });
    ids.add(candidate.id);
  }
  return kits;
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

const numberIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;

function parseCanvas(value: unknown): CanvasScene | null {
  if (
    !object(value) ||
    !color(value.background) ||
    !Array.isArray(value.elements) ||
    value.elements.length > 100
  )
    return null;
  const scene: CanvasScene = { background: value.background, elements: [] };
  const ids = new Set<string>();
  for (const element of value.elements) {
    if (
      !object(element) ||
      !identity(element.id) ||
      ids.has(element.id) ||
      !string(element.name, 200) ||
      !numberIn(element.x, -10_000, 10_000) ||
      !numberIn(element.y, -10_000, 10_000) ||
      !numberIn(element.width, 1, 10_000) ||
      !numberIn(element.height, 1, 10_000) ||
      !numberIn(element.rotation, -3600, 3600) ||
      !numberIn(element.opacity, 0, 1) ||
      typeof element.locked !== "boolean"
    )
      return null;
    const base: CanvasElementBase = {
      id: element.id,
      name: element.name,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      rotation: element.rotation,
      opacity: element.opacity,
      locked: element.locked,
    };
    if (element.type === "text") {
      if (
        !string(element.text, 20_000) ||
        typeof element.font !== "string" ||
        !FONT_IDS.has(element.font) ||
        !numberIn(element.fontSize, 1, 500) ||
        !numberIn(element.fontWeight, 100, 900) ||
        typeof element.italic !== "boolean" ||
        typeof element.underline !== "boolean" ||
        !color(element.color) ||
        !numberIn(element.lineHeight, 0.5, 5) ||
        !numberIn(element.letterSpacing, -20, 100) ||
        (element.align !== "left" &&
          element.align !== "center" &&
          element.align !== "right")
      )
        return null;
      scene.elements.push({
        ...base,
        type: "text",
        text: element.text,
        font: element.font,
        fontSize: element.fontSize,
        fontWeight: element.fontWeight,
        italic: element.italic,
        underline: element.underline,
        color: element.color,
        align: element.align,
        lineHeight: element.lineHeight,
        letterSpacing: element.letterSpacing,
      });
    } else if (element.type === "image") {
      if (
        !safeImageUrl(element.src) ||
        (element.fit !== "cover" && element.fit !== "contain") ||
        !numberIn(element.cropX, 0, 100) ||
        !numberIn(element.cropY, 0, 100) ||
        !numberIn(element.radius, 0, 5000)
      )
        return null;
      scene.elements.push({
        ...base,
        type: "image",
        src: element.src,
        fit: element.fit,
        cropX: element.cropX,
        cropY: element.cropY,
        radius: element.radius,
      });
    } else if (element.type === "shape") {
      if (
        (element.shape !== "rectangle" && element.shape !== "ellipse") ||
        !color(element.fill) ||
        !color(element.stroke) ||
        !numberIn(element.strokeWidth, 0, 200) ||
        !numberIn(element.radius, 0, 5000)
      )
        return null;
      scene.elements.push({
        ...base,
        type: "shape",
        shape: element.shape,
        fill: element.fill,
        stroke: element.stroke,
        strokeWidth: element.strokeWidth,
        radius: element.radius,
      });
    } else return null;
    ids.add(element.id);
  }
  return scene;
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
    const canvas = p.canvas === undefined ? undefined : parseCanvas(p.canvas);
    if (canvas === null) return null;
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
      ...(canvas ? { canvas } : {}),
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
    const b = parseBrand(input.brand);
    if (!b) return null;
    const kits = input.brandKits === undefined
      ? [{ ...b, id: DEFAULT_BRAND_KIT_ID, palette: Array.from(new Set([b.background, b.text])), assets: [] }]
      : parseBrandKits(input.brandKits);
    const activeId = input.activeBrandKitId;
    if (!kits || (activeId !== undefined && (!identity(activeId) || !kits.some(kit => kit.id === activeId)))) return null;
    const active = kits.find(kit => kit.id === activeId) ?? kits[0];
    const library: EditorLibrary = {
      version: 1,
      designs: [],
      templates: [],
      brand: brandProjection(active),
      brandKits: kits,
      activeBrandKitId: active.id,
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
        !Number.isFinite(Date.parse(d.updatedAt)) ||
        (d.purpose !== undefined && d.purpose !== "template") ||
        (d.editingTemplateId !== undefined &&
          (d.purpose !== "template" || !identity(d.editingTemplateId)))
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
        ...(d.purpose === "template" ? { purpose: "template" as const } : {}),
        ...(typeof d.editingTemplateId === "string"
          ? { editingTemplateId: d.editingTemplateId }
          : {}),
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
