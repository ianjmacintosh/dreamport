import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createAuth } from "./auth";

/**
 * Seam 1 — the Worker's HTTP boundary.
 *
 * These run inside workerd (via @cloudflare/vitest-pool-workers) with the
 * real `DB` binding and per-test isolated storage. `test/apply-migrations.ts`
 * has already applied `migrations/0001_*.sql` to a fresh database.
 */

describe("non-/api paths", () => {
  it("serves the SPA shell from the asset layer, not the Worker", async () => {
    const res = await SELF.fetch("https://dreamport.test/");

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('data-fixture="spa-shell"');
  });

  it("falls back to the SPA shell for unknown client routes", async () => {
    const res = await SELF.fetch("https://dreamport.test/some/client/route");

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('data-fixture="spa-shell"');
  });
});

describe("/api/auth/*", () => {
  it("mounts Better Auth: GET /api/auth/ok returns { ok: true }", async () => {
    const res = await SELF.fetch("https://dreamport.test/api/auth/ok");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("reaches D1: createAuth reads and writes the migrated schema", async () => {
    // Exercises the whole wiring the Worker uses for every auth request:
    // createAuth -> Better Auth -> Kysely -> kysely-d1 -> the D1 binding ->
    // the tables from migrations/0001. A broken dialect or an unmigrated
    // database would throw here.
    //
    // Interim: goes through the internal adapter, not HTTP, because this
    // config has no DB-writing route yet. Once the emailOTP plugin lands,
    // replace this with a real request into the send-code endpoint.
    const ctx = await createAuth(env).$context;

    const created = await ctx.internalAdapter.createUser(
      { email: "reaches-d1@dreamport.test", name: "Reaches D1" },
      { method: "email-otp" },
    );
    const found = await ctx.internalAdapter.findUserByEmail(
      "reaches-d1@dreamport.test",
    );

    expect(found?.user.id).toBe(created.id);
  });
});

describe("trusted origins (via Better Auth's origin check)", () => {
  // Better Auth only runs the origin check on state-changing requests that
  // carry a cookie. sign-out fits, and with an unsigned cookie it does no
  // database work — so the status is purely the origin verdict.
  const signOutFrom = (origin: string) =>
    SELF.fetch("https://dreamport.test/api/auth/sign-out", {
      method: "POST",
      headers: { origin, cookie: "better-auth.session_token=unsigned" },
    });

  it("accepts the production origin", async () => {
    expect(
      (await signOutFrom("https://dreamport.ianjmacintosh.com")).status,
    ).toBe(200);
  });

  it("accepts a branch-preview origin on this account's subdomain", async () => {
    expect(
      (await signOutFrom("https://a1b2c3-dreamport.bananasquad.workers.dev"))
        .status,
    ).toBe(200);
  });

  it("rejects a workers.dev host outside this account's subdomain", async () => {
    expect(
      (await signOutFrom("https://a1b2c3-dreamport.someoneelse.workers.dev"))
        .status,
    ).toBe(403);
  });

  it("rejects an unrelated origin", async () => {
    expect((await signOutFrom("https://evil.example.com")).status).toBe(403);
  });
});

describe("other /api/* paths", () => {
  it("are owned by the Worker and 404 as JSON", async () => {
    const res = await SELF.fetch("https://dreamport.test/api/does-not-exist");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});

describe("createAuth", () => {
  it("builds a fresh instance per call — no shared singleton", () => {
    expect(createAuth(env)).not.toBe(createAuth(env));
  });
});
