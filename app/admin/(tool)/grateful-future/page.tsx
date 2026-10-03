import type { Metadata } from "next";
import GratefulFutureClient from "./client";

export const metadata: Metadata = {
  title: "Greatful · Template Studio",
  description:
    "Create posts and carousels with defined templates, editable designs, and a reusable brand kit.",
  robots: { index: false, follow: false },
};

export default function GratefulFuturePage() {
  return <GratefulFutureClient />;
}
