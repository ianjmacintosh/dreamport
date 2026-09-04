# Deployment: environments, D1, and migrations

## Two Workers Builds projects, one repo

Production and staging are **two separate Cloudflare Workers Builds
projects** — `dreamport` and `dreamport-staging` — each Git-connected to
this same repository and building/deploying independently. This is the
pattern Cloudflare's own docs use for multi-environment Workers Builds setups
(see [Advanced setups](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/)):
one dashboard Worker per environment, all watching the same repo.

They're separate projects — not one project deploying two `wrangler.jsonc`
`env` blocks picked by branch — specifically so each has its **own runtime
secrets**: `RESEND_API_KEY` can hold a different value for `dreamport` than
for `dreamport-staging`, because they're different Worker scripts with
different secret stores. A single script can't do that — Workers Builds'
"Variables and Secrets" has no Production/Preview scoping the way Pages
does; runtime secrets belong to the whole script, not to a branch or a
Version.

## Build step

Environment settings are defined in `wrangler.jsonc` and read at build time via the `CLOUDFLARE_ENV` environment variable.

`CLOUDFLARE_ENV` is **not** inferred from the branch. Each Workers Builds
project sets it directly as a Build variable in its own dashboard settings —
`dreamport` sets `CLOUDFLARE_ENV=production`, `dreamport-staging` sets
`CLOUDFLARE_ENV=staging` — and both projects' Build command is plain `npm run build`.

## Environments

| Environment                 | Workers Builds project | D1 database                   | Domain                                               | `EMAIL_MODE` |
| --------------------------- | ---------------------- | ----------------------------- | ---------------------------------------------------- | ------------ |
| Production (`production`)   | `dreamport`            | `dreamport-prod`              | `dreamport.ianjmacintosh.com`                        | `mock`       |
| Staging (`staging`)         | `dreamport-staging`    | `dreamport-stage`             | `????????-dreamport-staging.bananasquad.workers.dev` | `mock`       |
| **TBD**: Remote dev (`dev`) | —                      | `dreamport-dev`               | `localhost`                                          | `mock`       |
| Local dev (`local`)         | —                      | `dreamport-local` (Miniflare) | `localhost`                                          | `mock`       |

### Dev (Local)

```sh
npm run dev
```

This command starts Vite with the Cloudflare plugin, using the `local` env settings

### Staging

The `dreamport-staging` Workers Builds project builds every branch pushed to
this repo. Its "production branch" setting deliberately points at a branch
that's never pushed to, so every real branch takes the preview/version path
(`wrangler versions upload`), never the promote-to-live path. Its Build
variable is fixed at `CLOUDFLARE_ENV=staging`.

If the build is successful, Cloudflare uploads a preview version at
`????????-dreamport-staging.bananasquad.workers.dev`.

All preview versions share the `dreamport-stage` D1 database.

There is no long-lived staging host: "staging" is whichever branch preview is
being reviewed, all sharing the `dreamport-stage` database. The auth spec
([#18](https://github.com/ianjmacintosh/dreamport/issues/18)) named a stable
`staging.dreamport.ianjmacintosh.com`; that does not exist and is not planned.
`TRUSTED_ORIGINS` (in `src/worker/trusted-origins.ts`) therefore trusts only
production and any `*-dreamport-staging.bananasquad.workers.dev` preview
(scoped to this account, not every `*.workers.dev` host).

### Production

The `dreamport` Workers Builds project's production branch is `main`, its
Build variable is fixed at `CLOUDFLARE_ENV=production`, and
non-production-branch builds are disabled on this project — feature
branches build under `dreamport-staging` instead.

When a change lands on `main`, Cloudflare builds and deploys it to `dreamport.ianjmacintosh.com`

## Sign-in email

`EMAIL_MODE` (a `wrangler.jsonc` var, `mock` in every environment today)
picks the email sender inside `createAuth`:

- **`mock`** (also the default when the var is unset) — writes the 6-digit
  code to the Worker console and to an in-memory record; sends nothing.
- **`resend`** — sends through the Resend API. It additionally requires the
  `RESEND_API_KEY` and `EMAIL_FROM` secrets; `createAuth` throws on the first
  request if either is missing, so there is no silent fallback to `mock`.

Real sending stays off until sender-domain DNS (SPF/DKIM) exists for
`mail.dreamport.ianjmacintosh.com`; until then every environment runs `mock`.
Flipping an environment to `resend` is: set the two secrets on that
environment's Workers Builds project — `wrangler secret put --name dreamport`
or `--name dreamport-staging` (or the Cloudflare dashboard) — then change
that env's `EMAIL_MODE` in `wrangler.jsonc`.

## Deploying

Environment is set at **build** time, not deploy time.

`vite build` reads `CLOUDFLARE_ENV` and bakes that one environment into the build output. Don't pass `--env` to `wrangler deploy` or `wrangler versions upload` — the environment is already fixed, and an `--env` that disagrees with the build makes `wrangler` error out.

The specific build and deploy commands are managed per-project in the Cloudflare web UI:

| Setting                                   | `dreamport` (production)    | `dreamport-staging` (staging)  |
| ----------------------------------------- | --------------------------- | ------------------------------ |
| Build variable                            | `CLOUDFLARE_ENV=production` | `CLOUDFLARE_ENV=staging`       |
| Build command                             | `npm run build`             | `npm run build`                |
| Production branch                         | `main`                      | (never pushed to)              |
| Deploy command (production-branch pushes) | `npx wrangler deploy`       | `npx wrangler deploy`          |
| Version command (other branches)          | _(disabled)_                | `npx wrangler versions upload` |

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
npm run migrate:staging
npm run migrate:production
```

Each runs `wrangler d1 migrations apply dreamport-<db> --env <env> --remote`
(see `package.json`). Swap `apply` for `list` to see what's pending without
running it. Without `--remote` you hit the local Miniflare copy instead.

`wrangler d1` commands take `--env` because they read `wrangler.jsonc`
directly. Deploys don't — they go through the build output and take
`CLOUDFLARE_ENV` instead (see [Deploying](#deploying)).

### Order relative to a deploy

Migrations are additive and go out **before** the code that depends on the new
schema, so deployed code never reads a column that doesn't exist yet:

1. Merge the migration and code change to `main`.
2. **Staging:** `npm run migrate:staging`, then let a preview deploy run (or
   `CLOUDFLARE_ENV=staging npm run build && npx wrangler versions upload`). Check
   sign-in still works.
3. **Production:** `npm run migrate:production`, then let the `main` deploy run (or
   `CLOUDFLARE_ENV=production npm run build && npx wrangler deploy`).

Roll forward, not back: fix a bad migration with another migration. D1 has no
transactions (see [ADR-0002](adr/0002-better-auth-over-homegrown.md)), so a
multi-statement migration can partially apply — keep each one small.

## What's not committed

Database IDs are fine to commit. Secrets aren't, and go in per-project with
`wrangler secret put --name dreamport` / `--name dreamport-staging` (or the
Cloudflare / GitHub dashboards), never in `wrangler.jsonc` or the repo.

- **`BETTER_AUTH_SECRET`** — required now. `createAuth()` throws on every
  request without it, so a freshly created project (e.g. `dreamport-staging`)
  isn't functional until this is set, even after a successful build.
- **`RESEND_API_KEY` + `EMAIL_FROM`** — needed later, only once that
  project's `EMAIL_MODE` flips from `mock` to `resend` (see
  [#38](https://github.com/ianjmacintosh/dreamport/issues/38)). Not required
  today. `EMAIL_FROM` isn't secret but travels with the key.
- **A Turnstile secret** — not yet, and not yet consumed by any code path
  (ADR-0001, ADR-0005 plan it; nothing reads it today). Don't set it until
  the Turnstile integration lands.

Because production and staging are separate Worker scripts, the same secret
name can (and for `RESEND_API_KEY`, generally should) hold different values
in each.

For local `npm run dev`, put `BETTER_AUTH_SECRET` in a `.dev.vars` file
(gitignored; see [`.dev.vars.example`](../.dev.vars.example)).
