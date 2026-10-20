import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { TEST_EMAILS } from "../../test/emails";
import { isGuide } from "./guides";

describe("the local environment's Guides", () => {
  it("are exactly the guide test address", () => {
    expect(isGuide(env, TEST_EMAILS.guide)).toBe(true);
    expect(isGuide(env, TEST_EMAILS.notGuide)).toBe(false);
  });
});
