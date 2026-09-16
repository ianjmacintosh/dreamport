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
   * `DEFAULT_DAILY_CAP` (90) when `RESEND_API_KEY` is present and to
   * uncapped when it's absent (no real quota to protect). Raise it per
   * environment in `wrangler.jsonc` once the Resend plan allows.
   */
  SEND_OTP_DAILY_CAP?: string;
  /**
   * Resend API key. Its presence, not a separate mode flag, decides the
   * email sender (#66, docs/adr/0010): present → `ResendEmailSender`,
   * absent → `MockEmailSender` (see `createEmailSender`). A secret.
   */
  RESEND_API_KEY?: string;
  /** The static SPA assets (`wrangler.jsonc` `assets.binding`). */
  ASSETS: Fetcher;
}
