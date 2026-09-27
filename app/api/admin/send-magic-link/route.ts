import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isOwnerEmail } from "@/lib/owners";

export const runtime = "nodejs";

/** Request a one-time sign-in link for an allowed owner. */
export async function POST(request: Request) {
  const { email } = (await request.json().catch(() => ({}))) as {
    email?: string;
  };
  const normalized = email?.trim().toLowerCase() ?? "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  if (!isOwnerEmail(normalized)) {
    return NextResponse.json({ ok: true });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Sign-in is not configured" }, { status: 503 });
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${siteUrl.replace(/\/$/, "")}/admin/auth/callback`,
    },
  });
  if (error) {
    console.error("[admin] send link failed", error);
    return NextResponse.json({ error: "Could not send link" }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
