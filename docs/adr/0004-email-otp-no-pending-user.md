# Email-OTP sign-in creates the User at verify, and there is no "pending User"

The auth spec (#18) and ticket #21 describe sending a code to an unknown
address as "quietly creating a pending User", and the never-verified reaper
(#27) is specified to "hard-delete Users that have never verified a code, 7
days after they were created". Building #21 against the pinned
`better-auth@1.7.2` showed that its `emailOTP` plugin does not work that way.

- **Send** (`/api/auth/email-otp/send-verification-otp`) never touches the
  `user` table. It writes a row to `verification` (the code, 60-minute
  expiry) and calls the sender. Known and unknown addresses take the same
  path and get the same `{ success: true }` response — the enumeration-safety
  property the spec wants.
- **Verify** (`/api/auth/sign-in/email-otp`) checks the code first
  (verify-before-lookup, PR #10605), then looks the User up. If there is no
  User, it creates one **with `emailVerified: true`** and issues a session in
  the same call.

So a `user` row only ever exists once someone has proven control of the
inbox, and it is verified from the moment it exists. There is no interval in
which an unverified `user` row sits waiting.

## Decision

Use the plugin's behaviour as-is. Do not add code to force a pending
(`emailVerified: false`) `user` row into existence at send time.

## Considered Options

- **Manufacture a pending User at send time** (what the spec's wording
  implies). Rejected: it is bespoke, security-sensitive code that re-widens
  the send endpoint's enumeration surface (an attacker can grow the `user`
  table by naming addresses), fights the library, and buys nothing the
  `verification` row + its 60-minute expiry doesn't already give us.
- **Accept the library behaviour.** Chosen. Consistent with ADR-0002 (keep
  the auth code we own small).

## Consequences

- #21's acceptance criterion "verifying an unknown email creates a pending
  User" is met as "after a successful verify, a `user` row exists that did
  not exist before, and a session cookie was issued". The Seam 1 test asserts
  exactly that.
- **#27's never-verified reaper has nothing to reap in this flow.** No
  unverified `user` rows are produced by OTP sign-in. When #27 is built it
  should either drop that reaper (keeping only the expired-session reaper) or
  retarget it at abandoned `verification` rows. Better Auth's
  `findVerificationValue` already deletes expired `verification` rows
  opportunistically, so even that may be unnecessary.
- If a future sign-in method (e.g. an invite flow) does create unverified
  `user` rows, the reaper question comes back on its own terms.
