# Deployment: environments, D1, and migrations

## Build step

Environment settings are defined in `wrangler.jsonc` and read at build time, using the `CLOUDFLARE_ENV` environment variable

The logic to set `CLOUDFLARE_ENV` is defined in the `build:ci` npm script

## Environments

| Environment                 | D1 database                   | Domain                                       | `EMAIL_MODE` |
| --------------------------- | ----------------------------- | -------------------------------------------- | ------------ |
| Production (`prod`)         | `dreamport-prod`              | `dreamport.ianjmacintosh.com`                | `mock`       |
| Staging (`stage`)           | `dreamport-stage`             | `????????-dreamport.bananasquad.workers.dev` | `mock`       |
| **TBD**: Remote dev (`dev`) | `dreamport-dev`               | `localhost`                                  | `mock`       |
| Local dev (`local`)         | `dreamport-local` (Miniflare) | `localhost`                                  | `mock`       |

### Dev (Local)

```sh
npm run dev
```

This command starts Vite with the Cloudflare plugin, using the `local` env settings

### Staging

When Cloudflare's Git plugin detects a change pushed to a branch other than `main`, Cloudflare will build it using `stage` settings in `wrangler.jsonc`

If the build is successful, Cloudflare will deploy a preview version at `????????-dreamport.bananasquad.workers.dev`

All preview versions share the `dreamport-stage` D1 database.

There is no long-lived staging host: "staging" is whichever branch preview is
being reviewed, all sharing the `dreamport-stage` database. The auth spec
([#18](https://github.com/ianjmacintosh/dreamport/issues/18)) named a stable
`staging.dreamport.ianjmacintosh.com`; that does not exist and is not planned.
`TRUSTED_ORIGINS` (in `src/worker/trusted-origins.ts`) therefore trusts only
production and any `*-dreamport.bananasquad.workers.dev` preview (scoped to this
account, not every `*.workers.dev` host).

### Production

When Cloudflare's Git plugin detects a change pushed to `main`, Cloudflare will build it using `prod` settings in `wrangler.jsonc`

If the build is successful, Cloudflare will deploy to `dreamport.ianjmacintosh.com`

## Deploying

Environment is set at **build** time, not deploy time.

`vite build` reads `CLOUDFLARE_ENV` and bakes that one environment into the build output. Don't pass `--env` to `wrangler deploy` or `wrangler versions upload` — the environment is already fixed, and an `--env` that disagrees with the build makes `wrangler` error out.

The specific build and deploy commands are managed in the Cloudflare web UI:

| Setting                          | Value                          |
| -------------------------------- | ------------------------------ |
| Build command                    | `npm run build:ci`             |
| Deploy command (`main`)          | `npx wrangler deploy`          |
| Version command (other branches) | `npx wrangler versions upload` |

## First-time setup

Creating the D1 databases needs `wrangler login` and Cloudflare account access,
so CI can't do it. Run:

```bash
./scripts/setup-d1.sh
```

It covers `wrangler login`, `wrangler d1 create dreamport-{prod,stage,dev}`,
writing each `database_id` into `wrangler.jsonc`, and the Workers Builds
commands above. Database IDs aren't secrets — commit them.

The `database_id`s in `wrangler.jsonc` are already filled in and committed. The
`local` env is the exception: its `database_id` is the literal string `local`,
which never resolves to a real database — it only ever names the Miniflare copy.

## Migrations

Migration files live in [`migrations/`](../migrations/) as numbered
`NNNN_description.sql`, committed and reviewed like any schema change.
`0001_better_auth_core_schema.sql` is Better Auth's core schema, generated once
for the pinned `better-auth` version and frozen; schema changes on an upgrade
land as a new numbered migration (see [`migrations/README.md`](../migrations/README.md)).

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

For local `npm run dev`, put `BETTER_AUTH_SECRET` in a `.dev.vars` file
(gitignored; see [`.dev.vars.example`](../.dev.vars.example)).
