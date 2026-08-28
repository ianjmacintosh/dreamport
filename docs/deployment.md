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
nothing points at it unless you build with `CLOUDFLARE_ENV=dev` (deploys) or
pass `--env dev` (`wrangler d1` commands).

### Deploying — production and previews

> **Environment is chosen at _build_ time, not deploy time.**
> `@cloudflare/vite-plugin` resolves exactly one Wrangler environment during
> `vite build` — picked from the **`CLOUDFLARE_ENV`** env var — and writes a
> fully-resolved `dist/wrangler.json` plus a `.wrangler/deploy/config.json`
> redirect. `wrangler deploy` / `wrangler versions upload` then read that
> redirect. Passing `--env` to the deploy is **silently ignored** once the
> redirect exists, so a `wrangler deploy --env prod` run after a plain
> `npm run build` ships the top-level config with **no D1 binding**. Always
> select the environment with `CLOUDFLARE_ENV` at build time.

Deploys run in Cloudflare's Workers Builds (GitHub integration). The **build
command** is shared across branches; only the **deploy command** differs
(production vs non-production), so the build command carries the branch check:

| Setting                                   | Value                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Build command                             | `CLOUDFLARE_ENV="$([ "$WORKERS_CI_BRANCH" = main ] && echo prod \|\| echo stage)" npm run build` |
| Deploy command (production branch `main`) | `npx wrangler deploy`                                                                            |
| Non-production branch deploy command      | `npx wrangler versions upload`                                                                   |

So `main` builds and deploys `dreamport-prod` (→ `dreamport-prod` D1); every
other branch builds and uploads a preview version of `dreamport-stage` (→
`dreamport-stage` D1), with its own `*.workers.dev` URL and no production
traffic. Cloudflare's Git integration does not mint per-PR custom subdomains.

To deploy by hand, select the environment the same way:

```bash
CLOUDFLARE_ENV=stage npm run build && npx wrangler versions upload
CLOUDFLARE_ENV=prod  npm run build && npx wrangler deploy
```

`scripts/setup-d1.sh` includes a stage that walks through entering these in
the dashboard.

## First-time setup (human-in-the-loop)

Creating the D1 databases needs `wrangler login` and Cloudflare account
access, so it is not something CI or an agent can do. Run the wizard:

```bash
./scripts/setup-d1.sh
```

It walks through `wrangler login`, `wrangler d1 create
dreamport-{prod,stage,dev}`, pasting each returned `database_id` into the
matching block in `wrangler.jsonc`, and the Workers Builds build/deploy
commands from the table above. Database IDs are **not secrets** — commit them.

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

Note the asymmetry: `wrangler d1` commands read `wrangler.jsonc` directly and
so take `--env <env>`, whereas **deploys** go through the vite-plugin build
output and so take `CLOUDFLARE_ENV` at build time and no `--env` (see
[Deploying](#deploying--production-and-previews)).

### Order relative to a deploy

Migrations are additive and must be applied **before** the Worker code that
depends on the new schema, so that at no point is deployed code reading a
column that does not exist yet:

1. Merge the migration + code change to `main`.
2. **Staging:** `npm run migrate:stage`, then let a preview deploy run (or
   `CLOUDFLARE_ENV=stage npm run build && npx wrangler versions upload`).
   Verify sign-in still works.
3. **Production:** `npm run migrate:prod`, then let the `main` deploy run (or
   `CLOUDFLARE_ENV=prod npm run build && npx wrangler deploy`).

Roll forward, not back: a follow-up migration fixes a bad one. D1 has no
transactions (see [ADR-0002](adr/0002-better-auth-over-homegrown.md)), so a
multi-statement migration can partially apply — keep each one small.

## What is not committed

Database IDs are fine to commit. Secrets are not: `BETTER_AUTH_SECRET`,
Turnstile secret keys, and the Resend API key are set with
`wrangler secret put --env <env>` (or the Cloudflare / GitHub dashboards) and
never land in `wrangler.jsonc` or the repo.
