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
   * How sign-in emails are delivered. `mock` in every environment today
   * (see `wrangler.jsonc`); unset is treated as `mock`.
   */
  EMAIL_MODE?: "mock" | "resend";
  /** Resend API key. Required only when `EMAIL_MODE=resend`. A secret. */
  RESEND_API_KEY?: string;
  /** `From:` address for sign-in email. Required only when `EMAIL_MODE=resend`. */
  EMAIL_FROM?: string;
  /** The static SPA assets (`wrangler.jsonc` `assets.binding`). */
  ASSETS: Fetcher;
}
