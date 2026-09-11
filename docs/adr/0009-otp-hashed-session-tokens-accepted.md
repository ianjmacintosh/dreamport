# Auth: OTP codes get hashed at rest; session tokens stay plaintext, accepted (#39)

Two credentials sit in D1 as plaintext, unhashed columns: `verification.value`
(the pending email-OTP code — `emailOTP()` in `src/worker/auth.ts` doesn't set
`storeOTP`, so Better Auth defaults to `"plain"`) and `session.token` (the
literal bearer value the session cookie carries — no hash column, nothing
derived from `BETTER_AUTH_SECRET`). Read access to D1 (SQL injection, a leaked
backup/export, an over-scoped API token, an insider) is account takeover for
both, not just data exposure — see #39 for the full framing and blast-radius
reasoning, which this ADR does not repeat.

## Decision

1. **`storeOTP: "hashed"`** for the `verification` table — a one-line change
   to the existing `emailOTP({...})` config in `src/worker/auth.ts`.
2. **Session tokens: accept and document.** No code change to how
   `session.token` is stored.
3. **A `generateOTP` hook** returns a fixed test code for a reserved
   test-email marker, stripped from every deployed bundle at build time, so
   E2E tests can sign in without a real inbox — without weakening how OTPs
   are stored for real users.
4. **D1-side access hardening** (scoping, audit logging) is a complementary,
   not-yet-built mitigation, tracked separately as
   [#56](https://github.com/ianjmacintosh/dreamport/issues/56).

## Considered Options — OTP storage

- **`storeOTP: "hashed"` (chosen).** SHA-256 digest, base64url-encoded,
  compare-only — Better Auth's `defaultKeyHasher`. Matches OWASP's
  Multifactor Authentication Cheat Sheet, which has a section built for
  exactly this object (short-lived, single-use, server-issued code):
  hashing is the prescribed control, long-term plaintext storage is an
  explicitly prohibited practice, and encryption is never offered as an
  alternative. OWASP ASVS 2.6.2 and NIST SP 800-63B §5.1.2.2 ("look-up
  secrets," the closest formal category to an emailed OTP) mandate one-way
  hashing the same way memorized secrets are hashed. Dreamport doesn't use
  Better Auth's OTP-reuse/resend feature (`tryReuseOTP`) anywhere, so
  nothing needs the plaintext code recovered later for a legitimate
  production reason.
- **`storeOTP: "encrypted"` (rejected).** Reversible XChaCha20-Poly1305,
  keyed off `BETTER_AUTH_SECRET`. Initially the frontrunner, specifically to
  let a script decrypt a stored OTP for staging E2E testing without a real
  inbox — but background research against primary sources found no vendor
  or standard sanctioning this trade. Clerk, Auth0, WorkOS, and Okta all
  solve "sign in during tests without a real inbox" with an
  environment-gated _side channel_ (a fixed code on a reserved test
  identifier, a separate tenant/mail-trap, audited impersonation) that never
  touches the production credential-storage format. NIST's only
  reversibility carve-out (§5.1.4.2) is scoped to TOTP-device shared
  secrets — a structurally different object from a single-use emailed code,
  and doesn't extend to "we need it back for tooling." The blast-radius
  delta is the deciding fact: if `BETTER_AUTH_SECRET` leaks, `"encrypted"`
  turns into bulk, instant, lossless recovery of every pending OTP across
  every user; `"hashed"` stays non-recoverable in bulk regardless of that
  secret, and even a per-code offline brute-force (feasible given the
  6-digit keyspace) still requires direct D1 read access on its own merits
  and yields one code at a time, each already bounded by a 60-minute TTL.
- **Status quo (`"plain"`, implicit default) — rejected.** This is the exact
  risk #39 raises.

## The test-login mechanism

The actual need behind the `"encrypted"` detour — signing in during E2E
tests without a real inbox — turned out to have a first-class seam already:
`emailOTP`'s `generateOTP` option
(`node_modules/better-auth/dist/plugins/email-otp/routes.mjs`, called as
`generateOTP({ email, type }, ctx)` for every OTP type — sign-in,
email-verification, forget-password, change-email). A falsy return falls
through to the normal random generator; whatever it does return still flows
through the same `storeOTP`/`verifyStoredOTP` path as any other code, so a
test code is hashed at rest exactly like a real one and exercises the real
send → store → verify round trip end to end. No bypass, no second
storage format.

Implementation: `generateOTP` returns the fixed code `"000000"` when the
email's local part contains the marker `+e2e-test@` **and**
`env.EMAIL_MODE !== "resend"` — but the whole hook is also wrapped in
`import.meta.env.DEV`, the same build-time flag that gates the
`/api/test/last-delete-link` test hook (and gated the old `/api/test/last-otp`
hook, now removed — every login spec moved to this fixed-code marker
instead). That third gate is load-bearing, not redundant: `wrangler.jsonc`
sets
`EMAIL_MODE: "mock"` for `staging` too (only `production` runs `resend`),
and `staging` is `workers_dev: true` — a publicly reachable `*.workers.dev`
URL. `EMAIL_MODE !== "resend"` alone would have made the fixed code a live,
unauthenticated sign-in for any `+e2e-test@` address on that public
deployment. `import.meta.env.DEV` is `true` only under `vite dev` (local
`npm run dev`, the Playwright webServer) and the vitest pool; `vite build`
replaces it with `false`, so `generateOTP` compiles out of every deployed
bundle — staging included — regardless of `EMAIL_MODE`. The `EMAIL_MODE`
check stays too, as defense in depth for a `vite dev` server someone points
at a real `RESEND_API_KEY`. It applies to all four OTP types, not just
sign-in, so E2E coverage isn't limited to the login flow alone.

## Considered Options — session tokens

- **Accept and document (chosen).** Confirmed against the installed
  `better-auth@1.7.2` source: `session.token` is generated unconditionally
  (`generateId(32)`, no options object, no `storeToken`/`hashToken`
  equivalent anywhere in `better-auth` or `@better-auth/core`). The one
  mechanism that touches the write side, `databaseHooks.session.create.before`,
  has no matching read-side hook — `findSession` does a raw
  `WHERE token = ?` lookup straight from the cookie value, so hashing at
  rest would require monkey-patching the internal adapter's `findSession`
  across every call site (at least two already: `session.mjs:146` and
  `:399`), a risk that could silently break login on a future Better Auth
  bump with no public deprecation path — exactly the unowned-internals cost
  ADR-0002 avoided by not hand-rolling auth. Separately, primary-source
  research found no standard requiring this: OWASP's Session Management
  Cheat Sheet, ASVS V3, and NIST SP 800-63B §7 don't mandate hashing session
  identifiers in the primary store (the cheat sheet's only session-ID
  hashing instruction targets _log output_). Their concrete, checkable
  requirements — ≥64 bits of entropy, TLS + Secure/HttpOnly cookies,
  rotation on privilege change — are already true of dreamport's session
  cookie (`generateId(32)` clears the entropy bar by a wide margin;
  `useSecureCookies: true` in `auth.ts` covers transport).
- **Patch/wrap the internal adapter to hash tokens (rejected).**
  Medium-to-high effort: a `create.before` hook plus a hand-maintained shim
  over every `findSession` call site, including ones added by future
  Better Auth versions or plugins. Un-owned-internals risk, against
  ADR-0002.
- **Shorten session lifetime as a partial mitigation (considered, not
  taken now).** NIST SP 800-63B §7.2 caps how long a session may be
  extended on the secret alone, keyed to Authenticator Assurance Level —
  but this is a ceiling, not a floor: AAL1 (roughly where email-OTP sits)
  already permits up to 30 days, which is exactly dreamport's current
  `expiresIn`. There's no NIST violation to correct, so nothing changes
  here; shortening below that ceiling remains an available lever for a
  future revisit, not a requirement this ADR is acting on.

## Consequences

- D1 read access still permits session-token account takeover, unchanged
  from #39's framing: every currently-valid session sitting in the clear,
  which is every active user (not a narrow slice) once #38's real users
  exist. This residual risk is what #56 aims to narrow from the access
  side, and what a future Better Auth version bump could close from the
  storage side if a supported mechanism ever ships.
- OTP codes are no longer bulk-recoverable from a `BETTER_AUTH_SECRET`
  leak. An attacker with direct D1 read access could still brute-force an
  individual 6-digit OTP hash offline within its 60-minute TTL — a
  per-code, D1-read-access-dependent cost, not the bulk one `"encrypted"`
  would have carried.
- E2E tests can sign in through any `+e2e-test@` address without a real
  inbox, but only in a `vite dev` server or the vitest pool — the
  `import.meta.env.DEV` gate strips this out of every deployed bundle,
  staging included, not just production.
- D1-side access hardening (scoping, audit logging) is tracked separately
  as #56 and not implemented here.
- **Revisit trigger:** a Better Auth version bump that adds a supported
  session-token hash-at-rest toggle, or a real-world incident that changes
  today's risk tolerance for the accepted session-token exposure.

## Related

- [#39](https://github.com/ianjmacintosh/dreamport/issues/39) — the issue
  this ADR resolves
- [#56](https://github.com/ianjmacintosh/dreamport/issues/56) — D1-side
  access hardening, split off as a follow-up
- `docs/adr/0002-better-auth-over-homegrown.md` — why dreamport doesn't
  patch/fork Better Auth internals
- `docs/adr/0005-email-otp-verify-lockout-griefing.md` — same shape of
  accepted-risk-until-cutover reasoning, different vector
- [#38](https://github.com/ianjmacintosh/dreamport/issues/38) — the live
  email cutover that ended "no real users yet" as a mitigating factor for
  both this issue and ADR-0005
- [#41](https://github.com/ianjmacintosh/dreamport/issues/41) — the
  fail-closed `EMAIL_MODE` guard this ADR's test-login gate reuses
