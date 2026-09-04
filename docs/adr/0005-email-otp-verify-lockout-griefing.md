# The email-OTP verify endpoint is open to targeted lockout griefing, and #33 ships without a fix

Building the verify flow for #21 surfaced an abuse vector in
`better-auth@1.7.2`'s `emailOTP` plugin that neither the plugin nor this PR
closes. It is recorded here so it is a known, accepted state rather than an
oversight, and so a later ticket picks it up deliberately.

## The vector

The pending code lives in one `verification` row keyed only by
`toOTPIdentifier(type, email)` — `sign-in-otp-<email>`. There is no secret
in that key: anyone who knows a target's address can address their row.

- **Send** deletes any existing row for the identifier and writes a new one,
  so there is exactly one active code per address at a time.
- **Verify** on a wrong code increments an attempts counter; once it reaches
  `allowedAttempts` (our config: 3) the row is deleted and the identifier is
  locked out until a new code is requested. `atomicVerifyOTP` in the plugin
  comments this directly: _"a record whose attempts are exhausted is left
  consumed (no recreate), locking the identifier out."_

So an unauthenticated caller who submits `{ email: <victim>, otp: <junk>,
type: "sign-in" }` three times destroys the victim's pending code. The
victim's real code then fails as `INVALID_OTP`. Repeat on each fresh code and
the victim cannot sign in for as long as the attacker keeps going. No account
takeover — the attacker never authenticates — but a targeted user is denied
login for the cost of three HTTP requests per cycle. This is _griefing_
(a.k.a. an OTP / account-lockout denial of service): degrading another
user's service without gaining access.

## Decision

Ship #33 without a mitigation, and accept the risk for now. Document it (this
ADR) and note it on the PR.

## Considered Options

- **Better Auth's built-in rate limiter with `storage: "database"` + a
  custom `3 req / 10s` rule on `/sign-in/email-otp`.** The library's own
  answer (it already ships that rule for `/sign-in/email` and
  `/two-factor/verify`, just not for email-OTP). Not done here: it needs the
  `rateLimit` table migration and rate-limit config that ADR-0002 defers,
  and #21 does not mention rate limiting. More to the point it only raises
  the cost — the limiter keys on IP, so an attacker rotating IPs still gets
  through. Mitigation, not a fix.
- **Stop deleting the row on exhausted attempts; apply a short cooldown
  instead.** This is upstream plugin behaviour; changing it means forking or
  patching `better-auth`, against ADR-0002's "keep the auth code we own
  small".
- **A per-identifier lock separate from `allowedAttempts`** (e.g. refuse
  verifies for N seconds after a burst, without consuming the code).
  Bespoke security-sensitive code; deferred until there is a ticket for it.
- **Accept and document.** Chosen. There is no path that both closes the
  hole and fits #33's scope, and the realistic mitigations are partial.

## Consequences

- The vector is live in every deployed environment once real users exist.
  Today the blast radius is small (no real email delivery yet — see
  ADR-0004's flow notes and #33's `resend` follow-up), which is part of why
  accepting it now is tolerable.
- ADR-0001 already lists "per-IP and per-email rate limits" and a Turnstile
  challenge on the send path as the anti-abuse story. None of that is built
  yet. Whichever ticket builds it should also add the verify-path rule above
  and revisit this ADR — a `3 req / 10s` per-IP-and-identifier rule plus
  Turnstile on send is the practical ceiling short of forking the plugin.
- If a future `better-auth` bump changes the exhausted-attempts behaviour
  (cooldown instead of delete), this ADR can be retired.
