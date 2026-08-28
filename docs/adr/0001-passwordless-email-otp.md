# Passwordless email OTP instead of passwords

Issue #14 ("Signup / Login / Reset Password") implied password authentication,
and a working homegrown reference existed in `ianjmacintosh/pillbug`. We chose
**passwordless email one-time codes** (Better Auth's `emailOTP` plugin, 6
digits, 60-minute expiry, 3 attempts) with no password stored anywhere. This
mirrors pillbug's own ADR-0001: it removes password hashing (a KDF running in a
CPU-limited Cloudflare Worker), password-strength UI, and the entire
reset-password flow — so "Reset Password" from issue #14 no longer exists, and
"Signup" and "Login" collapse into one "enter your email, enter the code"
route.

## Considered Options

- **Email + password** (what #14 literally said). Rejected: adds password
  storage and hashing, breach exposure of hashes, and a reset flow, for a tool
  where every user already has a reachable inbox.
- **Password primary with OTP fallback.** Rejected: two code paths and two
  threat models to build and test for no clear benefit at this scale.

## Consequences

- Login now has a hard dependency on email delivery (Resend). An email outage
  blocks all sign-ins.
- Anti-enumeration and anti-abuse move to the code-send endpoint: it always
  succeeds (auto-registering unknown emails, `disableSignUp: false`), guarded
  by Turnstile, per-IP and per-email rate limits, and a cron that reaps
  never-verified accounts.
- Adding Google sign-in later is still open; Better Auth's schema carries an
  `account` table that supports it without a painful migration.
- A convenience "auto-submit" link that carries the code in a query string was
  deliberately left out of v1 (mail-scanner pre-fetch consumes the code;
  referrer/history/log leakage) and can be added later with those mitigations.
