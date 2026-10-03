# Greatful Template Studio

A template-first editor for creating social posts and carousels. Start with a defined design, edit the content and imagery on canvas, and save your own reusable templates.

This repository is an independent copy with its own Git history. Configure service accounts and environment variables for this copy; do not reuse credentials, databases, or deployments from the source project.

Built with Next.js 16, React 19, and Tailwind v4. The editor reuses the established Grateful Future slide renderer, fonts, rich-text editing, and image handling.

## Create a post

1. Pick one of eight built-in templates, or start from **My templates**. The library includes editorial posts, quotes, announcements, stories, and four- and five-page carousels.
2. Edit the heading, body, and caption. Double-click canvas text for inline editing; drag text or images to reposition them. Adjust fonts, colors, spacing, image crop, opacity, and page layout.
3. Add, duplicate, reorder, or remove pages. Undo and redo changes while the design is open. Save a font and color palette in **Brand kit**, then apply it to every page.
4. Use **Save as template** to keep the complete design as a starting point for future posts. Copies receive independent page and image identities.
5. Export the current page as PNG, or all pages as a ZIP containing numbered PNGs and the post caption when present. Captions can also be downloaded separately as TXT.

| Format | Export size |
|---|---|
| Portrait post | 1080 × 1350 px |
| Square post | 1080 × 1080 px |
| Story | 1080 × 1920 px |

Upload JPG, PNG, or WebP images up to 15 MB. The editor resizes uploads to a maximum dimension of 1800 px, compresses them, and saves the resulting image with the design. The built-in template artwork lives in this repository and needs no external image service.

The current editor supports up to 20 pages per design, 150 designs, and 80 custom templates. The complete save request has a 12 MB limit; embedded images count toward it. This editor exports still images. The preserved research workspace retains its existing video tools.

## Run locally

Use Node 22 and npm. Template editing does not require an OpenAI key.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open [localhost:3000](http://localhost:3000), which redirects to `/admin/grateful-future`. With Supabase settings left empty, development opens without sign-in and saves the template library to `.gf-dev/template-editor/` on this computer. This directory is ignored by Git. Add `OPENAI_API_KEY` only if you also want to use research or its AI tools.

## Saving and backups

Changes autosave through `/api/template-editor`. With Supabase configured, the authenticated workspace is stored in `gf_client_state` under a separate `template-editor:` owner namespace. The template library does not replace the existing research workspace's saved data. In development without Supabase, writes use local files; production requires cloud storage and never reports a temporary filesystem write as a successful cloud save.

The browser keeps pending edits in IndexedDB for recovery. Save status shows whether changes reached cloud storage or the local development server. If another tab or device has saved a newer version, revision checks stop an overwrite and display a conflict. Download a backup before loading the saved version if you want to keep both sets of edits.

**Your designs → Backup** downloads a JSON workspace containing designs, custom templates, uploaded images, and the brand kit. **Import backup** adds copies of the imported designs and templates and applies the imported brand kit. Imports validate document structure, image URLs, rich text, and library limits before rendering.

## Research workspace

The original story research and curation experience remains at `/admin/grateful-future/research`, linked from the template studio sidebar. Its story feed, research engine, sources, image search, channels, scheduling integrations, and existing exports are preserved. The main entry point now opens the template editor.

Research uses `gpt-5.4` by default; chat and image review use `gpt-5.4-mini`. Override these through `OPENAI_RESEARCH_MODEL`, `OPENAI_CHAT_MODEL`, and `OPENAI_VISION_MODEL` when appropriate for your API project.

## Tests and validation

```sh
npm run test:template-editor
npm run lint
npm run build
```

The template-editor tests use Node's built-in test runner and the installed TypeScript compiler. They load the real model and persistence modules; authentication and database boundaries are replaced with controlled fixtures. No API keys, live database, or additional test dependencies are required. Coverage includes independent design copies, template round trips, import validation, unsafe rich text, owner isolation, concurrent saves, API access, and request limits.

For a browser check, create a carousel, edit text and imagery, reorder pages, reopen the design after a reload, save it as a template, and export each of the three formats. Check the exported dimensions and appearance as well as the save status.

## Architecture

| Responsibility | Location |
|---|---|
| Default studio route and shared fonts/styles | `app/admin/(tool)/grateful-future/` |
| Template library, designs, brand kit, canvas editor | `components/template-editor/` |
| Design model, built-in templates, import validation | `lib/template-editor/model.ts` |
| Browser autosave and recovery | `lib/template-editor/use-library.ts` |
| Cloud/local persistence and revision conflicts | `lib/template-editor/persistence.ts` |
| Authenticated template-library API | `app/api/template-editor/route.ts` |
| PNG and carousel ZIP export | `lib/template-editor/export.ts` |
| Original template artwork | `public/template-editor/` |
| Shared slide rendering and inline rich text | `components/grateful-future/slide-templates.tsx`, `rich-text.tsx` |
| Preserved research route | `app/admin/(tool)/grateful-future/research/` |
| Research UI, engine, prompts, and media tools | `components/grateful-future/`, `lib/grateful-future/` |
| Research API routes | `app/api/grateful-future/` |
| Instagram connection | `app/api/instagram/`, `app/admin/instagram-setup/` |
| Database migrations | `supabase/migrations/` |
| Template model and persistence test entry points | `tests/template-editor-*.test.mjs` |

## Deploy this independent copy on Render

Create a **new Supabase project** for this copy. Run `supabase/migrations/0014` through `0017` in order in its SQL editor. Migration `0017` supplies `gf_client_state` for both the preserved research state and the separately namespaced template library; no additional template-editor table is required. Configure the site URL and allowed redirect URL in Supabase Auth for its one-time sign-in links. Set allowed owner emails with `OWNER_EMAIL`.

Create a Render **Web Service** from `chatgptricks/greatful-independent`, branch `main`, using Node 22. Build with `npm ci && npm run build` and start with `npm run start`. Configure these environment variables before deployment:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL of the new Supabase project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key of the new project |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key of the new project; keep secret |
| `OWNER_EMAIL` | Allowed owner email, such as `esteban@sentientagency.io`; commas separate multiple addresses |
| `NEXT_PUBLIC_SITE_URL` | This service's public URL, such as `https://greatful-independent.onrender.com` |
| `OPENAI_API_KEY` | Separate secret API key for optional research, chat, and image review |

Production requires Supabase Auth and durable cloud storage. A missing configuration does not open the studio publicly or enable local-file saving. Owners share the owner workspace; optional members have separate workspace partitions. Render's service filesystem is temporary, so it is not the production design store. Subscription access remains disabled unless explicitly enabled.

`vercel.json` is only for Vercel; Render does not run its cron schedule. Configure a separate scheduler or Render cron job if scheduled research is needed.

## Optional integrations

See `.env.example` for configuration. These are not required for template editing:

- **Scheduled research:** Supabase, `CRON_SECRET`, and an external scheduler. On Vercel, `vercel.json` schedules the research cron hourly.
- **Image search:** `APIFY_TOKEN` enables “Find images on X”; Google Custom Search keys enable another image source in research.
- **Large research uploads:** `BLOB_READ_WRITE_TOKEN` enables Vercel Blob storage for uploads beyond the existing video limit.
- **Instagram channels:** configure a Meta app through `/admin/instagram-setup`.
- **Paid memberships:** disabled for this owner deployment. Enabling access later requires `GF_ENABLE_MEMBERS=true`, `STRIPE_SECRET_KEY`, `GF_STRIPE_PRICE_ID`, and `UNLOCK_SECRET`.

## Fonts

Four slide fonts—GT Walsheim, GT Walsheim Condensed, PP Kyoto, and Century Gothic—are commercial, so their files are not in this repository. Put your licensed copies in `public/fonts/licensed/`, using the filenames documented there. Without them, those options fall back to system fonts. The other fonts are open source and included locally.

## Working together

Use a branch for each change and open a pull request into `main`.

```sh
git checkout -b codex/your-change
git push -u origin codex/your-change
```
