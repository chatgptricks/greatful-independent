import { NextResponse } from "next/server";
import { getAuthServerClient } from "@/lib/supabase/auth-server";
import { isOwnerEmail } from "@/lib/owners";

/**
 * Implicit-flow companion to /admin/auth/callback.
 *
 * When Supabase's email link redirects to /admin/auth/callback with
 * tokens in the URL fragment (the legacy implicit / signup-confirmation
 * flow), a tiny inline script in the callback parses the fragment and
 * POSTs the tokens here. We call supabase.auth.setSession on the
 * @supabase/ssr server client, which validates the JWT and writes the
 * session cookies — same end state as the PKCE code-exchange path.
 *
 * Owner-email check runs here too, so an unauthorized session set in
 * the browser can't slip in via this endpoint.
 */
export async function POST(request: Request) {
  const { access_token, refresh_token } = (await request
    .json()
    .catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
  };

  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: "missing-tokens" }, { status: 400 });
  }

  const supabase = await getAuthServerClient();
  const { data, error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  if (error || !data.session) {
    return NextResponse.json({ error: "invalid-tokens" }, { status: 401 });
  }

  if (!isOwnerEmail(data.session.user.email)) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "not-authorized" }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
