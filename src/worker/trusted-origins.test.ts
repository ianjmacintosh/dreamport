import { describe, expect, it } from "vitest";

import { ALLOWED_HOSTS, TRUSTED_ORIGINS } from "./trusted-origins";

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

// Real end-to-end coverage (a localhost Host resolves, an unrecognized one
// fails rather than self-trusting) lives in index.worker.test.ts, "dynamic
// baseURL". This case guards the same thing as the one above, for the other
// list: a wildcard host pattern can't accidentally widen past this account's
// preview subdomain or bare localhost.
describe("ALLOWED_HOSTS", () => {
  it("carries bare host patterns, never a protocol-qualified origin", () => {
    for (const host of ALLOWED_HOSTS) {
      expect(host).not.toMatch(/^https?:\/\//);
    }
  });

  it("keeps every wildcard entry scoped to localhost or this account's subdomain", () => {
    for (const host of ALLOWED_HOSTS) {
      if (!host.includes("*")) continue;
      const isLocalhost = host === "localhost:*";
      const isPreview =
        host.endsWith(".bananasquad.workers.dev") && host !== "*.workers.dev";
      expect(isLocalhost || isPreview).toBe(true);
      // Never a bare wildcard or the platform-wide `*.workers.dev`.
      expect(host).not.toBe("*");
      expect(host).not.toBe("*.workers.dev");
    }
  });
});
