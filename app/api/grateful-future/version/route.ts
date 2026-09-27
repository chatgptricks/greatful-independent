/**
 * Deploy marker. The constant is baked into each deployment, so probing this
 * endpoint tells you which build the live site is actually serving — useful
 * for verifying that a push landed (a failed Vercel build keeps serving the
 * previous deployment, silently).
 */
export const GF_BUILD = "2026-06-12-blob-token";

export function GET() {
  return Response.json({ build: GF_BUILD });
}
