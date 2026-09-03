import { betterAuth } from "better-auth";
import { Kysely } from "kysely";
import { D1Dialect } from "kysely-d1";

import type { WorkerEnv } from "./env";
import { TRUSTED_ORIGINS } from "./trusted-origins";

/**
 * Build the auth object (the bundle of functions `betterAuth()` returns) for
 * each request.
 *
 * We don't build it once at app startup and reach back into it later. To
 * build it we need the DB binding and the signing secret, and on Workers
 * those only arrive with a request, on `c.env`. No request, no `env` — so
 * we build the auth object fresh on every request instead.
 *
 * Better Auth is hand-wired to D1 through Kysely + the `kysely-d1` dialect
 * rather than the `better-auth-cloudflare` bundle, to keep the code we own
 * and audit small (see `docs/adr/0002-better-auth-over-homegrown.md`).
 *
 * Note: D1 has no transactions and Better Auth assumes them, so a
 * multi-statement write can partially apply. Accepted risk, same ADR.
 */
export function createAuth(env: WorkerEnv) {
  // Fail loud, not quiet: without a secret Better Auth would fall back to a
  // shared default and sign real cookies with it. Locally that means copying
  // `.dev.vars.example` to `.dev.vars`; deployed it means the Cloudflare
  // secret is missing.
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error(
      "BETTER_AUTH_SECRET is not set — copy .dev.vars.example to .dev.vars " +
        "for local dev, or set the Cloudflare secret (see docs/deployment.md).",
    );
  }

  const db = new Kysely({
    dialect: new D1Dialect({ database: env.DB }),
  });

  return betterAuth({
    database: { db, type: "sqlite" },
    secret: env.BETTER_AUTH_SECRET,
    basePath: "/api/auth",
    trustedOrigins: TRUSTED_ORIGINS,
  });
}

export type Auth = ReturnType<typeof createAuth>;
