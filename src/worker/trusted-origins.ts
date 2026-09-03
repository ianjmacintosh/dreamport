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
  // Every branch preview. Cloudflare's Git integration deploys non-`main`
  // branches to `https://<commit-hash>-dreamport.bananasquad.workers.dev`;
  // the `*` stands in for the commit hash. Scoped to this account's
  // `bananasquad` subdomain so an unrelated `*.workers.dev` host is not
  // trusted. There is no long-lived staging environment — "staging" is
  // whichever preview shares the dreamport-stage DB.
  "https://*-dreamport.bananasquad.workers.dev",
];
