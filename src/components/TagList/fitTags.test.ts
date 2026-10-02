import { describe, expect, test } from "vitest";

import { countTagsThatFit } from "./fitTags";

describe("countTagsThatFit", () => {
  test("every Tag fits: shows them all, no room kept for a more pill", () => {
    // 50 + 4 + 50 + 4 + 50 = 158 — fits 160 exactly-ish, even though adding
    // a 30px more pill would not.
    expect(
      countTagsThatFit({
        available: 160,
        widths: [50, 50, 50],
        gap: 4,
        moreWidth: 30,
      }),
    ).toBe(3);
  });

  test("not all fit: keeps room for the more pill after the ones shown", () => {
    // 50 + 4 + 50 = 104, + 4 + 30 more = 138 ≤ 140; a third would need 192.
    expect(
      countTagsThatFit({
        available: 140,
        widths: [50, 50, 50, 50],
        gap: 4,
        moreWidth: 30,
      }),
    ).toBe(2);
  });

  test("stops at the first Tag that doesn't fit, even if a later one would", () => {
    // Order is kept: a short Tag after a long one isn't pulled forward.
    expect(
      countTagsThatFit({
        available: 100,
        widths: [40, 200, 10],
        gap: 4,
        moreWidth: 30,
      }),
    ).toBe(1);
  });

  test("a first Tag wider than the box on its own still shows (CSS cuts it off)", () => {
    expect(
      countTagsThatFit({
        available: 100,
        widths: [400, 50],
        gap: 4,
        moreWidth: 30,
      }),
    ).toBe(1);
  });

  test("no Tags: zero", () => {
    expect(
      countTagsThatFit({ available: 100, widths: [], gap: 4, moreWidth: 30 }),
    ).toBe(0);
  });
});
