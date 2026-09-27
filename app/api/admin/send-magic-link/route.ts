import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendAdminMagicLink } from "@/lib/email";
import { isOwnerEmail } from "@/lib/owners";

/**
 * Dispatches a magic-link email for /admin access.
 *
 * Email pipeline: Supabase auth.admin.generateLink (service_role) →
 * Resend. We deliberately do NOT use Supabase's built-in email
 * sender for two reasons:
 *
 *   1. Free-tier rate limits — `over_email_send_rate_limit` (HTTP 429)
 *      kicks in after ~2 sends per hour to the same recipient, which
 *      we tripped during development.
 *   2. Branding — emails from our own domain via Resend look right;
 *      Supabase's default `noreply@mail.app.supabase.io` doesn't.
 *
 * generateLink with `type: 'magiclink'` returns a link that, when
 * clicked, redirects to our `/admin/auth/callback` with auth tokens
 * in the URL fragment (implicit flow). The callback's inline
 * hash-handler picks those up and posts them to
 * `/api/admin/exchange-tokens`, which validates and writes the
 * session cookies.
 *
 * Owner-email gating happens here (silent no-op for any non-owner
 * email) AND in the callback / exchange-tokens path (rejects sessions
 * for non-owner users), so a leaked link or replay can't grant
 * unauthorized access.
 */
export async function POST(request: Request) {
  const { email } = (await request.json().catch(() => ({}))) as {
    email?: string;
  };

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const ownerEmail = email.toLowerCase().trim();

  if (!isOwnerEmail(ownerEmail)) {
    // Don't reveal whether the email is on the allowlist — return
    // success regardless. The login page shows "check your inbox"
    // either way.
    return NextResponse.json({ ok: true });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error("[admin] SUPABASE_SERVICE_ROLE_KEY not set");
    return NextResponse.json({ error: "Admin not configured" }, { status: 503 });
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const redirectTo = `${siteUrl.replace(/\/$/, "")}/admin/auth/callback`;

  // Ensure the owner user exists in Supabase Auth. createUser is
  // idempotent-ish: if the user already exists it returns an error
  // we can safely ignore. email_confirm: true so we don't trigger
  // another confirmation email — we trust the owner email.
  await supabase.auth.admin.createUser({
    email: ownerEmail,
    email_confirm: true,
  });

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: ownerEmail,
    options: { redirectTo },
  });

  if (error || !data.properties?.action_link) {
    console.error("[admin] generateLink failed", error);
    return NextResponse.json({ error: "Could not send link" }, { status: 500 });
  }

  try {
    await sendAdminMagicLink({
      to: ownerEmail,
      link: data.properties.action_link,
    });
  } catch (err) {
    console.error("[admin] resend send failed", err);
    return NextResponse.json({ error: "Could not send link" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
