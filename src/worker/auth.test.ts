import { describe, expect, it } from "vitest";

import { createAuth } from "./auth";
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
