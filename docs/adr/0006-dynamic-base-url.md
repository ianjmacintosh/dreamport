# Better Auth's `baseURL` is a dynamic `allowedHosts` config, not a fixed string

`createAuth()` never set `baseURL`, so every request logged "Base URL is not
set... the origin is derived from the incoming request." Chasing that warning
turned up more than cosmetics: with no `baseURL`, Better Auth resolves one
per request by trusting _whatever Host the request itself claims to be
reaching_, and adds that derived origin to `trustedOrigins` on top of the
explicit list in `trusted-origins.ts`. In effect, the Worker always
self-trusted its own reflected Host, regardless of `TRUSTED_ORIGINS`.

We set `baseURL: { allowedHosts: ALLOWED_HOSTS }` — Better Auth 1.7.2's
"dynamic baseURL" config for multi-host deployments — rather than a fixed
string. `ALLOWED_HOSTS` (`trusted-origins.ts`, a sibling to `TRUSTED_ORIGINS`)
lists bare host patterns: prod's host, the `*-dreamport.bananasquad.workers.dev`
preview wildcard, and `localhost:*` for local dev's floating port. Better
Auth resolves the actual `baseURL` per request from whichever pattern the
Host matches; a Host matching none of them now fails instead of self-trusting.

## Considered Options

- **A fixed string** (`baseURL: "https://dreamport.ianjmacintosh.com"`).
  Rejected: there is no one fixed host to hard-code. `stage` gets a different
  `<hash>-dreamport.bananasquad.workers.dev` host on every deploy — the same
  reason `TRUSTED_ORIGINS` needed a wildcard entry (ADR-0003) — and `local`'s
  Vite port floats unless pinned.
- **Leave `baseURL` unset**, silence the warning some other way. Rejected once
  the mechanism was understood: the implicit self-trust is a real gap, not
  just log noise.

## Consequences

- A request whose Host matches nothing in `ALLOWED_HOSTS` now fails (500)
  rather than silently resolving. Tested end-to-end in
  `index.worker.test.ts`, "dynamic baseURL (ALLOWED_HOSTS)".
- A direct `auth.api.*` call that bypasses the Worker's HTTP boundary (no
  `Request` to read a Host from) must now pass `headers` or `request`
  explicitly, or Better Auth throws — see the "injected email sender" test.
- Test-harness gotcha: `@cloudflare/vitest-pool-workers`'s `SELF.fetch` does
  not synthesize a `Host` header from the request URL the way a real request
  always carries one (confirmed against a live dev server via `curl`).
  `index.worker.test.ts` now routes every request through a `fetchWorker`
  helper that sets one explicitly.
- `ALLOWED_HOSTS` also carries a `dreamport.test` entry, but only under
  `import.meta.env.DEV` — the seam-1 test harness's fictional host, dropped
  from the stage/prod bundle by `vite build`'s dead-code elimination
  (verified by grepping the built output).
