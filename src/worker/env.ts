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
  /** How sign-in emails are delivered. `mock` in every environment today. */
  EMAIL_MODE: "mock" | "resend";
  /** The static SPA assets (`wrangler.jsonc` `assets.binding`). */
  ASSETS: Fetcher;
}
