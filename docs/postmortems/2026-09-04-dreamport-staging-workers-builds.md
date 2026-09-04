# Postmortem: dreamport-staging stuck for ~2h50m on Cloudflare Workers Builds

**Date:** 2026-09-04
**Impact:** `dreamport-staging` (the Workers Builds project every feature branch
deploys to) was non-functional the entire time — no branch preview could sign
a user in. No production impact; `dreamport` (production) was never touched.

## Summary

Splitting staging into its own Workers Builds project
([`da3d047`](https://github.com/ianjmacintosh/dreamport/commit/da3d047))
should have been a same-day change. It
took ~2h50m and stacked five independent failures, two of which were the same
underlying Cloudflare platform bug wearing different clothes:

1. `dreamport-staging`'s Build Variable panel silently stopped propagating
   `CLOUDFLARE_ENV` into the build process, no matter how many times it was
   re-saved or the Git integration reconnected.
2. Moving the value inline into the **Build command** field itself didn't
   help either — the dashboard displayed one command, but the build executed
   a different, stale one. Proof: two builds an hour and a half apart
   produced byte-identical script etags, and the raw build log showed the
   literal old debug command still running.
3. The only fix was deleting the Workers Builds project and recreating it
   from scratch — no field-level edit reached whatever was actually stuck.
4. The recreated project's workers.dev subdomain and Preview URLs were off by
   default, and `wrangler versions upload` doesn't turn them on.
5. The `dreamport-stage` D1 database had never had its migrations applied,
   so the one functional endpoint we could finally reach (`/api/auth/email-otp/send-verification-otp`)
   500'd with an empty body and nothing in `wrangler tail`.

## Timeline

All times UTC, 2026-09-04 unless noted.

| Time | Δ | Event |
|---|---|---|
| 18:05:35 | — | `da3d047` pushed — staging split into its own Workers Builds project. |
| 18:06:35 | +1m | First build/version (`2e7b979f`) establishes baseline. |
| 18:06 → 18:40 | ~34 min | Repeated `CLOUDFLARE_ENV` Build Variable delete/recreate cycles and Git integration disconnect/reconnect via the dashboard, chasing a missing D1 binding. |
| 18:40:37 | — | `4f9e6b1` — "verify dreamport-staging Git reconnect" |
| 18:44:30 | +3m53s | `080da4a` — "verify CLOUDFLARE_ENV build variable" |
| 18:45:58 | +1m28s | `2a3a407` — "dashboard appears stuck" |
| 18:55:19 | +9m21s | `0d13b89` — "fresh run (not a retry)" |
| 18:56:14 | +55s | Version `62dd2263` created — still no `env.DB` binding. **~51 min burned, unresolved.** |
| 18:56 → 20:31 | ~1h35m | Reproduced the correct build locally; moved `CLOUDFLARE_ENV=staging` directly into the dashboard's **Build command** field, bypassing the Variables panel entirely; confirmed the new setting in the dashboard. |
| 20:31:03 | — | `ca39822` pushed to test the fixed Build command. |
| 20:32:15 | +1m12s | Version `6ce5f11a` — a *real* build (full npm install/vite output visible) — but still no `DB` binding, and its script **etag was byte-identical** to `62dd2263`'s. |
| ~20:32 | — | Build log `07bb8260` pulled directly: dashboard showed `CLOUDFLARE_ENV=staging npm run build`; the log showed `printenv \| grep CLOUDFLARE_ENV; npm run build` — a stale command from hours earlier — actually executing. Proof the platform's stored config wasn't reaching the build at all. |
| — | — | Decided to delete and recreate `dreamport-staging` — no field-level dashboard fix remained untried. |
| ~20:42:18–20:42:46 | 28s | New project's auto-triggered first build (against `main`, whose `wrangler.jsonc` still has the pre-rename env names `prod`/`stage`) — failed as expected, harmless. |
| 20:45:48 | — | `e92e2e7` pushed to trigger the real test build on the feature branch. |
| 20:45:54–20:46:49 | 55s | **Build succeeded with `env.DB (dreamport-stage)` bound.** Platform bug confirmed fixed by recreation. Total time from first symptom: **~2h41m**. |
| ~20:47–20:48 | — | Found workers.dev subdomain / Preview URLs disabled by default on the new Worker (`enabled: false`) — not touched by `versions upload`. API write attempt blocked (token lacked `Workers Scripts:Edit`). |
| — | — | Manually toggled on in the dashboard; confirmed via API. |
| 20:50 → 20:52 | ~2 min | OTP endpoint returned empty-body `HTTP 500` with nothing in `wrangler tail` — several retests to rule out propagation timing. |
| 20:52:35 | — | `wrangler d1 migrations list` failed (`code: 7403`) — token lacked `D1:Edit`. |
| — | — | Token widened; `migrations list` then showed `0001_better_auth_core_schema.sql` pending on `dreamport-stage`. |
| — | — | `npm run migrate:staging` applied it (9 commands, 2.29ms). |
| ~20:55 | — | Retest: `HTTP 200 {"success":true}`. Working end to end. |

## Root causes

1. **Cloudflare platform bug** (unconfirmed with Cloudflare support, not yet
   filed): a Workers Builds project's stored build configuration — both the
   separate Build Variable and, later, the Build command field itself —
   stopped being read by the actual build process. Re-saving the value,
   disconnecting/reconnecting the Git integration, and triggering fresh
   builds via new commits did not fix it. Only deleting and recreating the
   project did.
2. **Undocumented platform defaults**: a newly created Worker's workers.dev
   subdomain and Preview URLs default to off, and `wrangler versions upload`
   — the only deploy path staging ever uses — does not enable them. This is
   normal, not a bug, but nothing flagged it as a required first-time step.
3. **Process gap**: `docs/deployment.md` documents that migrations must be
   applied per environment, but nothing forced that step to happen before
   the deploy pipeline was considered "done." It only surfaced as a
   confusing, silent 500.
4. **Under-scoped API token**: the working Cloudflare API token started
   without `D1:Edit`, costing one full round-trip (diagnose → ask user to
   widen scope → retry) it didn't need to cost.

## What would have fast-tracked this

### Diagnostic approach
- **Read the raw build log first, before editing any dashboard field.**
  Comparing the log's literal `Executing user build command:` line against
  the dashboard's current saved value is a ten-second, conclusive check. We
  didn't do this until the second obstacle; doing it for the first would
  have skipped straight to "this is a platform bug, not a config mistake."
- **Compare script etags across builds** (`wrangler versions view --json`).
  An identical etag after a "successful" rebuild is unambiguous proof
  Cloudflare reused a cached artifact regardless of what the build log
  claimed to do.
- **Once a saved dashboard field is proven to not reach the build even after
  a resave, stop editing fields.** Treat the whole project record as
  corrupted and go straight to delete-and-recreate rather than iterating
  field by field.

### Resource access
- **Provision the Cloudflare API token with every scope the job needs up
  front** (`Workers Scripts:Edit`, `D1:Edit`, plus whatever `Account:Read`
  is required) instead of widening it three separate times mid-session, each
  costing a full stall-and-round-trip.
- **Workers Builds project settings and build logs are not reachable via
  scoped API token** (`/accounts/.../builds/projects` returns an
  authentication error regardless of scope) — confirmed even after adding
  `D1:Edit`. Every build log in this investigation had to be manually copied
  from the dashboard by hand. If some permission does expose this, finding
  it once would pay off on every future Workers Builds incident, since it
  removes the human-relay step from the fastest diagnostic we have.
- Workers Builds project *configuration itself* (Build command, Variables,
  Git connection, delete/create) is dashboard-only regardless of token
  scope — that part will always need a human in the loop.

### Process changes
- **Escalate to Cloudflare support in parallel with self-service
  troubleshooting**, not only after exhausting it. "The dashboard appears
  stuck" was already a reasonable signal to open a ticket alongside
  continued debugging.
- **Run one comprehensive health check immediately after any project
  (re)creation**, instead of discovering each broken layer serially through
  live request failures. In one pass this should check: version bindings
  (`wrangler versions view --json`), subdomain/preview enabled (Workers
  subdomain API), pending migrations (`wrangler d1 migrations list`), and a
  live request against a real endpoint. This alone would have surfaced all
  five root causes in the first minute after recreation instead of across
  five separate rounds of trial and error.
- **Longer term**: none of the Workers Builds project config that broke here
  is version-controlled. It lives in a web UI with no diff and no audit
  trail, and turned out to have a bug where saved state silently didn't
  match executed state. Managing it declaratively (Terraform's Cloudflare
  provider, or a scripted API apply, if either actually covers Workers
  Builds project settings — unverified) would make drift visible and turn
  "recreate the project" into one command instead of a multi-screen manual
  dance.

## Follow-ups

- [ ] Update `docs/deployment.md`: Build command should be documented as the
      inline form (`CLOUDFLARE_ENV=staging npm run build` /
      `CLOUDFLARE_ENV=production npm run build`), not a separate Build
      Variable.
- [ ] Add a first-time-setup checklist to `docs/deployment.md` covering: enable
      workers.dev subdomain + Preview URLs, apply migrations, confirm
      required secrets — for any newly created or recreated Workers Builds
      project.
- [x] Write the one-shot post-setup health-check (bindings, subdomain,
      migrations, live request) referenced above — `scripts/verify-deployment.sh`,
      `npm run verify:staging` / `verify:production`, documented in `README.md`.
- [ ] File the platform-bug evidence with Cloudflare support (build `07bb8260`:
      dashboard-displayed vs. actually-executed Build command mismatch) even
      though the workaround (recreate) already shipped — worth a report so
      it doesn't recur on `dreamport` production if that project is ever
      recreated.
- [ ] Confirm whether any Cloudflare API token permission exposes Workers
      Builds project settings/build logs for read access.
