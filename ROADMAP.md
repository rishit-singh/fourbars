# Roadmap

**Make tasty loops.** Keep fourbars a simple place to sketch, listen to, and share four bars. Improvements should make that short creative loop feel better while keeping the single-track editor approachable.

This is a direction of travel, not a release schedule. Planned work, deferred ideas, and experiments below have no committed dates. Setup and current behavior are documented in [README.md](README.md).

## Already available

The editor has piano, bass, and drums; draw/select modes; multi-note selection and group movement; note previews; and MIDI export. Playback includes pause/resume, seeking, and an editor loop toggle. Appearance themes, private drafts, explicit publish/republish, a community feed, likes, player dialogs, shareable melody pages, and a profile-editing modal are implemented.

These are the baseline for improvements, not future feature promises. Implementation and local tests do not replace verification against the deployed backend.

## Feature improvements

- **Mobile and keyboard polish — planned.** Exercise drawing, resizing, selecting, and moving notes on real touch devices. Improve keyboard-accessible group editing, focus handling, and small-screen controls. Respect reduced motion when refining transitions.
- **Continuous listening — planned.** Keep one playback session alive when moving between a feed overlay and its shareable melody page, and restore the feed's scroll position on return. The audio engine is already shared; player ownership and navigation cleanup still need to support this continuity.
- **Profile page — deferred.** The existing modal handles username and display-name editing. A dedicated profile page can be reconsidered when there is a clear need beyond those settings.
- **More musical starting points — exploratory.** Try additional presets and instrument choices that help people make a satisfying four-bar idea quickly. “Musical modes” and “playback modes” still need definition and small experiments; neither is a specified feature set. Existing pause, seek, and loop controls are already available.

## Scaling and reliability

- **Measure before caching.** Establish Supabase request counts, repeated navigation requests, feed latency, bundle/load costs, and playback responsiveness. Use those measurements to choose the smallest useful optimization.
- **Reuse client queries carefully.** Explore request deduplication and query reuse, with private and personalized entries keyed by user. Invalidate affected queries after saves, publishing, unpublishing, deletion, likes, and profile changes; clear user-scoped data on sign-out or account changes.
- **Separate personalized likes before public CDN caching.** Public publication data and aggregate counts must be separable from the current user's liked state. Define freshness and invalidation for republishing and unpublishing before introducing shared caching; private drafts remain owner-only.
- **Keep reviewing performance and access boundaries.** Revisit feed pagination and query plans as usage grows. Review RLS, ownership checks, publication snapshots, auth gates, playback cancellation, and editing bounds alongside changes. Exercise cross-account access against the live backend as well as the local database tests.
- **Maintain dependencies and deployment permissions.** Regularly review dependency advisories, supported upgrades, build tooling, and deployment-token scope. Keep changes small and verify the affected behavior.

## Operational follow-through

- **Automatic deployment exists; configuration is blocked.** The push-to-`main` workflow already runs checks and deploys through OpenNext. At the recorded setup check, the required GitHub Actions settings were missing: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Configure them and verify a successful run using [the CI setup guide](docs/deployment-ci.md).
- **Auth provider and email setup are external dependencies.** Google sign-in needs Supabase OAuth credentials/provider setup and the build-time enable flag. Production email delivery needs review of Supabase limits and custom SMTP configuration as needed.
- **Complete live release verification.** Check signup, login, session refresh, save/reopen, anonymous playback, cross-account permissions, and republishing against production Supabase. A passing build, mocked browser test, or deployment upload does not establish those outcomes.

## Experimental: AI co-creator

Explore an optional assistant that helps generate or refine a four-bar loop under the musician's control. Suggestions should fit the existing note, instrument, and timing constraints and be available to preview before changing the draft. Applying edits requires explicit acceptance; the user can reject a suggestion and continue editing manually. Saving and publishing remain deliberate user actions, with no automatic publishing.

This is an experiment to validate usefulness, not a committed integration or an expansion into a full production platform. Provider, interaction design, cost, and data handling still need evaluation.
