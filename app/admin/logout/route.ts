import { NextResponse } from "next/server";
import { getAuthServerClient } from "@/lib/supabase/auth-server";

/**
 * Signs the user out of the admin session and redirects to login.
 *
 * Sits outside the (authed) group so an expired-session POST doesn't
 * trigger the auth gate.
 */
export async function POST(request: Request) {
  const supabase = await getAuthServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/admin/login", request.url), {
    status: 303,
  });
}
