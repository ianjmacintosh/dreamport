import { describe, expect, it } from "vitest";

import { buildTestLoginOTP, createAuth } from "./auth";
import type { WorkerEnv } from "./env";

// The full createAuth -> Better Auth -> Kysely -> D1 path is covered in
// src/worker/index.worker.test.ts (it needs a real D1 binding). This case
// only needs to reach the guard, so a bare env is enough.
describe("createAuth", () => {
  it("throws when BETTER_AUTH_SECRET is missing rather than using a default", () => {
    const env = { EMAIL_MODE: "mock" } as unknown as WorkerEnv;

    expect(() => createAuth(env)).toThrow(/BETTER_AUTH_SECRET is not set/);
  });
});

/**
 * Pure, fast unit coverage for the fixed test-login code (issue #39,
 * docs/adr/0009) — no D1, no Better Auth, no build step. This is exactly the
 * layer that `import.meta.env.DEV`-gating couldn't be tested at: swapping
 * that build-time flag for the runtime `TEST_LOGIN_ENABLED` var lets these
 * cases construct the "off" (staging/production-shaped) env directly and
 * assert its behavior, something no test could do before #61's hotfix (see
 * the round trip through `createAuth` in `index.worker.test.ts` for the
 * "it actually verifies" coverage — this file only checks the callback
 * itself).
 */
describe("buildTestLoginOTP", () => {
  const email = "delivered+e2e-test@resend.dev";

  it("always returns a function — never undefined, regardless of env", () => {
    // The regression #61 shipped: a `generateOTP` property that could be
    // `undefined` crashed every OTP send, because Better Auth calls it with
    // no `?.` guard. This is the structural invariant that must hold no
    // matter how the env below is shaped.
    const envs: WorkerEnv[] = [
      {} as WorkerEnv,
      { TEST_LOGIN_ENABLED: "true" } as WorkerEnv,
      { TEST_LOGIN_ENABLED: "true", EMAIL_MODE: "resend" } as WorkerEnv,
    ];

    for (const env of envs) {
      expect(typeof buildTestLoginOTP(env)).toBe("function");
    }
  });

  it("returns undefined when TEST_LOGIN_ENABLED is unset — the staging/production shape", () => {
    const env = { EMAIL_MODE: "mock" } as unknown as WorkerEnv;

    expect(buildTestLoginOTP(env)({ email })).toBeUndefined();
  });

  it("returns the fixed code for a +e2e-test@ address when enabled", () => {
    const env = {
      TEST_LOGIN_ENABLED: "true",
      EMAIL_MODE: "mock",
    } as unknown as WorkerEnv;

    expect(buildTestLoginOTP(env)({ email })).toBe("000000");
  });

  it("returns undefined for an address without the marker, even when enabled", () => {
    const env = {
      TEST_LOGIN_ENABLED: "true",
      EMAIL_MODE: "mock",
    } as unknown as WorkerEnv;

    expect(
      buildTestLoginOTP(env)({ email: "delivered+plain@resend.dev" }),
    ).toBeUndefined();
  });

  it("stays inert under EMAIL_MODE=resend even when enabled — defense in depth", () => {
    const env = {
      TEST_LOGIN_ENABLED: "true",
      EMAIL_MODE: "resend",
    } as unknown as WorkerEnv;

    expect(buildTestLoginOTP(env)({ email })).toBeUndefined();
  });
});
