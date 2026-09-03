# Better Auth instead of porting pillbug's homegrown auth

A working, well-tested homegrown auth system already exists in
`ianjmacintosh/pillbug` (~955 LOC of Worker auth + ~2,325 LOC of tests, on the
same Workers + D1 stack), so adopting a third-party library is not the obvious
choice. We chose **Better Auth** anyway, wired by hand to D1 via Kysely +
`kysely-d1` through a per-request `createAuth(env)` factory, with rate-limit
state in D1. Auth here is foundation-laying — every future feature assumes a
User, and Google sign-in / passkeys / "log out everywhere" are likely — and
Better Auth makes those configuration flags where a pillbug port would make
each one a from-scratch project. A port would also carry ~11 known gaps
(no login rate-limiting, no session rotation, no server-side input validation,
a dropped `ON DELETE CASCADE`, crypto logic triplicated across three files)
that would become ours to fix.

## Considered Options

- **Port pillbug's code.** Rejected: the maintenance burden and known gaps
  above, plus every future auth method is greenfield. Its virtue — the whole
  auth system is readable in one sitting — is partly preserved by hand-wiring
  Better Auth rather than layering `better-auth-cloudflare` on top, which keeps
  the code we own and audit to a ~40-line factory.
- **Fresh homegrown.** Rejected: new bespoke security-sensitive code without
  pillbug's test suite.

## Consequences

- Better Auth's schema (`user`, `session`, `account`, `verification`,
  `rateLimit`) lives in our D1. Its generated SQL is committed as numbered
  `migrations/*.sql` and reviewed like any other schema change.
- Requires the `nodejs_compat` Worker flag (`AsyncLocalStorage`).
- D1 has no transactions and Better Auth expects them; multi-statement
  operations can partially apply. Cloudflare KV was rejected for rate-limit
  state because its 60-second minimum TTL conflicts with Better Auth's
  ~10-second internal TTLs.
- We are exposed to Better Auth's own bugs — e.g. the `emailOTP` user
  enumeration issues — so the version is pinned exactly (no `^`) in
  `package.json`. The current pin is **`better-auth@1.7.2`**, which is well
  past `1.6.26` where the verify-before-lookup fix (better-auth PR #10605)
  first shipped. Any bump must be checked to still include that fix before
  the `^`-less pin is moved.
- Two ideas are borrowed from pillbug rather than its code: a cron that
  hard-deletes never-verified accounts, and a cron that reaps expired session
  rows (Better Auth does neither).
