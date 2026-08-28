# Deployment: environments, D1, and migrations

This is the resource skeleton for Dreamport's three-environment deployment. It
exists so that every later auth binding and migration (issues #20 onward) lands
in a known shape. There is no Worker code yet — today the project deploys only
the static SPA assets.

## Environments

| Environment | Wrangler `env` | Worker name       | D1 database       | Domain                                | `EMAIL_MODE` |
| ----------- | -------------- | ----------------- | ----------------- | ------------------------------------- | ------------ |
| Production  | `prod`         | `dreamport-prod`  | `dreamport-prod`  | `dreamport.ianjmacintosh.com`         | `mock`       |
| Staging     | `stage`        | `dreamport-stage` | `dreamport-stage` | `staging.dreamport.ianjmacintosh.com` | `mock`       |
| Remote dev  | `dev`          | `dreamport-dev`   | `dreamport-dev`   | _(none — `workers.dev` only)_         | `mock`       |
| Local dev   | _(top level)_  | `dreamport`       | Miniflare SQLite  | `localhost`                           | `mock`       |

Each `env` block in [`wrangler.jsonc`](../wrangler.jsonc) binds its own D1
database as `DB`. Wrangler does **not** inherit `vars` or bindings into
environments, so every block repeats `EMAIL_MODE` and its `d1_databases` entry.

`EMAIL_MODE` is `mock` everywhere for now: sign-in codes are written to the
console, nothing is sent. Real sending (Resend) is switched on per environment
in a later issue, and only once sender-domain DNS exists.

### Local dev — `npm run dev`

`npm run dev` runs the Vite + `@cloudflare/vite-plugin` dev server against the
**top-level** config. It does not touch any remote D1; when a `DB` binding is
added for local use it will resolve to Miniflare's local SQLite under
`.wrangler/`. Develop offline, against throwaway local data, by default.

### `dreamport-dev` — opt-in remote D1

`dreamport-dev` is a real remote D1 database for the occasional
database-heavy change you want to exercise against real D1 behaviour
(no transactions, real error semantics) **before** opening a PR. It is opt-in:
nothing points at it unless you pass `--env dev` yourself.

### Preview deployments → `dreamport-stage`

Per-PR previews come from Cloudflare's GitHub integration building every
non-production branch. They must never read or write production data, so the
build commands — set once in the Worker's build configuration in the
Cloudflare dashboard, not in this repo — pass `--env` explicitly:

- **Production branch (`main`):** `npx wrangler deploy --env prod`
- **Non-production branch (preview):** `npx wrangler versions upload --env stage`
  (a preview version with its own URL; it does not take production traffic)

`scripts/setup-d1.sh` includes a stage that walks through applying these in
the dashboard. Previews are served on `*.workers.dev` — Cloudflare's Git
integration does not mint per-PR custom subdomains.

## First-time setup (human-in-the-loop)

Creating the D1 databases needs `wrangler login` and Cloudflare account
access, so it is not something CI or an agent can do. Run the wizard:

```bash
./scripts/setup-d1.sh
```

It walks through `wrangler login`, `wrangler d1 create
dreamport-{prod,stage,dev}`, pasting each returned `database_id` into the
matching block in `wrangler.jsonc`, and the one dashboard setting that points
preview builds at `--env stage`. Database IDs are **not secrets** — commit
them.

Until the wizard has run, the `database_id` values in `wrangler.jsonc` are
`PLACEHOLDER-run-scripts/setup-d1.sh` and any real deploy or remote migration
will fail fast.

## Migrations

Migration files live in [`migrations/`](../migrations/) as numbered
`NNNN_description.sql`, committed and reviewed like any other schema change.
Better Auth's generated schema is added as the first migration in issue #20.

Apply them per environment with the npm scripts:

```bash
npm run migrate:dev
npm run migrate:stage
npm run migrate:prod
```

Each wraps `wrangler d1 migrations apply dreamport-<env> --env <env> --remote`
— see `package.json` for the exact definition. `wrangler d1 migrations list
dreamport-<env> --env <env> --remote` shows what is pending without applying
anything. Without `--remote`, Wrangler targets the local Miniflare copy of the
database instead.

### Order relative to a deploy

Migrations are additive and must be applied **before** the Worker code that
depends on the new schema, so that at no point is deployed code reading a
column that does not exist yet:

1. Merge the migration + code change to `main`.
2. **Staging:** `npm run migrate:stage`, then let the preview/staging deploy
   run (or `npx wrangler deploy --env stage`). Verify sign-in still works.
3. **Production:** `npm run migrate:prod`, then `npx wrangler deploy --env prod`.

Roll forward, not back: a follow-up migration fixes a bad one. D1 has no
transactions (see [ADR-0002](adr/0002-better-auth-over-homegrown.md)), so a
multi-statement migration can partially apply — keep each one small.

## What is not committed

Database IDs are fine to commit. Secrets are not: `BETTER_AUTH_SECRET`,
Turnstile secret keys, and the Resend API key are set with
`wrangler secret put --env <env>` (or the Cloudflare / GitHub dashboards) and
never land in `wrangler.jsonc` or the repo.
