import { expect, type Locator, type Page } from "@playwright/test";

/**
 * How every `.list` row except `row` renders — each other row's own size,
 * and every element inside it as a rounded `[x, y, width, height]` relative
 * to that row's own top-left corner. Relative, not absolute: a row growing
 * taller (e.g. an inline form's label line) still pushes the rows below it
 * down the page, which is normal document flow, not their layout changing.
 * Two snapshots compare equal only if no other row resized or rearranged.
 */
async function otherRowsLayout(row: Locator): Promise<string> {
  return row.evaluate((target) => {
    const rows = [...(target.parentElement?.children ?? [])].filter(
      (li) => li !== target,
    );
    return JSON.stringify(
      rows.map((li) =>
        [li, ...li.querySelectorAll("*")].map((el) => {
          const origin = li.getBoundingClientRect();
          const r = el.getBoundingClientRect();
          return [r.x - origin.x, r.y - origin.y, r.width, r.height].map(
            Math.round,
          );
        }),
      ),
    );
  });
}

/**
 * Every row is laid out on its own (docs/design-decisions.md, #102): run
 * `change` — e.g. clicking Edit or Delete on `row` — and assert no other
 * row resized or rearranged, and the page gained no horizontal scroll.
 */
export async function expectOtherRowsUnaffected(
  page: Page,
  row: Locator,
  change: () => Promise<void>,
): Promise<void> {
  const before = await otherRowsLayout(row);
  await change();
  expect(await otherRowsLayout(row)).toBe(before);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBe(0);
}

/** Desktop, and a small phone (the width a three-button group overflowed at). */
export const LAYOUT_WIDTHS = [1280, 375] as const;
