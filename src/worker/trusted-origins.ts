/**
 * Which origins Better Auth will honour for sign-in callbacks and CSRF
 * checks.
 *
 * A plain array, not a function: Better Auth globs each entry against the
 * request origin, so one wildcard covers every branch preview without
 * listing it, and nothing here needs computing per request. See
 * `docs/adr/0003-trusted-origins-constant-array.md`.
 */
export const TRUSTED_ORIGINS: string[] = [
  // Production.
  "https://dreamport.ianjmacintosh.com",
  // Every branch preview. The `dreamport-staging` Workers Builds project
  // (a separate Git-connected project from production, see
  // docs/deployment.md) deploys every non-`main` branch to
  // `https://<commit-hash>-dreamport-staging.bananasquad.workers.dev`; the
  // `*` stands in for the commit hash. Scoped to this account's
  // `bananasquad` subdomain so an unrelated `*.workers.dev` host is not
  // trusted. There is no long-lived staging environment — "staging" is
  // whichever preview shares the dreamport-stage DB.
  "https://*-dreamport-staging.bananasquad.workers.dev",
];

/**
 * The same hosts as {@link TRUSTED_ORIGINS}, as bare host patterns (no
 * protocol) for Better Auth's dynamic `baseURL` config —
 * `betterAuth({ baseURL: { allowedHosts: ALLOWED_HOSTS } })` in `auth.ts`.
 *
 * A *dynamic* config, not a plain string, because there is no one fixed URL
 * to hard-code: `stage` is a different `<hash>-dreamport.bananasquad.workers.dev`
 * host on every deploy (same reasoning as the wildcard above), and `local`
 * dev's port floats unless pinned. Better Auth resolves the actual `baseURL`
 * per request from whichever pattern the request's Host matches, the same
 * way `TRUSTED_ORIGINS` already works.
 *
 * This closes a real gap, not just a warning: with no `baseURL` config at
 * all, Better Auth resolves it by trusting *whatever Host the request
 * itself claims to be reaching* — so `trustedOrigins` implicitly grows to
 * include that Host too. `allowedHosts` replaces that with an explicit
 * allowlist; a request whose Host matches none of these patterns fails
 * instead of self-trusting (see the "trusted origins" tests in
 * `index.worker.test.ts`).
 */
export const ALLOWED_HOSTS: string[] = [
  "dreamport.ianjmacintosh.com",
  "*-dreamport.bananasquad.workers.dev",
  // The Vite dev server's port floats (5173, bumped if that's busy) unless
  // pinned, so every port is allowed rather than one.
  "localhost:*",
  // The seam-1 test harness (`index.worker.test.ts`) drives the Worker
  // against this fictional host. `import.meta.env.DEV` is statically `false`
  // under `vite build`, so it never reaches the stage/prod bundle.
  ...(import.meta.env.DEV ? ["dreamport.test"] : []),
];
