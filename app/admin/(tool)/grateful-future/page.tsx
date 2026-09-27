import type { Metadata } from "next";
import GratefulFutureClient from "./client";

export const metadata: Metadata = {
  title: "Grateful Future",
  description:
    "Private curation tool — review surfaced stories, read the research, tune the caption, and build the Instagram carousel.",
  robots: { index: false, follow: false },
};

export default function GratefulFuturePage() {
  return <GratefulFutureClient />;
}
