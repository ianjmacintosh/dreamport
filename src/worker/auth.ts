import { betterAuth } from "better-auth";
import { Kysely } from "kysely";
import { D1Dialect } from "kysely-d1";

import type { WorkerEnv } from "./env";
import { trustedOrigins } from "./trusted-origins";

/**
 * Build a Better Auth instance for one request.
 *
 * Deliberately not a module-level singleton: on Workers the `env` bindings
 * this needs (`DB`, `BETTER_AUTH_SECRET`) only exist per request, so the
 * object that closes over them has to be built per request too.
 *
 * Better Auth is hand-wired to D1 through Kysely + the `kysely-d1` dialect
 * rather than the `better-auth-cloudflare` bundle, to keep the code we own
 * and audit small (see `docs/adr/0002-better-auth-over-homegrown.md`).
 *
 * Note: D1 has no transactions and Better Auth assumes them, so a
 * multi-statement write can partially apply. Accepted risk, same ADR.
 */
export function createAuth(env: WorkerEnv) {
  const db = new Kysely({
    dialect: new D1Dialect({ database: env.DB }),
  });

  return betterAuth({
    database: { db, type: "sqlite" },
    secret: env.BETTER_AUTH_SECRET,
    basePath: "/api/auth",
    trustedOrigins,
  });
}

export type Auth = ReturnType<typeof createAuth>;
