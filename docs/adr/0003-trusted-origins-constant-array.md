# `trustedOrigins` is a constant array, not a function

The auth spec (#18, **Trusted origins**) says `trustedOrigins` should be
"a function, not a static list", so the open-ended set of branch-preview
origins could be computed rather than enumerated. Building #20 showed the
function buys nothing: we chose a **plain constant array with a single preview
wildcard entry**, passed straight to `betterAuth({ trustedOrigins })`.

Better Auth globs each list entry against the request origin
(`matchesOriginPattern` → `wildcardMatch`; `*` matches any character except
`/`), so one `https://*-dreamport.bananasquad.workers.dev` entry already covers
every unlisted preview host. The function form in the first draft of #20 just
returned that same fixed list — indirection with no per-request logic behind
it, and a non-verb name (`trustedOrigins`) forced by matching Better Auth's
config key.

## Considered Options

- **A function returning the list** (what #18 specified). Rejected: no
  per-request input is used, so it is a wrapper around a constant. Keep this
  only if per-tenant origins or a DB-backed allowlist ever need the `request`
  argument Better Auth passes.
- **A function that echoes the caller's origin.** Rejected during #20: it
  makes `callbackURL` / CSRF checks trust whatever they are handed.

## Consequences

- `src/worker/trusted-origins.ts` is just the `TRUSTED_ORIGINS` array with a
  comment on each entry — no separate named constants. Its unit test guards
  only the wildcard's safety contract (scoped to this account, never a bare
  `*` or platform-wide `*.workers.dev`); the accept/reject behaviour is
  covered end-to-end in `src/worker/index.worker.test.ts`.
- The preview wildcard is `https://*-dreamport.bananasquad.workers.dev`, not
  `https://*.workers.dev` — scoped to this account's `bananasquad` subdomain,
  so an unrelated Workers host cannot pass the origin / `callbackURL` check.
- #18 also listed a staging origin (`staging.dreamport.ianjmacintosh.com`).
  That host does not exist and is not planned — "staging" is whichever branch
  preview shares the `dreamport-stage` DB — so it is not in the list; the
  preview wildcard covers it.
- If a future auth method needs origins computed per request, this reverts to
  the function form — Better Auth accepts either, so it is a local change to
  this one module.
