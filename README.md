# Grateful Future

This repository is an independent copy with its own Git history. Configure new service accounts and environment variables for this copy; do not reuse credentials, databases, or deployments from the source project.

A studio for finding stories worth telling and turning them into Instagram carousels.

- **Research:** pick a vein (Tradition, Mind, Object, Frontier, Culture, Tech, Pulse, Craft) and Claude browses the live web, filters hard, and returns a researched story with sources, a caption draft and an image pool.
- **Create:** edit the slides (templates, fonts, image layout), preview them exactly as Instagram will show them, and export images or video.
- **Schedule (optional):** let research run on its own every few hours and queue stories for review.

Built with Next.js 16, React 19, Tailwind v4 and the Claude API.

## Run it locally

You need [Bun](https://bun.sh) (or Node 20+ with npm) and an Anthropic API key.

```sh
bun install
cp .env.example .env.local   # then paste your ANTHROPIC_API_KEY
bun dev
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

## Optional features

Everything below switches on when its keys are in `.env.local` (see `.env.example` for the full list). Nothing breaks when they're missing.

- **Sign-in and a cloud story store (Supabase).** Create a Supabase project, run the four SQL files in `supabase/migrations/` in order, and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. `OWNER_EMAIL` takes a comma-separated list, so more than one person can sign in to the same deployment. Sign-in is by email link at `/admin/login`; without `RESEND_API_KEY` the link prints in the terminal.
- **Scheduled research.** Needs Supabase plus `CRON_SECRET`. On Vercel, `vercel.json` runs the cron hourly; the interval and on/off switch are on the studio's System page.
- **More images.** `APIFY_TOKEN` adds "Find images on X". The Google Custom Search keys are a second source.
- **Big uploads.** `BLOB_READ_WRITE_TOKEN` (Vercel Blob) lifts the 8MB video limit.
- **Instagram channels.** Create a Meta app and follow the walkthrough at `/admin/instagram-setup`.
- **Paid memberships.** `STRIPE_SECRET_KEY`, `GF_STRIPE_PRICE_ID` and `UNLOCK_SECRET` turn on the public sign-up at `/grateful-future/start`. Skip these unless you sell access.

## Fonts

Four of the slide fonts (GT Walsheim, GT Walsheim Condensed, PP Kyoto, Century Gothic) are commercial, so their files are not in this repo. Put your own licensed copies in `public/fonts/licensed/` (file names are listed in the README there). Without them those options fall back to system fonts. Every other font is open source and included.

## Working together

Make a branch for each change and open a pull request into `main`, so both of us can see and review what changed.

```sh
git checkout -b your-change
git push -u origin your-change
```
