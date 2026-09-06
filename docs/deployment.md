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
project sets it inline in its own **Build command** —
`dreamport` builds with `CLOUDFLARE_ENV=production npm run build`,
`dreamport-staging` builds with `CLOUDFLARE_ENV=staging npm run build`.

This is deliberately _not_ set via the dashboard's separate "Variables and
secrets" panel. That panel proved unreliable for this project: a saved
`CLOUDFLARE_ENV` Build variable silently stopped reaching the actual build
process, with no error and no amount of re-saving or reconnecting Git fixing
it. Baking the value directly into the Build command sidesteps that failure
mode entirely, since it's then part of the literal shell command Cloudflare
runs, not a separately-injected variable.

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
this repo. Its "production branch" setting points at a branch that's never
pushed to, so every build takes the version path (`wrangler versions
upload`), not an automatic promote-to-live. Its Build command is fixed at
`CLOUDFLARE_ENV=staging npm run build`. Every build uploads a preview version
at `????????-dreamport-staging.bananasquad.workers.dev`.

**The long-lived staging host is the bare
`dreamport-staging.bananasquad.workers.dev`.** Whatever version is currently
deployed to 100% traffic serves there, and that's the environment you
integration-test against — because Cloudflare **cannot** show logs for
preview URLs (`wrangler tail`, Workers Logs, and Logpush all exclude them,
see [Preview URLs limitations](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/#limitations)),
so a preview-only "staging" can't be debugged. A branch's per-commit preview
URL is still fine for eyeballing UI; it just can't be observed.

Promote a version to the staging host by hand:

```bash
npx wrangler versions deploy <version-id>@100 --name dreamport-staging --yes
```

(the version ID is in the build log, or `npx wrangler versions list --name
dreamport-staging`). Nothing auto-promotes today; a future option is to point
this project's "production branch" at `main` with a `wrangler deploy` deploy
command so `main` merges land on the staging host automatically, while
feature branches keep uploading previews to promote manually.

Everything — the staging host and every preview — shares the
`dreamport-stage` D1 database.

`TRUSTED_ORIGINS` / `ALLOWED_HOSTS` (in `src/worker/trusted-origins.ts`) trust
production, the bare `dreamport-staging.bananasquad.workers.dev` staging host,
and any `*-dreamport-staging.bananasquad.workers.dev` preview (scoped to this
account, not every `*.workers.dev` host). The auth spec
([#18](https://github.com/ianjmacintosh/dreamport/issues/18)) named a stable
`staging.dreamport.ianjmacintosh.com`; that specific hostname does not exist —
the `workers.dev` host is staging.

### Production

The `dreamport` Workers Builds project's production branch is `main`, its
Build command is fixed at `CLOUDFLARE_ENV=production npm run build`, and
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

## Turnstile (bot check on the send-OTP path)

The `/login` email step renders a Cloudflare Turnstile widget (rendered with
`action: "send-otp"`), and the Worker verifies its token server-side before
Better Auth issues a code (#23). Three values:

- **`VITE_TURNSTILE_SITE_KEY`** — the public site key, read at **build** time
  via `import.meta.env` and baked into the client bundle. Each Workers Builds
  project sets its own as a **build variable** (Cloudflare dashboard → the
  project → Settings → Variables and Secrets, or prefix it into the Build
  command like `CLOUDFLARE_ENV`): `dreamport` gets the real site key from its
  Turnstile widget; `dreamport-staging` gets the always-pass test key. There
  is **no committed default** — `.env` is gitignored, so a build with the var
  unset ships a widget that can't render (a loud failure, on purpose — better
  than silently shipping a test key that waves every bot through). Local dev
  copies `.env.example` to `.env`; CI e2e sets the var in the workflow's
  `env:` block.
- **`TURNSTILE_SECRET_KEY`** — the secret key, read at **runtime** from
  `c.env`. A per-project Cloudflare secret (see [What's not
  committed](#whats-not-committed)). The send path **fails closed** (503, no
  code issued) when it is unset.
- **`TURNSTILE_HOSTNAMES`** — a comma-separated hostname allowlist, **not** a
  secret. When set, the gate also requires the verified token's `hostname` to
  be in the list and its `action` to be `send-otp`. It's pinned for
  production in `wrangler.jsonc` (`env.production.vars`,
  `dreamport.ianjmacintosh.com`) and left unset everywhere else.

`dreamport` and `dreamport-staging` are separate projects with separate
secret stores, so their keys are set independently:

|                                            | `dreamport` (prod)                   | `dreamport-staging`                   |
| ------------------------------------------ | ------------------------------------ | ------------------------------------- |
| `VITE_TURNSTILE_SITE_KEY` (build variable) | `0x4AAAAAAEqY4wvljJsO_dJb`           | `1x00000000000000000000AA`            |
| `TURNSTILE_SECRET_KEY` (runtime secret)    | the matching secret from that widget | `1x0000000000000000000000000000000AA` |
| `TURNSTILE_HOSTNAMES`                      | _(set in `wrangler.jsonc`)_          | _(unset — lenient)_                   |

The production widget is scoped to `ianjmacintosh.com` (Turnstile authorizes
a hostname and all its subdomains, so `dreamport.ianjmacintosh.com` is
covered; the gate still pins the exact host, which is tighter). It has **no**
`workers.dev` hostname, and a widget can't be created without one — so the
real widget simply won't render on staging or a preview URL. Staging
therefore runs Cloudflare's always-pass test pair; `TURNSTILE_HOSTNAMES`
stays unset there (lenient — `success` check only). The test secret still
exercises the real `siteverify` HTTPS call, it just always answers success.
Real-challenge behaviour is a production smoke-test concern.

Cloudflare's always-fail pair (`2x00000000000000000000AB` /
`2x0000000000000000000000000000000AA`) drives negative tests. The Vitest
suites don't touch Cloudflare at all: `src/worker/index.worker.test.ts` stubs
the verifier and `src/worker/turnstile.test.ts` stubs `fetch`. The Playwright
suite runs against a local worker with the test pair injected, never a
deployed environment.

## Deploying

Environment is set at **build** time, not deploy time.

`vite build` reads `CLOUDFLARE_ENV` and bakes that one environment into the build output. Don't pass `--env` to `wrangler deploy` or `wrangler versions upload` — the environment is already fixed, and an `--env` that disagrees with the build makes `wrangler` error out.

The specific build and deploy commands are managed per-project in the Cloudflare web UI:

| Setting                                   | `dreamport` (production)                  | `dreamport-staging` (staging)          |
| ----------------------------------------- | ----------------------------------------- | -------------------------------------- |
| Build command                             | `CLOUDFLARE_ENV=production npm run build` | `CLOUDFLARE_ENV=staging npm run build` |
| Production branch                         | `main`                                    | (never pushed to)                      |
| Deploy command (production-branch pushes) | `npx wrangler deploy`                     | `npx wrangler deploy`                  |
| Version command (other branches)          | _(disabled)_                              | `npx wrangler versions upload`         |

There is no separate Build _variable_ for `CLOUDFLARE_ENV` — see
[Build step](#build-step) for why it's baked into the command instead.

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
- **`TURNSTILE_SECRET_KEY`** — required now (#23). The send-OTP path verifies
  the Turnstile widget token against Cloudflare `siteverify` before issuing a
  code, and **fails closed** (503, no code sent) when this is unset. Set it
  per project: `wrangler secret put TURNSTILE_SECRET_KEY --name dreamport` /
  `--name dreamport-staging` (or the dashboard). Production uses the secret
  from the real widget (site key `0x4AAAAAAEqY4wvljJsO_dJb`); staging uses
  Cloudflare's always-pass test secret `1x0000000000000000000000000000000AA`.
  The public `VITE_TURNSTILE_SITE_KEY` build variable and the non-secret
  `TURNSTILE_HOSTNAMES` are covered in [Turnstile](#turnstile-bot-check-on-the-send-otp-path).

Because production and staging are separate Worker scripts, the same secret
name can (and for `RESEND_API_KEY`, generally should) hold different values
in each.

For local `npm run dev`, put `BETTER_AUTH_SECRET` in a `.dev.vars` file
(gitignored; see [`.dev.vars.example`](../.dev.vars.example)).
