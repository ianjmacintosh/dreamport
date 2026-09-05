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
  // Long-lived staging. The `dreamport-staging` Workers Builds project
  // deploys here (100% traffic) so it can be observed with `wrangler tail` —
  // Cloudflare cannot tail preview URLs (Workers Logs, tail, and Logpush all
  // exclude them), so a versioned-preview-only "staging" is not debuggable.
  // See docs/deployment.md.
  "https://dreamport-staging.bananasquad.workers.dev",
  // Per-branch preview versions, still uploaded for every branch for visual
  // review. `<commit-hash>-` prefixes the same host; the `*` stands in for
  // it. Scoped to this account's `bananasquad` subdomain so an unrelated
  // `*.workers.dev` host is not trusted. All share the dreamport-stage DB.
  "https://*-dreamport-staging.bananasquad.workers.dev",
];

/**
 * The same hosts as {@link TRUSTED_ORIGINS}, as bare host patterns (no
 * protocol) for Better Auth's dynamic `baseURL` config —
 * `betterAuth({ baseURL: { allowedHosts: ALLOWED_HOSTS } })` in `auth.ts`.
 *
 * A *dynamic* config, not a plain string, because there is no one fixed URL
 * to hard-code: alongside the long-lived staging host, every branch also
 * gets a `<hash>-dreamport-staging.bananasquad.workers.dev` preview host,
 * and `local` dev's port floats unless pinned. Better Auth resolves the
 * actual `baseURL` per request from whichever pattern the request's Host
 * matches, the same way `TRUSTED_ORIGINS` already works.
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
  "dreamport-staging.bananasquad.workers.dev",
  "*-dreamport-staging.bananasquad.workers.dev",
  // The Vite dev server's port floats (5173, bumped if that's busy) unless
  // pinned, so every port is allowed rather than one.
  "localhost:*",
  // The seam-1 test harness (`index.worker.test.ts`) drives the Worker
  // against this fictional host. `import.meta.env.DEV` is statically `false`
  // under `vite build`, so it never reaches the stage/prod bundle.
  ...(import.meta.env.DEV ? ["dreamport.test"] : []),
];
