# Email delivery decided by `RESEND_API_KEY` presence, not a separate `EMAIL_MODE` flag (#63)

#63 was promoted to a blocker of #14 because staging's fidelity gap — every
non-production environment running `EMAIL_MODE=mock` — let a
production-breaking bug ship undetected (#39's hotfix, `09b6eb1`). #63
bundled two problems: no isolation between PR-preview and persistent-staging
D1 usage, and no facsimile-of-production for email. **This ADR resolves the
facsimile half only.**

**Isolation is deprioritized, deliberately.** #63's own rationale for
promotion to blocker was fidelity — staging passing while prod fails — not
collision risk between concurrent runs; the contribution flow is one-at-a-time
in practice, so collisions are accepted as a live but low-priority risk.
Narrowing to fidelity is consistent with why #63 was ever promoted, not a
retreat from the other half.

## Decision

**Retire `EMAIL_MODE`.** `createEmailSender` picks the real `ResendEmailSender`
when `RESEND_API_KEY` is present, and `MockEmailSender` when it's absent —
one fact instead of two knobs that could disagree. The mock path's
observability is unchanged from #41 / the AGENTS.md logging rule: it records
that a send was attempted (recipient, type) and never the OTP value itself,
independent of what triggers the mock path (today `EMAIL_MODE`, going
forward key-absence).

**Staging now holds a real `RESEND_API_KEY`.** Manual testing against the
deployed staging host draws real Resend quota, deliberately, so a human can
exercise the actual send path there.

**Automated tests stub the network call, not the sender.** Vitest and
Playwright (which only ever drives a local worker, never a deployed host —
see `docs/deployment.md`) use `@msw/cloudflare` (requires `msw >= 2.14`) to
intercept the outbound `fetch` to Resend's API. This exercises the real
`ResendEmailSender` code path — request construction, response parsing,
error handling — that `mock` never touched, at zero quota cost and with no
real key required.

~~**A real-send smoke test gates the production deploy**, once per deploy
rather than per PR — satisfies "at least once before shipping" at a cost
Resend's quota can absorb (well under the 100/day, 3000/month free tier).~~
**Reversed — see the #67 amendment below.**

**Production's fail-closed 503 guard on the send-OTP path is re-keyed**, from
`EMAIL_MODE !== "resend"` to `RESEND_API_KEY` absent, on the exact
production host. Same protective purpose — catch a bad rollback or dashboard
override silently degrading production to a no-op sender — cheaper check.
`scripts/verify-deployment.sh`'s external "Version bindings" check follows
the same move, checking `RESEND_API_KEY` is bound (`type=="secret_text"`) the
same presence-only way it already checks `BETTER_AUTH_SECRET`, never reading
either value.

**`TEST_LOGIN_ENABLED` becomes a fully independent lever**, no longer
conditioned on email mode at all. `buildTestLoginOTP`'s guard drops its
`EMAIL_MODE !== "resend"` clause (ADR-0009) entirely; `TEST_LOGIN_ENABLED`
alone decides whether the fixed-code marker path is live. It flips to `true`
on staging (previously `local`/`dev` only) and stays `false` on production.
This is a deliberate loosening: staging deliberately carries a real key now,
which is exactly the "dev server pointed at a real key" scenario ADR-0009's
dropped clause used to guard against — except it's the intended design here,
not an accident, so the guard no longer needs to defend against it.

## Considered Options

- **Keep `EMAIL_MODE` alongside a real-send check.** Rejected: once every
  environment either has a real key (and wants real sends) or doesn't (and
  doesn't), `EMAIL_MODE` and `RESEND_API_KEY` describe the same fact twice —
  removing one closes the only way they could drift apart.
- **Real sends everywhere, full parity.** Rejected — confirmed against
  Resend's own docs that even the `delivered@resend.dev` test sink counts
  against the account's send quota, and no sandbox/test-mode API key exists.
  Every CI run and PR preview drawing on the same account-wide quota
  (ADR-0007's threat model) would starve production.
- **MSW as the sole real-send verification.** Rejected as a replacement —
  the request never leaves the process, so it can't prove the real endpoint,
  auth, and payload shape actually work. Kept as a complement to the
  production-deploy smoke test, not a substitute for it.
- **Smoke test on every PR/staging push.** Rejected — same account-wide
  quota exposure as "real sends everywhere," just less frequent. Gating the
  production deploy specifically matches the actual requirement at far lower
  cost.

## Consequences

- **Staging's `RESEND_API_KEY` is a credential-provisioning step, not a code
  change.** Same category as #38's production key: it goes in via the
  Cloudflare dashboard as an encrypted secret, not `wrangler secret put` (no
  CLI secret writes — see `docs/deployment.md`). Whichever ticket carries
  this must be scoped as a human-gated runbook step, not folded into a PR
  that silently assumes the key already exists.
- Interactive local `npm run dev` with no key falls back to mock
  automatically (a log line records the attempt, never the code). No MSW
  coverage exists for this path — neither MSW's nor Cloudflare's own docs
  address intercepting `fetch` under `wrangler dev`, only under
  `@cloudflare/vitest-pool-workers`. This is an open gap, not a decision;
  revisit if a live-dev-session equivalent becomes available upstream.
- Staging's real key draws on the same Resend account-level quota as
  production. ADR-0007's per-environment daily cap bounds each
  independently, but both still share one underlying account ceiling —
  worth remembering if staging's cap is ever raised.
- `buildTestLoginOTP`'s implementation needs updating alongside this: its
  guard condition changes from checking `EMAIL_MODE` to dropping that clause
  entirely (see Decision above) — not just a docs change.

## Amended: the production-deploy smoke test (#67) is canceled

#67 (the smoke test decided above) was implemented in PR #73 and then
canceled before merging, for three compounding reasons surfaced in review:

1. **Turnstile makes the actual goal unreachable.** The send-OTP path
   requires passing a real Turnstile challenge in production. No automated
   deploy-time script can do that — Turnstile exists specifically to block
   scripted verification — so this could never prove "a real user can
   complete the login flow," only a narrower slice of it.
2. **The implementation didn't even test our own code.** PR #73's script
   posted directly to Resend's API via `curl`, never invoking our
   `ResendEmailSender`. Even setting aside (1), it would only ever have
   proven Resend's uptime with our key, not that our own integration code
   works — closer to monitoring another organization's service than testing
   ours.
3. **The premise doesn't survive contact with the incident that motivated
   it.** #39, the incident #63 traces back to, was a build-mode divergence
   in OTP generation (`import.meta.env.DEV`), never a Resend-send-path bug.
   A send-path smoke test — even a correctly-implemented one, even without
   the Turnstile wall — would never have caught it.

No replacement mechanism is adopted. What remains from this ADR's original
"at least once before shipping" goal: staging's real key (#70) gives a human
a way to exercise the real send path manually, and the fail-closed 503 guard
still catches a missing key at request time — neither is gated to run
automatically before every production deploy, and that gap is accepted
rather than closed.

## Related

- [#63](https://github.com/ianjmacintosh/dreamport/issues/63) — the issue
  this ADR resolves (fidelity half; isolation half deprioritized above)
- [#39](https://github.com/ianjmacintosh/dreamport/issues/39) /
  [#41](https://github.com/ianjmacintosh/dreamport/issues/41) — the
  incident and the logging rule this ADR's mock-path observability preserves
  unchanged
- `docs/adr/0007-send-otp-rate-limiting.md` — the Resend-quota threat model
  this ADR's smoke-test cadence and staging-key decision both respect
- `docs/adr/0009-otp-hashed-session-tokens-accepted.md` — introduced
  `TEST_LOGIN_ENABLED` and the `EMAIL_MODE`-conditioned guard this ADR
  simplifies into an independent lever
- `docs/deployment.md` — full environment matrix, updated alongside this
  decision
