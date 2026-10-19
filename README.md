# Fourbars — Make tasty loops.

Cook up a four-bar, single-track melody, listen in your browser, and share it when it's ready. Let other listeners decide what's tasty.

[**Open the live app**](https://fourbars.rsrishitsingh.workers.dev) · [**GitHub repository**](https://github.com/rishit-singh/fourbars) · [Roadmap](ROADMAP.md) · [Deployment CI](docs/deployment-ci.md)

## Make a loop

1. **Create:** sign in and start a private project. Each loop is four bars of 4/4: 16 beats, one Piano, Bass, or Drums track.
2. **Shape:** draw notes, drag to move, or resize their right edges. Select mode lets you box-select and move groups; Shift-click toggles individual notes, Delete/Backspace removes the selection, and Escape clears it. Choose your tempo and 1/4, 1/8, or 1/16-note snap.
3. **Listen:** play, pause, resume, and seek in the browser. Turn on Loop in the editor to repeat your four bars.
4. **Save privately, publish explicitly:** Save updates your draft. Publish shares a snapshot in the community feed and at a public link. Later edits—including the title—stay private until you Republish. Unpublish removes the public version and its likes while keeping your draft.
5. **Take it with you:** download your melody as a MIDI file from the editor or your published page, ready to open in a music app.

Anyone can browse and listen to published loops. Sign in to like favorites and set your profile's username and display name. Choose **Studio · Amber**, **Midnight · Blue**, or **Graphite · Violet** from Appearance.

Pitched notes span C3–B4; drums use MIDI 36/38/42. Piano ↔ Bass preserves notes; switching between pitched and drum rows clears them after confirmation. Key is a label, not transposition. MIDI contains note data, not recorded audio.

## Run locally

Use Node 22.12+ (development here used Node 26) and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Before using auth/data:

1. Create a Supabase project and enable Email authentication.
2. Run **`supabase/schema.sql`** in the Supabase SQL Editor. It creates the private/public tables, validation trigger, RLS policies, and publish/unpublish RPC functions. It can be reapplied and upgrades the original starter's `projects` table without deleting its drafts. Existing published starter rows are copied into snapshots once.
3. Set these in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL` — project API URL.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — publishable key, **never** a service-role key.
4. Set Supabase Auth's Site URL to your production origin and allow `/login` redirects on production and `http://localhost:3000/login`. With email confirmation enabled, confirm the email before signing in.
5. Restart the dev server after environment changes. Visit `http://localhost:3000`.

Production auth URLs are declared in `supabase/config.toml` and have been pushed to the hosted project. The Site URL is `https://fourbars.rsrishitsingh.workers.dev`; production and localhost `/login` redirects are allowed. To update these with CLI v2.121.0, run `npx supabase config diff`, then `npx supabase config push`. Undeclared settings are preserved. Request a new confirmation email after changing redirect settings; previously issued emails keep their original links.

Alternatively, apply the schema through the authenticated Supabase CLI (verified with v2.121.0):

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db query --linked --file supabase/schema.sql
```

The project ref is the first part of your Supabase URL's hostname. CLI account authentication authorizes schema changes; the publishable key in `.env.local` does not. This applies the reapplicable bootstrap directly, not through migration history. Local CLI linkage under `supabase/.temp/` is ignored by Git.

## Routes

- `/`: Community / My Projects, 12-item cursor pagination, player dialogs, likes, and All / Drafts / Published filters. Create opens a confirmation dialog before making a private project.
- `/editor/new`: authenticated creation of a blank private project.
- `/editor/[id]`: private piano-roll editor, playback, save, publish, and MIDI export.
- `/m/[id]`: published snapshot, playback, copy link; owner edit/MIDI/unpublish actions. Old `/melody/[id]` links redirect here.
- `/login`: email/password signup and sign-in, confirmation resend cooldowns, and validated return destinations. Piano-roll help lives in the editor and supports Escape and focus trapping.

Google sign-in requires enabling the provider with OAuth credentials in Supabase and setting `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` at build time; it is currently disabled. Email rate limits are enforced by Supabase; production delivery may require custom SMTP.

## Architecture and authorization

Next.js App Router and React provide the UI, with Zustand for editor state, Tone.js for browser audio, Supabase for auth and PostgreSQL, and OpenNext for Cloudflare Workers deployment.

**Supabase client + RLS is the API boundary; no tRPC or duplicate API server.** `lib/projects.ts` validates inputs with Zod and uses authenticated owner predicates. PostgreSQL also validates notes and titles so bypassing the browser does not bypass validation.

- `projects`: owner-only drafts, flat composition columns retained from the starter. Writes cannot set ownership, timestamps, or publication flags through update grants. `updated_at` is managed by a trigger.
- `publications`: public safe metadata and composition snapshot only. Clients have SELECT privilege, no direct writes.
- `publish_project`: authenticated, ownership-checked, row-locked atomic copy of the saved draft, including title; increments publication version. `unpublish_project` removes the public snapshot without deleting the draft. Deleting a project cascades to its publication.
- Zustand owns editor state only. Remote hydration resets it per project; signing out clears it. No local draft persistence or cross-user draft cache.
- `profiles`: public username/display name, owner-only writes; email is never exposed. `publication_likes`: one like per user/publication, owner-only writes and raw reads, public aggregate counts. Unpublishing removes associated likes.
- `project_details` and `publication_details`: security-invoker read models add creator names, like counts, and publication status. Saved drafts are compared with snapshots to distinguish Published from Unpublished changes.
- Public reads are client-side and refetched on navigation. Feed lists stay in component state; no authenticated Next.js data cache or N+1 user queries. Creator labels use profile display names or Anonymous.

Audio uses lazily loaded Tone.js synths: polyphonic triangle piano, sine bass, and separate membrane/noise/metal drum voices. One shared player owns playback; owner-scoped cleanup and cancellation tokens prevent stale initialization from restarting it. Editor Loop uses bounded audio-clock scheduling; turning it off finishes the queued pass. There are no samples or audio uploads.

## Checks

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm test -- lib/music.test.ts
npm test -- supabase/schema.test.ts
npm run test:browser
npm run build
```

`npm run format` formats source. Vitest covers quantization/bounds, runtime validation, MIDI timing and percussion channel, and real Postgres RLS/snapshot behavior through **PGlite** (Supabase's auth schema is shimmed). These tests need no cloud credentials.

The Playwright browser tests use installed **Google Chrome**, start their own Next dev server on port **3001**, and **mock Supabase HTTP**. They exercise pointer editing, audio initialization/stop, failed saves, publication states, help, auth redirects/resend cooldowns, single-project creation, like rollback, profile refresh, and server-side filters. They do not verify a live Supabase project. Avoid another Next process in this directory during builds/browser tests because they share `.next`.

## Deploy to Cloudflare Workers

Production runs at **https://fourbars.rsrishitsingh.workers.dev**. A GitHub Actions workflow is configured for pushes to `main`, but automatic deployment is blocked until the required repository secrets and variables are added. Current releases were deployed locally. See [Deployment CI](docs/deployment-ci.md) for setup instructions. Exact dependencies are locked in `package-lock.json`.

For a local deployment, follow the installed adapter's README and [Cloudflare's OpenNext guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/):

```sh
npx wrangler login
npx wrangler whoami
npm run deploy
```

`deploy` runs `opennextjs-cloudflare build && opennextjs-cloudflare deploy`. `preview` builds then runs the adapter's local Workers preview. `npm run build` alone only builds Next.js. Wrangler loads `.open-next/worker.js` and `.open-next/assets` with `nodejs_compat`.

Set both Supabase `NEXT_PUBLIC_` values **at build time** (local `.env.local`, or the GitHub Actions variables documented above). Changing runtime secrets cannot fix values already bundled into client JavaScript. Credentials and `.env.local` are not committed.

### Verification boundaries

The existing deployment record confirms configured Supabase URL/key, applied database schema, and production auth redirects. Anonymous feed access and public snapshot reads were verified, and anonymous draft reads were denied. Email auth requires confirmation.

Live signup/login/refresh, save/reopen, playback of a published loop, cross-account permissions, and republishing still need an end-to-end check against production. Local or mocked tests and a successful deployment do not establish that those live flows work.

## Limits and next steps

See [ROADMAP.md](ROADMAP.md) for follow-up work.

- No WAV/MP3/Storage integration, local recovery, undo/redo, optimistic concurrency, multitrack, samples, comments, or following.
- Explicit save only. Link navigation and page unload warn about dirty state. Same-document Back/Forward cancellation uses the Navigation API; browsers without it may not warn on SPA history navigation.
- Public melody metadata loads client-side; missing/private publications display the same unavailable state rather than a server-rendered HTTP 404. No SEO/share-card rendering yet.
- Edits from multiple tabs are last-write-wins. Mutable feed ordering can move a republished item between cursor pages; loaded IDs are deduplicated.
- Large polyphonic passages can clip or exceed the synth's 64-voice limit. Drum hits at the same pitch/onset are coalesced for playback.
