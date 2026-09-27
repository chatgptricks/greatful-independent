import type { ReactNode } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveGFAccess } from "@/lib/grateful-future/member";
import "./grateful-future.css";
import "./licensed-fonts.css";

export const metadata: Metadata = {
  title: "Grateful Future",
  robots: { index: false, follow: false },
};

/**
 * Access gate + scoped stylesheet for the Grateful Future studio.
 *
 * Two ways in: the site owner (Supabase admin session) or a paying member
 * (valid gf_member cookie minted by the subscription flow). Anyone else is
 * sent to the public onboarding at /grateful-future/start. When Supabase
 * auth isn't configured (e.g. a git worktree with no .env.local) the gate
 * opens so the tool stays testable locally — production always has the env,
 * so it's always gated there. The .gf-* stylesheet is imported here so it
 * ships only in this route's bundle.
 */
export default async function GratefulFutureLayout({
  children,
}: {
  children: ReactNode;
}) {
  const access = await resolveGFAccess();
  if (!access) redirect("/admin/login");
  return <>{children}</>;
}
