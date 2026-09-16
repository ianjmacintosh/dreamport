/**
 * Every host this Worker recognises, grouped by the environment it belongs
 * to. {@link TRUSTED_ORIGINS} (Better Auth callback / CSRF) and
 * {@link ALLOWED_HOSTS} (dynamic `baseURL` resolution) are both composed from
 * whichever one of these groups matches *this build's own* `CLOUDFLARE_ENV`
 * (see {@link hostsForEnvironment}) — not from every group at once — so a
 * host, and whether it counts as production, is stated in exactly one place,
 * and one environment's build never carries another's hosts. Still plain
 * data: no per-request logic, no function form (see
 * `docs/adr/0003-trusted-origins-constant-array.md`, amended for the
 * `ALLOWED_HOSTS` split in #22, these role groups in #41, and the
 * per-environment split in #63 / `docs/adr/0011-per-environment-host-allowlists.md`).
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
 * path in `index.ts` refusing mock email delivery on production (issue #41,
 * matched case-insensitively via {@link matchesHostPattern} since #60), and
 * `scripts/verify-deployment.sh` (which hard-codes the same literal; it's
 * bash, compared with `===`). Exact on value, never a suffix test: a
 * `*-dreamport-staging` preview host must not read as production.
 */
export const PRODUCTION_HOST: string = PRODUCTION_HOSTS[0];

/**
 * Whether `hostname` matches `pattern`, case-insensitively — host names are
 * case-insensitive per RFC 9110 (issue #60) — and wildcard-aware: a `*` in
 * `pattern` matches any run of characters, the same shape
 * {@link STAGING_HOSTS}'s preview entry already uses. Exported so more than
 * one hostname comparison in this codebase can share one implementation —
 * #69's Turnstile check was the first caller; #60's production-host guard in
 * `index.ts` adopted it too.
 */
export function matchesHostPattern(hostname: string, pattern: string): boolean {
  const regexSource = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${regexSource}$`, "i").test(hostname);
}

/** Whether `hostname` matches any pattern in `patterns` (see {@link matchesHostPattern}). */
export function hostnameInList(
  hostname: string,
  patterns: readonly string[],
): boolean {
  return patterns.some((pattern) => matchesHostPattern(hostname, pattern));
}

/**
 * The bare hosts one Workers build should recognize as its own, selected by
 * `CLOUDFLARE_ENV` (see `vite.config.ts`, `docs/deployment.md`). A pure
 * function of the environment name, not the baked `CURRENT_ENVIRONMENT_HOSTS`
 * constant below, so this module's own tests — and #69's Turnstile hostname
 * check, which consumes this directly — can exercise every environment's
 * shape in one test run instead of only whichever one this build happened to
 * bake in (see `docs/adr/0011-per-environment-host-allowlists.md`).
 *
 * `production` and `staging` get their own group and nothing else — no other
 * environment's hosts. Anything else (`local`, the not-yet-built `dev`, or an
 * unrecognized value) gets none: those builds only ever serve `localhost`,
 * added separately by {@link ALLOWED_HOSTS} rather than listed here, since
 * `localhost` is never a trusted *origin* (see below).
 */
export function hostsForEnvironment(
  cloudflareEnv: string | null | undefined,
): readonly string[] {
  switch (cloudflareEnv) {
    case "production":
      return PRODUCTION_HOSTS;
    case "staging":
      return STAGING_HOSTS;
    default:
      return [];
  }
}

/**
 * Which origins Better Auth will honour for sign-in callbacks and CSRF
 * checks — `betterAuth({ trustedOrigins })`, for one `CLOUDFLARE_ENV`.
 *
 * That environment's own hosts only, `https://`-qualified. Deliberately
 * **not** localhost: an origin that passes `callbackURL` / CSRF is a trust
 * decision, and the local-dev / test hosts have no business making it.
 *
 * Still a plain array once resolved, not a function evaluated per request:
 * Better Auth globs each entry against the request origin, so staging's
 * wildcard covers every branch preview without listing it, and nothing here
 * needs computing per request. See
 * `docs/adr/0003-trusted-origins-constant-array.md`, amended by
 * `docs/adr/0011-per-environment-host-allowlists.md` for the per-environment
 * split.
 */
export function trustedOriginsForEnvironment(
  cloudflareEnv: string | null | undefined,
): string[] {
  return hostsForEnvironment(cloudflareEnv).map((host) => `https://${host}`);
}

/**
 * Bare host patterns (no protocol) for Better Auth's dynamic `baseURL`
 * config — `betterAuth({ baseURL: { allowedHosts: ALLOWED_HOSTS } })` in
 * `auth.ts` — for one `CLOUDFLARE_ENV`.
 *
 * A *dynamic* config, not a fixed string, because there is no one URL to
 * hard-code: staging alone still needs both its long-lived host and the
 * `<hash>-dreamport-staging.bananasquad.workers.dev` preview wildcard, and
 * `local` dev's port floats unless pinned. Better Auth resolves the actual
 * `baseURL` per request from whichever pattern the request's Host matches.
 *
 * It is that environment's trusted set plus two hosts that must resolve a
 * `baseURL` but must never count as a trusted origin: the floating-port
 * local dev server, and the Seam 1 test harness's fictional host
 * (`import.meta.env.DEV` is statically `false` under `vite build`, so it
 * never reaches the stage/prod bundle). Both only apply to the `local` shape
 * (no environment-scoped hosts of its own) — production and staging builds
 * get neither.
 *
 * This closes a real gap, not just a warning: with no `baseURL` config at
 * all, Better Auth resolves it by trusting *whatever Host the request itself
 * claims to be reaching* — so `trustedOrigins` implicitly grows to include
 * that Host too. `allowedHosts` replaces that with an explicit allowlist; a
 * request whose Host matches none of these patterns fails instead of
 * self-trusting (see the "dynamic baseURL" tests in `index.worker.test.ts`).
 */
export function allowedHostsForEnvironment(
  cloudflareEnv: string | null | undefined,
  { dev = false }: { dev?: boolean } = {},
): string[] {
  const ownHosts = hostsForEnvironment(cloudflareEnv);
  const isLocalShape = ownHosts.length === 0;
  return [
    ...ownHosts,
    // Both only apply to the `local` shape — a deployed production/staging
    // build has its own real host(s) and no business also resolving
    // `localhost` or the fictional Seam 1 test host.
    ...(isLocalShape ? ["localhost:*"] : []),
    ...(isLocalShape && dev ? ["dreamport.test"] : []),
  ];
}

/**
 * `CLOUDFLARE_ENV` baked into this build (see `vite.config.ts`'s `define`
 * block). Vite only replaces `import.meta.env.DEV`/`PROD`/`MODE` by default —
 * a custom key like this one reads back `undefined` in any build that never
 * ran through that `define` block (e.g. the Seam 1 vitest-pool-workers
 * project), which lands in {@link hostsForEnvironment}'s `default` case —
 * the same "no environment-scoped hosts, just `localhost`" shape `local`
 * gets, which is what a test run should have anyway.
 */
const CLOUDFLARE_ENV = import.meta.env.CLOUDFLARE_ENV;

/**
 * The bare hosts *this build* recognizes as its own — `hostsForEnvironment`
 * resolved once against this build's own `CLOUDFLARE_ENV`, so
 * {@link TRUSTED_ORIGINS} and {@link ALLOWED_HOSTS} (and #69's Turnstile
 * check) all read the same fixed list rather than each re-resolving it.
 */
export const CURRENT_ENVIRONMENT_HOSTS: readonly string[] =
  hostsForEnvironment(CLOUDFLARE_ENV);

/**
 * Whether *this build's* `CLOUDFLARE_ENV` is `production`.
 *
 * {@link CURRENT_ENVIRONMENT_HOSTS} is non-empty in staging too (#68), so it
 * can no longer stand in for "is this a real, production Turnstile widget"
 * the way an empty/non-empty `TURNSTILE_HOSTNAMES` used to (#69). This is
 * the direct replacement signal: production's widget is real and its
 * `siteverify` response carries a stable `hostname`/`action` worth checking;
 * staging and local run Cloudflare's test-key pair, whose response doesn't,
 * so they stay lenient regardless of how many hosts their own list carries.
 */
export const IS_PRODUCTION_ENVIRONMENT: boolean =
  CLOUDFLARE_ENV === "production";

/** This build's `TRUSTED_ORIGINS` — see {@link trustedOriginsForEnvironment}. */
export const TRUSTED_ORIGINS: string[] =
  trustedOriginsForEnvironment(CLOUDFLARE_ENV);

/** This build's `ALLOWED_HOSTS` — see {@link allowedHostsForEnvironment}. */
export const ALLOWED_HOSTS: string[] = allowedHostsForEnvironment(
  CLOUDFLARE_ENV,
  { dev: import.meta.env.DEV },
);
