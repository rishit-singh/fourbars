# Production deployment CI

Every push to `main` runs `.github/workflows/deploy.yml`: `npm ci`, lint,
typecheck, tests, then `npm run deploy`. Deployment runs only after the checks
pass. Node.js 22 and the committed npm lockfile are used. Production runs are
serialized; an active deployment is not cancelled by a newer push.

`npm run deploy` builds Next.js through the installed OpenNext Cloudflare adapter
and deploys the generated `.open-next/worker.js` and `.open-next/assets` using
`wrangler.jsonc`. The target Worker is `fourbars` in the configured Cloudflare
account.

## Required GitHub settings

In `rishit-singh/fourbars`, open **Settings → Secrets and variables → Actions**.
Configure these repository-level settings before pushing to `main`:

| Kind     | Name                                   | Value                                                             |
| -------- | -------------------------------------- | ----------------------------------------------------------------- |
| Secret   | `CLOUDFLARE_API_TOKEN`                 | Cloudflare deployment API token scoped to the production account. |
| Secret   | `CLOUDFLARE_ACCOUNT_ID`                | Account ID containing the production Worker.                      |
| Variable | `NEXT_PUBLIC_SUPABASE_URL`             | Production Supabase project URL.                                  |
| Variable | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production Supabase publishable key.                              |

Create the token using Cloudflare's **Edit Cloudflare Workers** template, scoped
to the production account and any zone resources actually required. See
[Cloudflare's GitHub Actions authentication guide](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).
Local Wrangler login credentials are not available to GitHub Actions.

The Supabase settings are public browser configuration and are supplied at build
time. Next.js embeds them in the browser bundle; changing them requires a new
deployment. Never use a Supabase service-role key. Cloudflare credentials are
passed only to the settings check and deployment step, and the check reports
missing names without printing values.

## Setup status and verification

During setup on 2026-10-18, name-only `gh secret list` and `gh variable list`
queries returned no repository settings. The four settings above therefore
remain external setup requirements; no account settings or credentials were
created or changed. Ensure GitHub Actions is enabled for this repository.

After configuring the settings, push to `main` and inspect **Actions → Deploy
production**. Missing settings stop the job with their names. A successful job
confirms the checks, build and upload; verify the deployed app's authentication,
save/load and publishing separately against production Supabase. The tests use
local database fixtures and do not validate live cloud credentials or RLS setup.
See [the README](../README.md) for Supabase setup and deployment verification.

For a local packaging-only check, if `.open-next/worker.js` and
`.open-next/assets` already exist, run `npx --no-install wrangler deploy --dry-run`.
This does not deploy or verify the CI token. Avoid concurrent Next.js builds or
development processes because they share `.next`.
