import { Resend } from "resend";

/**
 * Sends the sign-in link. With RESEND_API_KEY unset (local dev), the link
 * is printed to the server console instead, so you can click it from there.
 */
export async function sendAdminMagicLink({
  to,
  link,
}: {
  to: string;
  link: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log("[email:mocked] sign-in link", { to, link });
    return;
  }
  const from = process.env.EMAIL_FROM || "Grateful Future <onboarding@resend.dev>";
  await new Resend(key).emails.send({
    from,
    to,
    subject: "Your Grateful Future sign-in link",
    html: `<p>Click below to sign in to Grateful Future. The link is single-use and expires in an hour.</p>
<p><a href="${link}">Open Grateful Future</a></p>
<p style="color:#888">If you didn't request this, ignore it.</p>`,
  });
}
