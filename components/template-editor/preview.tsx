"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  SlideFrame,
  type SlideElement,
} from "@/components/grateful-future/slide-templates";
import {
  FORMATS,
  storyForDesign,
  type DesignDocument,
  type DesignPage,
} from "@/lib/template-editor/model";
import type { SlideStyle } from "@/lib/grateful-future/types";

/** A single canonical layout size makes thumbnails, canvas and exports agree. */
export const FRAME_WIDTH = 360;

export function DesignFrame({
  design,
  page,
  onSet,
  selected,
  onSelect,
}: {
  design: DesignDocument;
  page: DesignPage;
  onSet?: (patch: Partial<SlideStyle>) => void;
  selected?: SlideElement | null;
  onSelect?: (element: SlideElement) => void;
}) {
  const format = FORMATS[design.format];
  return (
    <div
      className="te-frame"
      style={{
        width: FRAME_WIDTH,
        height: (FRAME_WIDTH * format.height) / format.width,
      }}
    >
      <SlideFrame
        img={page.image}
        style={page.style}
        story={storyForDesign(design)}
        gallery={design.pages.map((p) => p.image)}
        index={design.pages.findIndex((p) => p.id === page.id)}
        onSet={onSet}
        selected={selected}
        onSelect={onSelect}
      />
    </div>
  );
}

export function DesignPreview(props: Parameters<typeof DesignFrame>[0]) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FRAME_WIDTH);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const format = FORMATS[props.design.format];
  return (
    <div
      ref={ref}
      className="te-preview"
      data-format={props.design.format}
      style={
        {
          aspectRatio: `${format.width}/${format.height}`,
          "--te-preview-scale": width / FRAME_WIDTH,
        } as CSSProperties
      }
    >
      <div className="te-preview-inner">
        <DesignFrame {...props} />
      </div>
    </div>
  );
}
