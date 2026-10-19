# Repository guidance

## Setup and verification

- Use `npm ci` with the committed lockfile. Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`; formatting: `npm run format:check` / `npm run format`.
- Focused Vitest: `npm test -- lib/music.test.ts` or `npm test -- supabase/schema.test.ts`. SQL tests run real Postgres/RLS in PGlite with only Supabase auth shimmed; no cloud service required.
- `npm run test:browser` needs installed Google Chrome and port 3001. It starts Next with fixture env values and mocks Supabase HTTP, so passing it does not verify cloud auth/persistence. Avoid concurrent Next dev/build processes in this repo: they share `.next`.
- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` and at deployment build time. Never use a service-role key. Supabase setup and actual deployment verification limits are in README.
- `npm run build` is Next-only. `npm run preview` and `npm run deploy` build with OpenNext first; Wrangler consumes generated `.open-next/worker.js` and `.open-next/assets`. Keep OpenNext APIs aligned with the installed adapter README.

## Boundaries and gotchas

- `lib/projects.ts` is the typed browser repository; Supabase + RLS is the only API boundary. `projects` is owner-only; public reads must use `publications`, never add public SELECT to drafts. Publish/unpublish use ownership-checked SQL RPCs; saving must not alter the snapshot or public title.
- `supabase/schema.sql` is reapplicable bootstrap/upgrade SQL, not an automatic migration runner. It upgrades the flat-column starter and validates writes in PostgreSQL as well as Zod. Keep SQL checks, column grants, `lib/types.ts`, and `lib/validation.ts` aligned.
- Zustand holds unsaved editor state only; hydrate/reset per project and clear on sign-out. Save completion checks the captured revision so newer edits cannot be marked saved accidentally. Lists stay in component state.
- Notes use musical beats, MIDI pitch and velocity 1–127, never pixels/seconds. Snap is 1/.5/.25 beats; ends cannot exceed 16. Pitched UI is 48–71; drums are 36/38/42. Switching pitched ↔ drums clears notes with confirmation.
- `lib/audio.ts` is browser-only and owns the single global player. Preserve lazy Tone loading, gesture initialization, generation-token cancellation and owner-scoped cleanup; unmounting an inactive card must not stop another card.
- `lib/midi.ts` is independently testable; MIDI timing converts beats to seconds, percussion uses zero-based channel 9.
- Dynamic App Router `params` must be awaited. `@/*` resolves from the repository root. Canonical public route is `/m/[id]`; `/melody/[id]` only redirects.
