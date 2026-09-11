/**
 * Bindings and vars available to the Worker at runtime.
 *
 * On Workers these only exist per request, which is why {@link createAuth}
 * is a per-request factory rather than a module-level singleton.
 */
export interface WorkerEnv {
  /** D1 database for this environment (see wrangler.jsonc `d1_databases`). */
  DB: D1Database;
  /** Signing secret for Better Auth. A Cloudflare secret, never committed. */
  BETTER_AUTH_SECRET: string;
  /**
   * Cloudflare Turnstile secret key, used server-side to verify the widget
   * token on the send-OTP path (see `src/worker/turnstile.ts`). A Cloudflare
   * secret, per environment, never committed. The gate fails closed when it
   * is unset, so a deployed environment is not functional until it is set
   * (see docs/deployment.md).
   */
  TURNSTILE_SECRET_KEY: string;
  /**
   * Comma-separated hostnames a Turnstile token may have been solved on. When
   * set (production, in `wrangler.jsonc`), the gate also checks the token's
   * `hostname` and `action`. Left unset where a real widget can't apply — the
   * floating `localhost` port, the `*-dreamport-staging` preview sprawl — so
   * those run on Cloudflare's test keys with just the `success` check.
   */
  TURNSTILE_HOSTNAMES?: string;
  /**
   * How outbound email is delivered. `resend` in production (#38/#52);
   * `mock` in staging and local (see `wrangler.jsonc`); unset is treated as
   * `mock`.
   */
  EMAIL_MODE?: "mock" | "resend";
  /**
   * Enables `generateOTP`'s fixed test-login code for `+e2e-test@` addresses
   * (issue #39, docs/adr/0009) — `"true"` only in `wrangler.jsonc`'s `local`
   * and `dev` envs, absent (falsy) everywhere else, `staging` included. A
   * runtime var rather than an `import.meta.env.DEV` build-time flag,
   * specifically so the gate itself stays testable with a plain unit test
   * instead of requiring a real alternate build to exercise the "off"
   * branch — see `docs/adr/0009`'s hotfix note for why that distinction
   * matters.
   */
  TEST_LOGIN_ENABLED?: string;
  /**
   * Max outbound emails the app will send app-wide in one UTC day — the guard
   * for the shared Resend quota (issue #24, ADR-0007; extended to cover the
   * account-deletion email in #26). A plain var, not a secret. A positive
   * integer always wins; unset / non-numeric / ≤ 0 falls back to
   * `DEFAULT_DAILY_CAP` (90) on `EMAIL_MODE=resend` and to uncapped on `mock`
   * (no real quota to protect). Raise it per environment in `wrangler.jsonc`
   * once the Resend plan allows.
   */
  SEND_OTP_DAILY_CAP?: string;
  /** Resend API key. Required only when `EMAIL_MODE=resend`. A secret. */
  RESEND_API_KEY?: string;
  /** The static SPA assets (`wrangler.jsonc` `assets.binding`). */
  ASSETS: Fetcher;
}
