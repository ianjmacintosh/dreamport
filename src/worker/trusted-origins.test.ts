import { describe, expect, it } from "vitest";

import { TRUSTED_ORIGINS } from "./trusted-origins";

// What each origin lets through is covered end-to-end in
// src/worker/index.worker.test.ts, which drives the list through Better
// Auth's real origin check (prod / staging / a branch preview accepted, an
// off-account workers.dev host and an unrelated host rejected). This case
// guards the one thing that check can't: that a wildcard entry can never be
// broadened by accident into trusting the whole platform.
describe("TRUSTED_ORIGINS", () => {
  it("keeps every wildcard entry scoped to this account's subdomain", () => {
    for (const origin of TRUSTED_ORIGINS) {
      if (!origin.includes("*")) continue;
      expect(origin.startsWith("https://")).toBe(true);
      expect(origin.endsWith(".bananasquad.workers.dev")).toBe(true);
      // Never a bare wildcard or the platform-wide `*.workers.dev`.
      expect(origin).not.toBe("https://*");
      expect(origin).not.toBe("https://*.workers.dev");
    }
  });
});
