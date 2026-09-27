# Grateful Future

This repository is an independent copy with its own Git history. Configure new service accounts and environment variables for this copy; do not reuse credentials, databases, or deployments from the source project.

A studio for finding stories worth telling and turning them into Instagram carousels.

- **Research:** pick a vein (Tradition, Mind, Object, Frontier, Culture, Tech, Pulse, Craft) and Claude browses the live web, filters hard, and returns a researched story with sources, a caption draft and an image pool.
- **Create:** edit the slides (templates, fonts, image layout), preview them exactly as Instagram will show them, and export images or video.
- **Schedule (optional):** let research run on its own every few hours and queue stories for review.

Built with Next.js 16, React 19, Tailwind v4 and the Claude API.

## Run it locally

You need Node 22 with npm and an Anthropic API key.

```sh
npm ci
cp .env.example .env.local   # then paste your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000. With no Supabase settings the studio opens with no sign-in, and your stories are saved in the browser.

## Where things live

| What | Where |
|---|---|
| The studio page and its styles | `app/admin/(tool)/grateful-future/` |
| Studio UI (grid, story detail, slide editor, Instagram preview, research menu) | `components/grateful-future/` |
| Research engine and prompts | `lib/grateful-future/research-engine.ts`, `profile.ts`, `post-types.ts` |
| Image sourcing | `lib/grateful-future/image-curator.ts`, `apify.ts` |
| Video export | `lib/grateful-future/export-video.ts` |
| API routes | `app/api/grateful-future/` |
| Instagram connection | `app/api/instagram/`, `app/admin/instagram-setup/` |
| Database tables | `supabase/migrations/` |

## Deploy this independent copy on Render

Create a **new Supabase project** for this copy. Run `supabase/migrations/0014` through `0017` in order in its SQL editor. In Supabase Auth, set the **Magic link or OTP** email template to contain `{{ .Token }}` (the six-digit code) instead of `{{ .ConfirmationURL }}`. The allowed owner is set with `OWNER_EMAIL`.

Create a Render **Web Service** from `chatgptricks/greatful-independent`, branch `main`, using Node 22. Build with `npm ci && npm run build` and start with `npm run start`. Set these environment variables in Render before deploying:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL of the new Supabase project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key of the new project |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key of the new project (secret) |
| `OWNER_EMAIL` | `esteban@sentientagency.io` |
| `NEXT_PUBLIC_SITE_URL` | The new Render URL, such as `https://greatful-independent.onrender.com` |
| `ANTHROPIC_API_KEY` | A separate key for research and chat (secret) |

The deployed studio requires Supabase Auth; it does not open publicly if these settings are missing. Subscription access is disabled unless explicitly enabled later. Render's Free web service sleeps when idle, and its local filesystem is temporary, so the new Supabase project stores stories and designs. `vercel.json` is only for Vercel; Render does not run its cron schedule. Set up a separate Render cron job later if scheduled research is needed.

## Optional features

Additional integrations switch on when their keys are configured (see `.env.example`).

- **Sign-in and a cloud story store (Supabase).** Sign-in uses a code emailed to the owner. The owner allowlist is set by `OWNER_EMAIL`.
- **Scheduled research.** Needs Supabase plus `CRON_SECRET` and an external scheduler. On Vercel, `vercel.json` runs the cron hourly; Render requires its own cron job.
- **More images.** `APIFY_TOKEN` adds "Find images on X". The Google Custom Search keys are a second source.
- **Big uploads.** `BLOB_READ_WRITE_TOKEN` (Vercel Blob) lifts the 8MB video limit.
- **Instagram channels.** Create a Meta app and follow the walkthrough at `/admin/instagram-setup`.
- **Paid memberships.** Disabled for this owner-only deployment. Enabling them later requires `GF_ENABLE_MEMBERS=true`, `STRIPE_SECRET_KEY`, `GF_STRIPE_PRICE_ID` and `UNLOCK_SECRET`.

## Fonts

Four of the slide fonts (GT Walsheim, GT Walsheim Condensed, PP Kyoto, Century Gothic) are commercial, so their files are not in this repo. Put your own licensed copies in `public/fonts/licensed/` (file names are listed in the README there). Without them those options fall back to system fonts. Every other font is open source and included.

## Working together

Make a branch for each change and open a pull request into `main`, so both of us can see and review what changed.

```sh
git checkout -b your-change
git push -u origin your-change
```
