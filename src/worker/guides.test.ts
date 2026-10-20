import { describe, expect, it } from "vitest";

import { TEST_EMAILS } from "../../test/emails";
import { isGuide } from "./guides";

describe("isGuide", () => {
  const env = {
    GUIDE_EMAILS: `${TEST_EMAILS.sendBasic},${TEST_EMAILS.guide}`,
  };

  it("is true for an address on the list", () => {
    expect(isGuide(env, TEST_EMAILS.guide)).toBe(true);
  });

  it("is false for an address not on the list", () => {
    expect(isGuide(env, TEST_EMAILS.notGuide)).toBe(false);
  });

  it("ignores case and surrounding spaces on both sides", () => {
    const spaced = { GUIDE_EMAILS: ` ${TEST_EMAILS.guide.toUpperCase()} ,  ` };
    expect(isGuide(spaced, TEST_EMAILS.guide)).toBe(true);
    expect(
      isGuide(
        { GUIDE_EMAILS: TEST_EMAILS.guide },
        ` ${TEST_EMAILS.guide.toUpperCase()} `,
      ),
    ).toBe(true);
  });

  it("has no Guides when the list is missing, empty, or only separators", () => {
    for (const GUIDE_EMAILS of [undefined, "", " ", ",", " , "]) {
      expect(isGuide({ GUIDE_EMAILS }, TEST_EMAILS.guide)).toBe(false);
      expect(isGuide({ GUIDE_EMAILS }, "")).toBe(false);
    }
  });
});
