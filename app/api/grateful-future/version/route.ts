/**
 * Deploy marker. The constant is baked into each deployment, so probing this
 * endpoint tells you which build the live site is actually serving — useful
 * for verifying that a push landed (a failed Vercel build keeps serving the
 * previous deployment, silently).
 */
export const GF_BUILD = "2026-10-03-wysiwyg-canvas-editor";

export function GET() {
  return Response.json({ build: GF_BUILD, commit: process.env.RENDER_GIT_COMMIT ?? null }, { headers: { "Cache-Control": "no-store" } });
}
