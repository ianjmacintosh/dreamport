import { describe, expect, it } from "vitest";

import {
  ALLOWED_HOSTS,
  allowedHostsForEnvironment,
  PRODUCTION_HOSTS,
  STAGING_HOSTS,
  trustedOriginsForEnvironment,
} from "./trusted-origins";

// What this build's own origin check does with each of these is covered
// end-to-end in src/worker/index.worker.test.ts ("trusted origins"), driven
// through Better Auth's real origin check. This case guards the one thing
// that check can't: that a wildcard entry can never be broadened by accident
// into trusting the whole platform.
//
// Deliberately not iterating the live `TRUSTED_ORIGINS`/`ALLOWED_HOSTS`
// constants here (#63 / docs/adr/0011): those are only ever *this* build's
// own resolved shape — under vitest that's `local`, which carries no
// wildcard entry at all, so a loop over them would pass vacuously no matter
// how broad `STAGING_HOSTS`'s wildcard got. `trustedOriginsForEnvironment` /
// `allowedHostsForEnvironment` resolved against `"staging"` — where the
// wildcard actually lives — exercises the real content in every build.
describe("TRUSTED_ORIGINS", () => {
  it("keeps every wildcard entry scoped to this account's subdomain", () => {
    const origins = trustedOriginsForEnvironment("staging");
    const wildcards = origins.filter((origin) => origin.includes("*"));
    expect(wildcards).not.toHaveLength(0);
    for (const origin of wildcards) {
      expect(origin.startsWith("https://")).toBe(true);
      expect(origin.endsWith(".bananasquad.workers.dev")).toBe(true);
      // Never a bare wildcard or the platform-wide `*.workers.dev`.
      expect(origin).not.toBe("https://*");
      expect(origin).not.toBe("https://*.workers.dev");
    }
  });
});

// Real end-to-end coverage (a localhost Host resolves, production/staging
// don't in this build, an unrecognized one fails rather than self-trusting)
// lives in index.worker.test.ts, "dynamic baseURL". This case guards the
// same thing as the one above, for the other list: a wildcard host pattern
// can't accidentally widen past this account's preview subdomain or bare
// localhost.
describe("ALLOWED_HOSTS", () => {
  it("carries bare host patterns, never a protocol-qualified origin", () => {
    for (const host of ALLOWED_HOSTS) {
      expect(host).not.toMatch(/^https?:\/\//);
    }
  });

  it("keeps every wildcard entry scoped to localhost or this account's subdomain", () => {
    const hosts = allowedHostsForEnvironment("staging");
    const wildcards = hosts.filter((host) => host.includes("*"));
    expect(wildcards).not.toHaveLength(0);
    for (const host of wildcards) {
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

// #63 / docs/adr/0011: each environment's build gets its own host list, not
// every environment's hosts shared across every build. These test the pure
// per-environment functions directly rather than the `TRUSTED_ORIGINS` /
// `ALLOWED_HOSTS` constants above, which are only ever *this* build's
// resolved shape (`local`-shaped under vitest — see `hostsForEnvironment`'s
// doc comment) — the whole point is that a single build can no longer
// answer "what does production's list look like?".
describe("trustedOriginsForEnvironment", () => {
  it("production carries only production's own host", () => {
    expect(trustedOriginsForEnvironment("production")).toEqual([
      `https://${PRODUCTION_HOSTS[0]}`,
    ]);
  });

  it("staging carries only staging's own hosts", () => {
    expect(trustedOriginsForEnvironment("staging")).toEqual(
      STAGING_HOSTS.map((host) => `https://${host}`),
    );
  });

  it("production's list does not carry staging's hostname", () => {
    const origins = trustedOriginsForEnvironment("production");
    for (const stagingHost of STAGING_HOSTS) {
      expect(origins).not.toContain(`https://${stagingHost}`);
    }
  });

  it("staging's list does not carry production's hostname", () => {
    expect(trustedOriginsForEnvironment("staging")).not.toContain(
      `https://${PRODUCTION_HOSTS[0]}`,
    );
  });

  it("local (and any other/unrecognized value) trusts no origin at all", () => {
    expect(trustedOriginsForEnvironment("local")).toEqual([]);
    expect(trustedOriginsForEnvironment(undefined)).toEqual([]);
    expect(trustedOriginsForEnvironment(null)).toEqual([]);
    expect(trustedOriginsForEnvironment("qa")).toEqual([]);
  });
});

describe("allowedHostsForEnvironment", () => {
  it("production allows only its own host — no staging hosts, no localhost", () => {
    const hosts = allowedHostsForEnvironment("production");
    expect(hosts).toEqual([PRODUCTION_HOSTS[0]]);
    expect(hosts).not.toContain("localhost:*");
    for (const stagingHost of STAGING_HOSTS) {
      expect(hosts).not.toContain(stagingHost);
    }
  });

  it("staging allows only its own hosts — no production, no localhost", () => {
    const hosts = allowedHostsForEnvironment("staging");
    expect(hosts).toEqual([...STAGING_HOSTS]);
    expect(hosts).not.toContain("localhost:*");
    expect(hosts).not.toContain(PRODUCTION_HOSTS[0]);
  });

  it("local allows only localhost — no production, no staging", () => {
    const hosts = allowedHostsForEnvironment("local");
    expect(hosts).toEqual(["localhost:*"]);
  });

  it("adds the DEV-only fictional test host solely under `dev: true`", () => {
    expect(allowedHostsForEnvironment("local")).not.toContain("dreamport.test");
    expect(allowedHostsForEnvironment("local", { dev: true })).toContain(
      "dreamport.test",
    );
    // Never leaks into a real deployed environment, `dev: true` or not.
    expect(
      allowedHostsForEnvironment("production", { dev: true }),
    ).not.toContain("dreamport.test");
  });
});
