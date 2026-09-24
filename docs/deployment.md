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

- `dreamport` — `npm run migrate:production && CLOUDFLARE_ENV=production npm run build`
- `dreamport-staging` — `npm run migrate:staging && CLOUDFLARE_ENV=staging npm run build`

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
- **`TRUSTED_ORIGINS` / `ALLOWED_HOSTS`** (`src/worker/trusted-origins.ts`) —
  same pattern as the Turnstile key: `CLOUDFLARE_ENV` is also injected as
  `import.meta.env.CLOUDFLARE_ENV` for the worker bundle, and
  `hostsForEnvironment` picks that one environment's own host group from it.
  `production` and `staging` each get only their own hosts; anything else
  (`local`, an unbuilt `dev`, or an unrecognized value) gets none of its own,
  falling back to `localhost` (issue #63,
  [ADR-0011](adr/0011-per-environment-host-allowlists.md) — this amends
  [ADR-0003](adr/0003-trusted-origins-constant-array.md), which is why one
  build no longer trusts every environment's hosts the way it used to).
- **Runtime vars / secrets** — `wrangler.jsonc` `env.<env>.vars` for
  non-secrets (the staging test `TURNSTILE_SECRET_KEY`), `wrangler secret put
--name <worker>` for real secrets. See [What's not
  committed](#whats-not-committed).

Nothing is set via the dashboard's "Variables and secrets" panels. The Build
side of it silently stopped delivering a saved `VITE_TURNSTILE_SITE_KEY` (a
build shipped `undefined` while the dashboard showed it set); the runtime side
loses to `wrangler.jsonc` on every `wrangler deploy` by design, so a value set
there disappears on the next build. Keeping build config in `vite.config.ts`
and runtime config in `wrangler.jsonc` / `wrangler secret put` sidesteps both:
the only thing left in the dashboard is the fixed one-line Build command.

## Environments

| Environment                 | Workers Builds project | D1 database                   | Domain                                               | `RESEND_API_KEY` |
| --------------------------- | ---------------------- | ----------------------------- | ---------------------------------------------------- | ---------------- |
| Production (`production`)   | `dreamport`            | `dreamport-prod`              | `dreamport.ianjmacintosh.com`                        | set (real sends) |
| Staging (`staging`)         | `dreamport-staging`    | `dreamport-stage`             | `????????-dreamport-staging.bananasquad.workers.dev` | set (real sends) |
| **TBD**: Remote dev (`dev`) | —                      | `dreamport-dev`               | `localhost`                                          | unset (mock)     |
| Local dev (`local`)         | —                      | `dreamport-local` (Miniflare) | `localhost`                                          | unset (mock)     |

### Dev (Local)

```sh
npm run dev
```

This command starts Vite with the Cloudflare plugin, using the `local` env settings

### Staging

The `dreamport-staging` Workers Builds project builds every branch pushed to
this repo. Its "production branch" setting points at a branch that's never
pushed to, so every build takes the version path (`wrangler versions
upload`), not an automatic promote-to-live. Its Build command is
`npm run migrate:staging && CLOUDFLARE_ENV=staging npm run build` (see
[Migrations](#migrations) and the [Build step](#build-step)) — every build
applies whatever's pending to the shared `dreamport-stage` D1 first, so a
branch carrying a new migration never previews against a database that
doesn't have it yet (issue #47; see that section for why this runs on
every build rather than only the ones that matter). Every build uploads a
preview version at
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

`TRUSTED_ORIGINS` / `ALLOWED_HOSTS` (in `src/worker/trusted-origins.ts`) are
resolved once per build from that build's own `CLOUDFLARE_ENV` — **not**
shared across every environment (issue #63,
[ADR-0011](adr/0011-per-environment-host-allowlists.md)). Staging's build
trusts only its own hosts: the bare `dreamport-staging.bananasquad.workers.dev`
staging host, and any `*-dreamport-staging.bananasquad.workers.dev` preview
(scoped to this account, not every `*.workers.dev` host) — never production's
hostname, and never `localhost`. The auth spec
([#18](https://github.com/ianjmacintosh/dreamport/issues/18)) named a stable
`staging.dreamport.ianjmacintosh.com`; that specific hostname does not exist —
the `workers.dev` host is staging.

### Production

The `dreamport` Workers Builds project's production branch is `main`, its
Build command is
`npm run migrate:production && CLOUDFLARE_ENV=production npm run build`
(see [Migrations](#migrations) and the [Build step](#build-step)), and
non-production-branch builds are disabled on this project — feature
branches build under `dreamport-staging` instead.

When a change lands on `main`, Cloudflare builds and deploys it to `dreamport.ianjmacintosh.com`

Production's build resolves `TRUSTED_ORIGINS` / `ALLOWED_HOSTS` to its own
host only — no staging host, no `localhost` (issue #63,
[ADR-0011](adr/0011-per-environment-host-allowlists.md)).

## Sign-in email

`RESEND_API_KEY`'s presence — not a separate mode flag — picks the email
sender inside `createAuth` (`createEmailSender`, issue #66,
[ADR-0010](adr/0010-email-delivery-keyed-on-resend-api-key-presence.md)):

- **Absent** — the default for every environment without the secret set —
  records the 6-digit code in an in-memory buffer and sends nothing. It does
  **not** log the code (issue #41): a one-time code is a bearer credential and
  Worker logs fan out far wider than the auth DB. The code is also hashed
  before it reaches D1 (`storeOTP: "hashed"`, issue #39, `docs/adr/0009`), so
  querying the `verification` table no longer recovers a usable code either —
  there is no supported way to read one back for a deployed mock-sender
  environment. `src/worker/auth.ts`'s `generateOTP` fixed-code marker
  (`+e2e-test@`) is the escape hatch: it's gated on `TEST_LOGIN_ENABLED`,
  which `wrangler.jsonc` sets `"true"` for `local`/`dev`/`staging` (issue #70;
  see `docs/adr/0009` for why) — never production. Sign-in against production
  by hand isn't a supported workflow — drive it locally instead (see the root
  `README.md`), or through `deployment-smoke.spec.ts`, which only exercises
  the send step.

- **Present** — sends through the Resend API via `ResendEmailSender`. The
  `From:` address is not config — it is the `EMAIL_FROM` constant in
  `src/worker/email/sender.ts` (a fixed property of the one email we send,
  like its subject and body).

**Production has a real key (issue #38).** `RESEND_API_KEY` is a secret on
the `dreamport` Workers Builds project (`wrangler secret put RESEND_API_KEY
--env production`). The sender domain `dreamport.ianjmacintosh.com` (the
`EMAIL_FROM` constant sends from `noreply@` on it) has live SPF/DKIM records
and is verified in Resend.

**Staging is getting a real key (issue #70)**, provisioned via the Cloudflare
dashboard on `dreamport-staging` as an encrypted secret — see "Giving an
environment a real key" just below; no agent runs `wrangler secret put` for
this, per the standing constraint from issue #38. Until that dashboard step
lands, staging stays on the mock sender like every other key-less
environment.

**`dev`, `local`, and every branch preview stay on the mock sender**
permanently, by decision, to keep preview and PR testing off real sends and
off the Resend quota (consistent with the #24 daily cap).

Giving an environment a real key is: set the `RESEND_API_KEY` secret on that
environment's Workers Builds project. Every environment with a key sends from
the same `EMAIL_FROM` constant.

Set the secret with `wrangler secret put RESEND_API_KEY --env <env>` if your
token has `Workers Scripts:Edit`. If CLI secret writes are denied, add it in
the Cloudflare dashboard instead: Workers & Pages → the project → Settings →
Variables and Secrets → Add, **Type: Secret (encrypted)** — not a
plaintext var, which `wrangler.jsonc` overwrites on the next build. A
dashboard-set encrypted secret survives subsequent Workers Builds deploys.

**Runbook: provisioning staging's key (issue #70).** No agent runs `wrangler
secret put` in this repo, so this step is manual, via the dashboard:

1. Workers & Pages → `dreamport-staging` → Settings → Variables and Secrets →
   Add.
2. Name: `RESEND_API_KEY`. Type: **Secret (encrypted)** — not a plaintext
   var. Value: a real Resend API key.
3. Save. The secret takes effect on the next deploy to `dreamport-staging`
   (the running staging host and every preview version); no code change is
   needed to pick it up, since sender selection is already keyed on the
   secret's presence (issue #66).
4. Confirm with `npm run verify:staging -- --latest` (or `-- <preview-url>`
   for an exact version — `verify:staging` always needs one or the other,
   there is no bare default). Its **Version bindings** check
   now asserts `RESEND_API_KEY` presence on staging the same way it always
   has for production, and stays red until the dashboard secret above lands.
   (The **Live smoke test** check doesn't inspect `RESEND_API_KEY` at all —
   it hits the Turnstile-gated send-OTP endpoint, and expects 200 on staging
   whether the sender behind it is real or mock, so it passes either way and
   proves nothing about the key on its own.) **Version bindings** also
   asserts `TEST_LOGIN_ENABLED`'s value per environment — `"true"` on
   staging, absent on production — so a future `wrangler.jsonc` edit that
   widens the fixed-test-code sign-in bypass (`src/worker/auth.ts`'s
   `buildTestLoginOTP`) onto production fails `verify:production` instead of
   going unnoticed.
5. For the strongest available confirmation that a send actually goes
   through Resend, not just that the key is bound: `npm run test:e2e --
staging` runs `deployment-smoke.spec.ts` against the long-lived staging
   host (`scripts/e2e.sh`, issue #70) — it drives a real browser through the
   Turnstile widget and Better Auth, which calls `ResendEmailSender` with the
   real key. It can't confirm delivery to a real inbox (see that spec's
   header comment for exactly what it does and doesn't prove) — for that,
   sign in by hand with your own address.

### Production refuses mock email

The send-OTP path (`POST /api/auth/email-otp/send-verification-otp`) returns
`503` on the production host `dreamport.ianjmacintosh.com` whenever
`RESEND_API_KEY` is absent (`src/worker/index.ts`, issue #41). The mock
sender delivers nothing, so this makes a key-less production **fail closed**
— sign-in is unavailable and visibly broken — instead of failing open, taking
sign-ins and dropping every code.

Production now has a real key (issue #38), so the guard passes in normal
operation. It stays as a backstop: if a dashboard override or a bad rollback
removes the secret, sign-in fails closed rather than silently swallowing
codes. Removing the secret is a one-step rollback that needs no code change —
but on this host it returns sign-in to this fail-closed 503, it does **not**
restore a working mock login.

The guard is keyed on the exact request `Host`, so staging, the
`*-dreamport-staging` preview URLs, and local dev — none of which currently
carry a key — keep running the mock sender unaffected.
`scripts/verify-deployment.sh` also fails the **Version bindings** check on a
`verify:production` run while the deployed production version has no
`RESEND_API_KEY` secret bound — the detective backstop for a dashboard
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
- **Hostname/action check** — not a var at all since #69: the gate checks the
  verified token's `hostname` against `CURRENT_ENVIRONMENT_HOSTS`
  (`src/worker/trusted-origins.ts`, the same per-environment list
  `TRUSTED_ORIGINS`/`ALLOWED_HOSTS` resolve from, #68) and its `action`
  against `send-otp` — but only when `IS_PRODUCTION_ENVIRONMENT` is true
  (this build's `CLOUDFLARE_ENV` is `production`). Staging and local stay
  lenient (`success` check only) regardless of how many hosts their own list
  carries, since only production runs the real widget — see below.

`dreamport` and `dreamport-staging` are separate projects with separate
secret stores, so their keys are set independently:

|                                                              | `dreamport` (prod)                 | `dreamport-staging`                                         |
| ------------------------------------------------------------ | ---------------------------------- | ----------------------------------------------------------- |
| `VITE_TURNSTILE_SITE_KEY` (build, from `vite.config.ts` map) | `0x4AAAAAAEqY4wvljJsO_dJb`         | `1x00000000000000000000AA`                                  |
| `TURNSTILE_SECRET_KEY` (runtime)                             | real secret, `wrangler secret put` | `1x0000000000000000000000000000000AA` (in `wrangler.jsonc`) |
| Hostname/action check                                        | strict (production hosts only)     | lenient (`success` check only)                              |

The production widget is scoped to `ianjmacintosh.com` (Turnstile authorizes
a hostname and all its subdomains, so `dreamport.ianjmacintosh.com` is
covered; the gate still pins the exact host, which is tighter). Staging
currently runs Cloudflare's always-pass test pair instead, whose `siteverify`
response doesn't carry a stable `hostname`/`action`, so the gate stays
lenient there. The test secret still exercises the real `siteverify` HTTPS
call, it just always answers success.

**Correction (2026-09-17):** this section previously claimed a widget
"can't be created" without a real `workers.dev` hostname and that a real
widget "simply won't render" on staging. That was an uncited, unverified
assumption — checked against Cloudflare's own Turnstile documentation
(`docs/research-turnstile-domain-requirements.md`) and found false. The
Domains field is a declarative, format-checked FQDN list, not a
zone-ownership check (Cloudflare's own API examples list a bare IP and an
arbitrary third-party domain as valid entries; `localhost` is explicitly
documented as usable with real keys). Nothing in Cloudflare's docs mentions
`workers.dev` at all, in either direction. A real widget scoped to
`dreamport-staging.bananasquad.workers.dev` specifically is achievable — the
Domains field just doesn't support wildcards, so it can't also cover the
ever-changing per-branch preview hosts, and free tier caps the field at 10
domains. Tracked as a real (not-yet-decided) follow-up in a separate issue,
not implemented by this correction.

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

| Setting                                   | `dreamport` (production)                                                | `dreamport-staging` (staging)                                     |
| ----------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Build command                             | `npm run migrate:production && CLOUDFLARE_ENV=production npm run build` | `npm run migrate:staging && CLOUDFLARE_ENV=staging npm run build` |
| Production branch                         | `main`                                                                  | (never pushed to)                                                 |
| Deploy command (production-branch pushes) | `npx wrangler deploy`                                                   | `npx wrangler deploy`                                             |
| Version command (other branches)          | _(disabled)_                                                            | `npx wrangler versions upload`                                    |

Migrations run as the first step of the Build command itself, before
`vite build` even starts (see [Migrations](#migrations)) — so neither a
deploy nor a preview ever runs code against a schema that isn't there yet
(issue #47).

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

`dev` has no Workers Builds project (see [Environments](#environments)), so
`npm run migrate:dev` stays a manual step whenever `dreamport-dev` needs a
schema change. Staging and production don't — see below.

### Order relative to a deploy (issue #47)

Migrations are additive and go out **before** the code that depends on the
new schema, so deployed code never reads a column that doesn't exist yet.
For staging and production, this ordering is enforced by the Build command
itself (see [Deploying](#deploying)) rather than a manual step someone has
to remember: `npm run migrate:<env>` runs first, and only if it succeeds
does `vite build`/the actual deploy proceed. Merge the migration and the
code that depends on it together, in one PR to `main` — the next build of
each project (staging: any branch push; production: the `main` merge
itself) picks up whatever's pending and applies it before that build's own
code goes live.

This replaced an earlier manual-only process (`npm run migrate:staging`/
`migrate:production` run by hand before letting a deploy through) after it
silently failed twice: issue #24's rate limiter 500'd the entire staging
auth API for a window because its migration wasn't applied before the
branch preview deployed, and Products v1 (#88) shipped to both staging and
production without anyone running its migration at all, undetected simply
because nothing was reading from the new table's absence until this was
written. `npm run migrate:staging`/`migrate:production` still exist as
plain scripts — useful to apply something ahead of a build on purpose, or
to check with `list` — but they're no longer a required manual step in the
normal flow.

Only additive migrations are safe to run this way, ahead of and separate
from the code deploy — see `migrations/README.md`. A future destructive
migration still needs its own expand/contract sequence; this mechanism
doesn't change that.

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
- **`RESEND_API_KEY`** — required on `dreamport` (production, issue #38): its
  presence is what picks the real `ResendEmailSender` over the mock one
  (`createEmailSender`, issue #66); the production fail-closed guard 503s
  sign-in without it. Set it via `wrangler secret put` or, if CLI secret
  writes are denied, as an encrypted dashboard secret — see [Sign-in
  email](#sign-in-email). Not currently set on `dreamport-staging` or
  dev/local — they stay on the mock sender (issue #70 tracks provisioning
  staging's). There is no `EMAIL_FROM` secret or var — the `From:` address is
  the `EMAIL_FROM` constant in `src/worker/email/sender.ts`.
- **`TURNSTILE_SECRET_KEY`** — required now (#23). The send-OTP path verifies
  the Turnstile widget token against Cloudflare `siteverify` before issuing a
  code, and **fails closed** (503, no code sent) when this is unset.
  Production uses the real widget's secret, set with
  `wrangler secret put TURNSTILE_SECRET_KEY --name dreamport` (never the
  dashboard runtime-var panel — that value is wiped by the next `wrangler
deploy`). Staging uses Cloudflare's always-pass test secret
  `1x0000000000000000000000000000000AA`, which is a public value and so lives
  in `wrangler.jsonc` (`env.staging.vars`) rather than as a secret. The public
  `VITE_TURNSTILE_SITE_KEY` (from the `vite.config.ts` map) and the
  hostname/action check are covered in
  [Turnstile](#turnstile-bot-check-on-the-send-otp-path).

Because production and staging are separate Worker scripts, the same secret
name can (and for `RESEND_API_KEY`, generally should) hold different values
in each.

For local `npm run dev`, put `BETTER_AUTH_SECRET` in a `.dev.vars` file
(gitignored; see [`.dev.vars.example`](../.dev.vars.example)).
