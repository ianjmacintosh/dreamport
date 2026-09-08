import { describe, expect, it } from "vitest";

import { resolveTurnstileSiteKey } from "./vite.config";

// The public production widget key and Cloudflare's always-pass test key.
const PROD_KEY = "0x4AAAAAAEqY4wvljJsO_dJb";
const TEST_KEY = "1x00000000000000000000AA";

describe("resolveTurnstileSiteKey", () => {
  it("bakes the real production widget key for CLOUDFLARE_ENV=production", () => {
    expect(resolveTurnstileSiteKey({ CLOUDFLARE_ENV: "production" })).toBe(
      PROD_KEY,
    );
  });

  it("uses Cloudflare's always-pass test key for staging", () => {
    expect(resolveTurnstileSiteKey({ CLOUDFLARE_ENV: "staging" })).toBe(
      TEST_KEY,
    );
  });

  it("falls back to the test key when CLOUDFLARE_ENV is local or unset", () => {
    expect(resolveTurnstileSiteKey({ CLOUDFLARE_ENV: "local" })).toBe(TEST_KEY);
    expect(resolveTurnstileSiteKey({})).toBe(TEST_KEY);
  });

  it("falls back to the test key for an unrecognised CLOUDFLARE_ENV", () => {
    expect(resolveTurnstileSiteKey({ CLOUDFLARE_ENV: "qa" })).toBe(TEST_KEY);
  });

  it("lets an explicit VITE_TURNSTILE_SITE_KEY override the map", () => {
    expect(
      resolveTurnstileSiteKey({
        CLOUDFLARE_ENV: "production",
        VITE_TURNSTILE_SITE_KEY: "0xEXPLICIToverride000",
      }),
    ).toBe("0xEXPLICIToverride000");
  });
});
