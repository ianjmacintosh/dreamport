import { describe, expect, it } from "vitest";

import {
  PREVIEW_ORIGIN_PATTERN,
  PROD_ORIGIN,
  STAGING_ORIGIN,
  trustedOrigins,
} from "./trusted-origins";

// The allow/reject *behaviour* of this list — that Better Auth accepts a
// prod / staging / *.workers.dev origin and rejects an unrelated one — is
// covered end-to-end in src/worker/index.worker.test.ts, which drives it
// through Better Auth's real origin check. These cases guard the list's
// safety contract: what it must contain, and what it must never contain.
describe("trustedOrigins", () => {
  const origins = trustedOrigins();

  it("trusts production and staging", () => {
    expect(origins).toContain(PROD_ORIGIN);
    expect(origins).toContain(STAGING_ORIGIN);
  });

  it("covers every preview host with a single workers.dev wildcard", () => {
    expect(origins.filter((o) => o.includes("*"))).toEqual([
      PREVIEW_ORIGIN_PATTERN,
    ]);
  });

  it("never widens trust beyond *.workers.dev", () => {
    for (const origin of origins) {
      if (!origin.includes("*")) continue;
      expect(origin.startsWith("https://")).toBe(true);
      expect(origin.endsWith(".workers.dev")).toBe(true);
      // The wildcard stands in for the subdomain only, not the whole host.
      expect(origin).not.toBe("https://*");
      expect(origin).not.toBe("https://*.*");
    }
  });
});
