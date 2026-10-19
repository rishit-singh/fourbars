# fourbars

**Make four bars. Share an idea.** A single-track music sketchpad and community feed.

## Deployment status

Public shell: **https://fourbars.rsrishitsingh.workers.dev**

The OpenNext/Workers build is deployed with Supabase URL/key configured, and the database schema has been applied using the Supabase CLI. The live anonymous feed was verified in an isolated browser and correctly shows an empty community. Anonymous API reads of `publications` succeed; reads of private `projects` are denied. Email auth is enabled with email confirmation required. Live signup, saving, and public playback still need an authenticated end-to-end check.

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

## Product flow

- `/`: Community / My Projects, 12-item cursor pagination, player dialogs, likes, and All / Drafts / Published filters. Create opens a confirmation dialog before making a private project.
- `/editor/new`: authenticated creation of a blank private project.
- `/editor/[id]`: title, tempo, key metadata, Piano/Bass/Drums, snap 1/4–1/16; click to add, drag to move, right-edge resize, select + Delete/Backspace to remove. Default pitched range C3–B4; drums use MIDI 36/38/42.
- `/m/[id]`: published snapshot, playback, copy link; owner edit/MIDI/unpublish actions. Old `/melody/[id]` links redirect here.
- `/login`: email/password signup and sign-in, confirmation resend cooldowns, and validated return destinations. Piano-roll help lives in the editor and supports Escape and focus trapping.

Signed-in users can set a username and display name from Profile. Google sign-in requires enabling the provider with OAuth credentials in Supabase and setting `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` at build time; it is currently disabled. Email rate limits are enforced by Supabase; production delivery may require custom SMTP.

**Save is private. Publish/Republish is explicit.** Even title changes stay private until republished. Public readers never read the draft table. Switching between pitched and drum rows clears notes after confirmation; piano ↔ bass preserves notes. Key is metadata, not transposition.

Audio uses browser-only Tone.js synths: polyphonic triangle piano, sine bass, and separate membrane/noise/metal drum voices. There are no samples or audio uploads. One shared player owns playback; Stop and navigation dispose it and invalidate pending initialization. Editor Loop repeats four bars using bounded audio-clock scheduling; turning it off finishes the queued pass. MIDI is note data, not playable audio.

## Architecture and authorization

**Supabase client + RLS is the API boundary; no tRPC or duplicate API server.** `lib/projects.ts` validates inputs with Zod and uses authenticated owner predicates. PostgreSQL also validates notes and titles so bypassing the browser does not bypass validation.

- `projects`: owner-only drafts, flat composition columns retained from the starter. Writes cannot set ownership, timestamps, or publication flags through update grants. `updated_at` is managed by a trigger.
- `publications`: public safe metadata and composition snapshot only. Clients have SELECT privilege, no direct writes.
- `publish_project`: authenticated, ownership-checked, row-locked atomic copy of the saved draft, including title; increments publication version. `unpublish_project` removes the public snapshot without deleting the draft. Deleting a project cascades to its publication.
- Zustand owns editor state only. Remote hydration resets it per project; signing out clears it. No local draft persistence or cross-user draft cache.
- `profiles`: public username/display name, owner-only writes; email is never exposed. `publication_likes`: one like per user/publication, owner-only writes and raw reads, public aggregate counts. Unpublishing removes associated likes.
- `project_details` and `publication_details`: security-invoker read models add creator names, like counts, and publication status. Saved drafts are compared with snapshots to distinguish Published from Unpublished changes.
- Public reads are client-side and refetched on navigation. Feed lists stay in component state; no authenticated Next.js data cache or N+1 user queries. Creator labels use profile display names or Anonymous.

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

The verified initial deployment used **Next.js 15.5.28**, **`@opennextjs/cloudflare` 1.20.12**, and **Wrangler 4.151.1**. Exact dependencies are locked in `package-lock.json`.

The adapter's installed README and [Cloudflare's OpenNext guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/) document this build/deploy path. Cloudflare now recommends vinext for new projects; this existing Next 15/OpenNext starter uses its supported adapter rather than adding a migration to the timebox.

```sh
npx wrangler login
npx wrangler whoami
npm run deploy
```

`deploy` runs `opennextjs-cloudflare build && opennextjs-cloudflare deploy`. `preview` builds then runs the adapter's local Workers preview. `npm run build` alone only builds Next.js. Wrangler loads `.open-next/worker.js` and `.open-next/assets` with `nodejs_compat`.

Set both `NEXT_PUBLIC_` values **at build time** (local `.env.local`, or Cloudflare Workers Builds variables). Changing runtime secrets cannot fix values already bundled into client JavaScript. No Vercel fallback was needed. Credentials and `.env.local` are not committed.

## Remaining work / tradeoffs

- **Release verification remaining:** verify signup/login/refresh, save/reopen, anonymous playback, A-vs-B permissions, and republishing against the deployed backend. Supabase URL/key, database schema, and production auth redirects are configured; the live anonymous feed and draft-read denial have been verified.
- No WAV/MP3/Storage integration, local recovery, undo/redo, optimistic concurrency, multitrack, samples, comments, or following.
- Explicit save only. Link navigation and page unload warn about dirty state. Same-document Back/Forward cancellation uses the Navigation API; browsers without it may not warn on SPA history navigation.
- Public melody metadata loads client-side; missing/private publications display the same unavailable state rather than a server-rendered HTTP 404. No SEO/share-card rendering yet.
- Edits from multiple tabs are last-write-wins. Mutable feed ordering can move a republished item between cursor pages; loaded IDs are deduplicated.
- Large polyphonic passages can clip or exceed the synth's 64-voice limit. Drum hits at the same pitch/onset are coalesced for playback.
- Dependency audit still reports upstream development/build-tool advisories. The initial Vitest critical advisory was removed by upgrading; no forced framework downgrade was applied.

Do not treat local/mocked tests as proof of a configured live product.
