# Deployment: environments, D1, and migrations

Dreamport deploys to three environments, each with its own D1 database. There's
no Worker code yet, so today the deploy is just the static SPA. This doc is here
so the auth work in #20 onward has a fixed setup to build against.

## Environments

| Environment | Wrangler `env` | Worker name       | D1 database       | Domain                                | `EMAIL_MODE` |
| ----------- | -------------- | ----------------- | ----------------- | ------------------------------------- | ------------ |
| Production  | `prod`         | `dreamport-prod`  | `dreamport-prod`  | `dreamport.ianjmacintosh.com`         | `mock`       |
| Staging     | `stage`        | `dreamport-stage` | `dreamport-stage` | `staging.dreamport.ianjmacintosh.com` | `mock`       |
| Remote dev  | `dev`          | `dreamport-dev`   | `dreamport-dev`   | _(none — `workers.dev` only)_         | `mock`       |
| Local dev   | _(top level)_  | `dreamport`       | Miniflare SQLite  | `localhost`                           | `mock`       |

Each `env` block in [`wrangler.jsonc`](../wrangler.jsonc) binds its own D1
database as `DB`. Wrangler doesn't inherit `vars` or bindings into environments,
so every block repeats `EMAIL_MODE` and its `d1_databases` entry.

`EMAIL_MODE` is `mock` everywhere for now: sign-in codes go to the console,
nothing is sent. Resend gets switched on per environment in a later issue, once
sender-domain DNS exists.

### Local dev — `npm run dev`

Runs the Vite + `@cloudflare/vite-plugin` dev server against the top-level
config. It never touches remote D1; a local `DB` binding resolves to Miniflare's
SQLite under `.wrangler/`.

### `dreamport-dev` — opt-in remote D1

A real remote database for testing a DB-heavy change against real D1 behaviour
(no transactions, real error semantics) before opening a PR. Nothing points at
it unless you build with `CLOUDFLARE_ENV=dev` or pass `--env dev` to a
`wrangler d1` command.

### Deploying

The environment is picked at **build** time, not deploy time. `vite build`
reads `CLOUDFLARE_ENV`, resolves that one Wrangler environment, and writes
`dist/wrangler.json` plus a `.wrangler/deploy/config.json` redirect. `wrangler
deploy` and `wrangler versions upload` follow that redirect and ignore `--env`.
So `wrangler deploy --env prod` after a plain `npm run build` ships the
top-level config with no D1 binding — the `--env` does nothing.

Deploys run in Cloudflare Workers Builds. The build command is the same on every
branch and picks the environment from the branch name; only the deploy command
differs for production:

| Setting                                   | Value                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Build command                             | `CLOUDFLARE_ENV="$([ "$WORKERS_CI_BRANCH" = main ] && echo prod \|\| echo stage)" npm run build` |
| Deploy command (production branch `main`) | `npx wrangler deploy`                                                                            |
| Non-production branch deploy command      | `npx wrangler versions upload`                                                                   |

`main` deploys `dreamport-prod`. Every other branch uploads a preview version of
`dreamport-stage` — its own `*.workers.dev` URL, no production traffic. There
are no per-PR custom subdomains.

By hand:

```bash
CLOUDFLARE_ENV=stage npm run build && npx wrangler versions upload
CLOUDFLARE_ENV=prod  npm run build && npx wrangler deploy
```

## First-time setup

Creating the D1 databases needs `wrangler login` and Cloudflare account access,
so CI can't do it. Run:

```bash
./scripts/setup-d1.sh
```

It covers `wrangler login`, `wrangler d1 create dreamport-{prod,stage,dev}`,
writing each `database_id` into `wrangler.jsonc`, and the Workers Builds
commands above. Database IDs aren't secrets — commit them.

Until the wizard runs, the `database_id` values in `wrangler.jsonc` are
`PLACEHOLDER-run-scripts/setup-d1.sh`, and any real deploy or remote migration
fails fast.

## Migrations

Migration files live in [`migrations/`](../migrations/) as numbered
`NNNN_description.sql`, committed and reviewed like any schema change. Better
Auth's generated schema is the first one, added in #20.

Apply them per environment:

```bash
npm run migrate:dev
npm run migrate:stage
npm run migrate:prod
```

Each runs `wrangler d1 migrations apply dreamport-<env> --env <env> --remote`
(see `package.json`). Swap `apply` for `list` to see what's pending without
running it. Without `--remote` you hit the local Miniflare copy instead.

`wrangler d1` commands take `--env` because they read `wrangler.jsonc`
directly. Deploys don't — they go through the build output and take
`CLOUDFLARE_ENV` instead (see [Deploying](#deploying)).

### Order relative to a deploy

Migrations are additive and go out **before** the code that depends on the new
schema, so deployed code never reads a column that doesn't exist yet:

1. Merge the migration and code change to `main`.
2. **Staging:** `npm run migrate:stage`, then let a preview deploy run (or
   `CLOUDFLARE_ENV=stage npm run build && npx wrangler versions upload`). Check
   sign-in still works.
3. **Production:** `npm run migrate:prod`, then let the `main` deploy run (or
   `CLOUDFLARE_ENV=prod npm run build && npx wrangler deploy`).

Roll forward, not back: fix a bad migration with another migration. D1 has no
transactions (see [ADR-0002](adr/0002-better-auth-over-homegrown.md)), so a
multi-statement migration can partially apply — keep each one small.

## What's not committed

Database IDs are fine to commit. Secrets aren't: `BETTER_AUTH_SECRET`, the
Turnstile secret key, and the Resend API key go in with `wrangler secret put
--env <env>` (or the Cloudflare / GitHub dashboards) and never land in
`wrangler.jsonc` or the repo.
