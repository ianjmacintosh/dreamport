import { describe, expect, test } from "vitest";

import { fitBreadcrumbs } from "./fitBreadcrumbs";

const ancestor = (label: number) => ({ label, chrome: 20 });

describe("fitBreadcrumbs", () => {
  test("everything fits: the current page keeps its full name", () => {
    // 20+100 + 8 + 20+100 + 8 + 150 = 406 ≤ 500.
    expect(
      fitBreadcrumbs({
        available: 500,
        gap: 8,
        ancestors: [ancestor(100), ancestor(100)],
        current: 150,
        minLabel: 44,
      }),
    ).toEqual({ ancestorShrinks: [true, true], currentShrinks: false });
  });

  test("the current page keeps its full name while an ancestor still has room to give", () => {
    // Full width 20+100 + 8 + 150 = 278 > 250, but with the ancestor at
    // its 44px minimum it's 20+44 + 8 + 150 = 222 ≤ 250.
    expect(
      fitBreadcrumbs({
        available: 250,
        gap: 8,
        ancestors: [ancestor(100)],
        current: 150,
        minLabel: 44,
      }).currentShrinks,
    ).toBe(false);
  });

  test("the current page shortens once every ancestor is at its minimum and it still doesn't fit", () => {
    // 20+44 + 8 + 20+44 + 8 + 150 = 294 > 290.
    expect(
      fitBreadcrumbs({
        available: 290,
        gap: 8,
        ancestors: [ancestor(100), ancestor(100)],
        current: 150,
        minLabel: 44,
      }).currentShrinks,
    ).toBe(true);
  });

  test("a name narrower than the minimum never shortens, and counts at its own width", () => {
    // "Tea" at 30px: never padded out to 44px. 20+30 + 8 + 150 = 208 ≤ 210;
    // counting it at 44px would make 222 and wrongly shorten the current page.
    expect(
      fitBreadcrumbs({
        available: 210,
        gap: 8,
        ancestors: [ancestor(30)],
        current: 150,
        minLabel: 44,
      }),
    ).toEqual({ ancestorShrinks: [false], currentShrinks: false });
  });

  test("a single-crumb page shortens only when its own name doesn't fit", () => {
    const fit = (available: number) =>
      fitBreadcrumbs({
        available,
        gap: 8,
        ancestors: [],
        current: 150,
        minLabel: 44,
      });
    expect(fit(150)).toEqual({ ancestorShrinks: [], currentShrinks: false });
    expect(fit(149).currentShrinks).toBe(true);
  });
});
