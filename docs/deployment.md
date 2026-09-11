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

Environment settings are defined in `wrangler.jsonc` and read at build time
via the `CLOUDFLARE_ENV` environment variable. It is **not** inferred from the
branch — each Workers Builds project sets it inline in its own **Build
command**, and that command is the whole of what each project needs from the
dashboard:

- `dreamport` — `CLOUDFLARE_ENV=production npm run build`
- `dreamport-staging` — `CLOUDFLARE_ENV=staging npm run build`

`CLOUDFLARE_ENV` set this way is the one build input that has always reached
the build reliably (it shows up verbatim in the Workers Builds log:
`Executing user build command: CLOUDFLARE_ENV=staging npm run build`).
Everything else that used to need a per-environment value is now keyed off it
from inside the repo:

- **`VITE_TURNSTILE_SITE_KEY`** (public Turnstile site key, baked into the
  client bundle) — resolved in `vite.config.ts` from a committed
  `CLOUDFLARE_ENV` → key map (`resolveTurnstileSiteKey`) and injected with
  Vite `define`. `production` gets the real widget key, `staging`/`local` get
  Cloudflare's always-pass test key. An explicit `VITE_TURNSTILE_SITE_KEY` in
  the environment still overrides the map (the CI e2e workflow sets one);
  `define` otherwise wins over any stray `.env`.
- **Runtime vars / secrets** — `wrangler.jsonc` `env.<env>.vars` for
  non-secrets (`EMAIL_MODE`, `TURNSTILE_HOSTNAMES`, the staging test
  `TURNSTILE_SECRET_KEY`), `wrangler secret put --name <worker>` for real
  secrets. See [What's not committed](#whats-not-committed).

Nothing is set via the dashboard's "Variables and secrets" panels. The Build
side of it silently stopped delivering a saved `VITE_TURNSTILE_SITE_KEY` (a
build shipped `undefined` while the dashboard showed it set); the runtime side
loses to `wrangler.jsonc` on every `wrangler deploy` by design, so a value set
there disappears on the next build. Keeping build config in `vite.config.ts`
and runtime config in `wrangler.jsonc` / `wrangler secret put` sidesteps both:
the only thing left in the dashboard is the fixed one-line Build command.

## Environments

| Environment                 | Workers Builds project | D1 database                   | Domain                                               | `EMAIL_MODE` |
| --------------------------- | ---------------------- | ----------------------------- | ---------------------------------------------------- | ------------ |
| Production (`production`)   | `dreamport`            | `dreamport-prod`              | `dreamport.ianjmacintosh.com`                        | `resend`     |
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
upload`), not an automatic promote-to-live. Its Build command is fixed
(`CLOUDFLARE_ENV=staging npm run build` — see the [Build step](#build-step)).
Every build uploads a preview version at
`????????-dreamport-staging.bananasquad.workers.dev`.

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
Build command is fixed (`CLOUDFLARE_ENV=production npm run build` — see the
[Build step](#build-step)), and non-production-branch builds are disabled on
this project — feature branches build under `dreamport-staging` instead.

When a change lands on `main`, Cloudflare builds and deploys it to `dreamport.ianjmacintosh.com`

## Sign-in email

`EMAIL_MODE` (a `wrangler.jsonc` var — `resend` in production, `mock`
everywhere else) picks the email sender inside `createAuth`:

- **`mock`** (also the default when the var is unset) — records the 6-digit
  code in an in-memory buffer and sends nothing. It does **not** log the code
  (issue #41): a one-time code is a bearer credential and Worker logs fan out
  far wider than the auth DB. The code is also hashed before it reaches D1
  (`storeOTP: "hashed"`, issue #39, `docs/adr/0009`), so querying the
  `verification` table no longer recovers a usable code either — there is no
  supported way to read one back for a deployed `mock` environment (staging
  included). `src/worker/auth.ts`'s `generateOTP` fixed-code marker
  (`+e2e-test@`) doesn't help here: it's gated on `TEST_LOGIN_ENABLED`,
  which `wrangler.jsonc` only sets `"true"` for `local`/`dev`, deliberately
  never for `staging` (a public `*.workers.dev` URL) or `production` (see
  `docs/adr/0009` for why). Sign-in against a deployed `mock` environment by
  hand isn't a supported workflow — drive it locally instead (see the root
  `README.md`), or through `deployment-smoke.spec.ts`, which only exercises
  the send step.

- **`resend`** — sends through the Resend API. It additionally requires the
  `RESEND_API_KEY` secret; `createAuth` throws on the first request if it is
  missing, so there is no silent fallback to `mock`. The `From:` address is
  not config — it is the `EMAIL_FROM` constant in
  `src/worker/email/sender.ts` (a fixed property of the one email we send,
  like its subject and body).

**Production runs `resend` (issue #38).** `EMAIL_MODE: "resend"` is in
`env.production.vars`; `RESEND_API_KEY` is a secret on the `dreamport`
Workers Builds project (`wrangler secret put RESEND_API_KEY --env
production`). The sender domain `dreamport.ianjmacintosh.com` (the
`EMAIL_FROM` constant sends from `noreply@` on it) has live SPF/DKIM records
and is verified in Resend.

**Every other environment stays `mock`, permanently and by decision** —
staging, `dev`, `local`, and every branch preview. That keeps preview and PR
testing off real sends and off the Resend quota (consistent with the #24
daily cap). Turning `resend` on for one of them would be a deliberate,
recorded decision — see the comment above `EMAIL_MODE` in `wrangler.jsonc`.

Flipping an environment to `resend` is: set the `RESEND_API_KEY` secret on
that environment's Workers Builds project, then set that env's `EMAIL_MODE`
in `wrangler.jsonc`. Every `resend` environment sends from the same
`EMAIL_FROM` constant.

Set the secret with `wrangler secret put RESEND_API_KEY --env <env>` if your
token has `Workers Scripts:Edit`. If CLI secret writes are denied, add it in
the Cloudflare dashboard instead: Workers & Pages → the project → Settings →
Variables and Secrets → Add, **Type: Secret (encrypted)** — not a
plaintext var, which `wrangler.jsonc` overwrites on the next build. A
dashboard-set encrypted secret survives subsequent Workers Builds deploys.

### Production refuses mock email

The send-OTP path (`POST /api/auth/email-otp/send-verification-otp`) returns
`503` on the production host `dreamport.ianjmacintosh.com` whenever the
resolved `EMAIL_MODE` is anything but `resend` (`src/worker/index.ts`, issue
#41). The mock sender delivers nothing, so this makes a mock-wired production
**fail closed** — sign-in is unavailable and visibly broken — instead of
failing open, taking sign-ins and dropping every code.

Production now runs `resend` (issue #38), so the guard passes in normal
operation. It stays as a backstop: if a dashboard override or a bad rollback
leaves the deployed version on `mock`, sign-in fails closed rather than
silently swallowing codes. Reverting `EMAIL_MODE` to `mock` is a one-line
rollback that needs no other change — but on this host it returns sign-in to
this fail-closed 503, it does **not** restore a working mock login.

The guard is keyed on the exact request `Host`, so staging, the
`*-dreamport-staging` preview URLs, and local dev keep running `mock`
unaffected. `scripts/verify-deployment.sh` also fails the **Version bindings**
check on a `verify:production` run while the deployed production version's
`EMAIL_MODE` is not `resend` — the detective backstop for a dashboard
override that the runtime guard would otherwise only surface on a user's
failed sign-in.

## Turnstile (bot check on the send-OTP path)

The `/login` email step renders a Cloudflare Turnstile widget (rendered with
`action: "send-otp"`), and the Worker verifies its token server-side before
Better Auth issues a code (#23). Three values:

- **`VITE_TURNSTILE_SITE_KEY`** — the public site key, read at **build** time
  via `import.meta.env` and baked into the client bundle. Resolved in
  `vite.config.ts` from a committed `CLOUDFLARE_ENV` → key map
  (`resolveTurnstileSiteKey`, unit-tested in `vite.config.test.ts`):
  `production` → the real widget key, `staging`/`local` → Cloudflare's
  always-pass test key. It's a public value, so committing the map is fine.
  An explicit `VITE_TURNSTILE_SITE_KEY` in the environment still wins — the CI
  e2e workflow sets one in its `env:` block; nothing else needs to.
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

|                                                              | `dreamport` (prod)                 | `dreamport-staging`                                         |
| ------------------------------------------------------------ | ---------------------------------- | ----------------------------------------------------------- |
| `VITE_TURNSTILE_SITE_KEY` (build, from `vite.config.ts` map) | `0x4AAAAAAEqY4wvljJsO_dJb`         | `1x00000000000000000000AA`                                  |
| `TURNSTILE_SECRET_KEY` (runtime)                             | real secret, `wrangler secret put` | `1x0000000000000000000000000000000AA` (in `wrangler.jsonc`) |
| `TURNSTILE_HOSTNAMES`                                        | _(set in `wrangler.jsonc`)_        | _(unset — lenient)_                                         |

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

## Observability (Workers Logs)

Configured in `wrangler.jsonc`, not the dashboard — a value toggled in the
dashboard is reverted on the next `wrangler deploy` / `wrangler versions
upload` (that's the "settings are consistent across deployments" nag), the
same reason runtime vars live in `wrangler.jsonc` (see [Build
step](#build-step)).

| Environment               | Workers Logs                    | Where                                                       |
| ------------------------- | ------------------------------- | ----------------------------------------------------------- |
| Production (`production`) | **off**                         | inherits the top-level `observability: { enabled: false }`  |
| Staging (`staging`)       | **on**, `head_sampling_rate: 1` | `env.staging.observability` overrides the top-level default |
| dev / local               | off                             | inherits the top-level default (local is Miniflare — moot)  |

Staging is the observable environment: its long-lived host runs at 100%
traffic, so `wrangler tail` and the dashboard Logs view work there —
preview URLs can't be tailed (see [Staging](#staging)). `head_sampling_rate:
1` keeps every request; staging traffic is low.

Production stays off deliberately. Turning it on is coupled to log **access
/ egress / retention** hardening — who can read them, Logpush destinations,
retention window — tracked in
[#42](https://github.com/ianjmacintosh/dreamport/issues/42). (Sign-in codes
themselves are no longer logged — [#41](https://github.com/ianjmacintosh/dreamport/issues/41).)

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

`CLOUDFLARE_ENV` is set only in the Build command string, never as a separate
dashboard Build _variable_; `VITE_TURNSTILE_SITE_KEY` isn't set in the
dashboard at all (it comes from the `vite.config.ts` map). See
[Build step](#build-step) for why.

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
`0002_send_otp_rate_limiting.sql` adds the `rateLimit`, `otpSendThrottle`, and
`otpSendDaily` tables and **must be applied to staging and production with the
issue #24 deploy** — the send-OTP path reads them on every request once that
code is live. That deploy also picks up the optional `SEND_OTP_DAILY_CAP` var
(see [ADR-0007](adr/0007-send-otp-rate-limiting.md)); unset it defaults to 90
sends/UTC-day app-wide, sized for Resend's free tier — raise it in
`wrangler.jsonc` per environment when the plan grows.

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
   run the project's Build command from the table above, then
   `npx wrangler versions upload`). Check sign-in still works.
3. **Production:** `npm run migrate:production`, then let the `main` deploy run
   (or the Build command from the table above, then `npx wrangler deploy`).

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
- **`RESEND_API_KEY`** — required on `dreamport` (production): its
  `EMAIL_MODE` is `resend` (issue #38), and `createAuth` throws on the first
  request without it. Set it via `wrangler secret put` or, if CLI secret
  writes are denied, as an encrypted dashboard secret — see [Sign-in
  email](#sign-in-email). Not needed on `dreamport-staging` or dev/local —
  they stay on `mock`. There is no `EMAIL_FROM` secret or var — the `From:`
  address is the `EMAIL_FROM` constant in `src/worker/email/sender.ts`.
- **`TURNSTILE_SECRET_KEY`** — required now (#23). The send-OTP path verifies
  the Turnstile widget token against Cloudflare `siteverify` before issuing a
  code, and **fails closed** (503, no code sent) when this is unset.
  Production uses the real widget's secret, set with
  `wrangler secret put TURNSTILE_SECRET_KEY --name dreamport` (never the
  dashboard runtime-var panel — that value is wiped by the next `wrangler
deploy`). Staging uses Cloudflare's always-pass test secret
  `1x0000000000000000000000000000000AA`, which is a public value and so lives
  in `wrangler.jsonc` (`env.staging.vars`) rather than as a secret. The public
  `VITE_TURNSTILE_SITE_KEY` (from the `vite.config.ts` map) and the non-secret
  `TURNSTILE_HOSTNAMES` are covered in [Turnstile](#turnstile-bot-check-on-the-send-otp-path).

Because production and staging are separate Worker scripts, the same secret
name can (and for `RESEND_API_KEY`, generally should) hold different values
in each.

For local `npm run dev`, put `BETTER_AUTH_SECRET` in a `.dev.vars` file
(gitignored; see [`.dev.vars.example`](../.dev.vars.example)).
