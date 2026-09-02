/**
 * Which origins Better Auth will honour for sign-in callbacks and CSRF
 * checks.
 *
 * A function rather than a bare array because the trusted set has an
 * open-ended tail: every non-`main` branch deploys to a fresh
 * `https://<hash>-dreamport.<subdomain>.workers.dev` preview host (see
 * `docs/deployment.md`), and a reviewer has to be able to sign in there.
 * `PREVIEW_ORIGIN_PATTERN` is a wildcard Better Auth expands itself, so any
 * such preview is covered without being listed. Production and staging are
 * the only fixed hosts.
 */

export const PROD_ORIGIN = "https://dreamport.ianjmacintosh.com";
export const STAGING_ORIGIN = "https://staging.dreamport.ianjmacintosh.com";

/** Matches every branch preview host, and nothing outside `workers.dev`. */
export const PREVIEW_ORIGIN_PATTERN = "https://*.workers.dev";

export function trustedOrigins(): string[] {
  return [PROD_ORIGIN, STAGING_ORIGIN, PREVIEW_ORIGIN_PATTERN];
}
