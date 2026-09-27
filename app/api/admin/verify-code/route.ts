import { NextResponse } from "next/server";
import { getAuthServerClient } from "@/lib/supabase/auth-server";
import { isOwnerEmail } from "@/lib/owners";

export const runtime = "nodejs";

/** Exchange the emailed code for a server-side session cookie. */
export async function POST(request: Request) {
  const { email, code } = (await request.json().catch(() => ({}))) as {
    email?: string;
    code?: string;
  };
  const normalized = email?.trim().toLowerCase() ?? "";
  if (!isOwnerEmail(normalized) || !/^\d{6,8}$/.test(code ?? "")) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: "Sign-in is not configured" }, { status: 503 });
  }

  const supabase = await getAuthServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: normalized,
    token: code!,
    type: "email",
  });
  if (error || !data.session || !isOwnerEmail(data.user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
