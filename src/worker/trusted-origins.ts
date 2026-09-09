/**
 * Every host this Worker recognises, grouped by the environment it belongs
 * to. {@link TRUSTED_ORIGINS} (Better Auth callback / CSRF) and
 * {@link ALLOWED_HOSTS} (dynamic `baseURL` resolution) are both composed from
 * these groups, so a host — and whether it counts as production — is stated
 * in exactly one place. Still plain data: no per-request logic, no function
 * form (see `docs/adr/0003-trusted-origins-constant-array.md`, amended for
 * the `ALLOWED_HOSTS` split in #22 and these role groups in #41).
 */

/**
 * Production. One canonical host: the custom domain
 * `dreamport.ianjmacintosh.com` is the only intended entry point, and the
 * `dreamport` Worker's `workers.dev` subdomain is disabled (see
 * `wrangler.jsonc`, `docs/deployment.md`).
 */
export const PRODUCTION_HOSTS = ["dreamport.ianjmacintosh.com"] as const;

/**
 * Staging. The long-lived `dreamport-staging` `workers.dev` host runs at 100%
 * traffic so it can be observed — Cloudflare cannot tail preview URLs
 * (Workers Logs, `wrangler tail`, and Logpush all exclude them), so a
 * versioned-preview-only "staging" is not debuggable. The second entry is the
 * `<commit-hash>-` per-branch preview wildcard; `*` is scoped to this
 * account's `bananasquad` subdomain, never a bare `*` or `*.workers.dev`, so
 * an unrelated Workers host is not recognised. All share the dreamport-stage
 * D1 database. See `docs/deployment.md`.
 */
export const STAGING_HOSTS = [
  "dreamport-staging.bananasquad.workers.dev",
  "*-dreamport-staging.bananasquad.workers.dev",
] as const;

/**
 * The canonical production host, for exact-match guards — e.g. the send-OTP
 * path in `index.ts` refusing mock email delivery on production (issue #41),
 * and `scripts/verify-deployment.sh` (which hard-codes the same literal; it's
 * bash). Compared with `===`, never a suffix test: a `*-dreamport-staging`
 * preview host must not read as production.
 */
export const PRODUCTION_HOST: string = PRODUCTION_HOSTS[0];

/**
 * Which origins Better Auth will honour for sign-in callbacks and CSRF
 * checks — `betterAuth({ trustedOrigins })`.
 *
 * Production and staging only, `https://`-qualified. Deliberately **not**
 * localhost: an origin that passes `callbackURL` / CSRF is a trust decision,
 * and the local-dev / test hosts below have no business making it.
 *
 * A plain array, not a function: Better Auth globs each entry against the
 * request origin, so the one staging wildcard covers every branch preview
 * without listing it, and nothing here needs computing per request. See
 * `docs/adr/0003-trusted-origins-constant-array.md`.
 */
export const TRUSTED_ORIGINS: string[] = [
  ...PRODUCTION_HOSTS,
  ...STAGING_HOSTS,
].map((host) => `https://${host}`);

/**
 * Bare host patterns (no protocol) for Better Auth's dynamic `baseURL`
 * config — `betterAuth({ baseURL: { allowedHosts: ALLOWED_HOSTS } })` in
 * `auth.ts`.
 *
 * A *dynamic* config, not a fixed string, because there is no one URL to
 * hard-code: alongside the long-lived staging host every branch also gets a
 * `<hash>-dreamport-staging.bananasquad.workers.dev` preview host, and
 * `local` dev's port floats unless pinned. Better Auth resolves the actual
 * `baseURL` per request from whichever pattern the request's Host matches.
 *
 * It is the trusted set plus two hosts that must resolve a `baseURL` but must
 * never count as a trusted origin: the floating-port local dev server, and
 * the Seam 1 test harness's fictional host (`import.meta.env.DEV` is
 * statically `false` under `vite build`, so it never reaches the stage/prod
 * bundle).
 *
 * This closes a real gap, not just a warning: with no `baseURL` config at
 * all, Better Auth resolves it by trusting *whatever Host the request itself
 * claims to be reaching* — so `trustedOrigins` implicitly grows to include
 * that Host too. `allowedHosts` replaces that with an explicit allowlist; a
 * request whose Host matches none of these patterns fails instead of
 * self-trusting (see the "trusted origins" tests in `index.worker.test.ts`).
 */
export const ALLOWED_HOSTS: string[] = [
  ...PRODUCTION_HOSTS,
  ...STAGING_HOSTS,
  "localhost:*",
  ...(import.meta.env.DEV ? ["dreamport.test"] : []),
];
