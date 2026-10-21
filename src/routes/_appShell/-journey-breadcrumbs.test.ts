import { describe, expect, test } from "vitest";

import {
  journeyBreadcrumbs,
  journeyStatus,
  journeyWorksheetBreadcrumbs,
  type JourneyPlace,
} from "./-journey-breadcrumbs";

const place: JourneyPlace = {
  product: { id: "p1", name: "Tarot" },
  path: { id: "dream-sequence", name: "Dream Sequence" },
  journeyId: "j1",
  status: "in-progress",
};

describe("journeyBreadcrumbs", () => {
  test("names the Journey by its status", () => {
    expect(
      (["in-progress", "completed", "abandoned"] as const).map(
        (status) => journeyBreadcrumbs({ ...place, status }).current,
      ),
    ).toEqual(["Current Journey", "Completed Journey", "Abandoned Journey"]);
  });

  test("goes through the Product's Paths page and the Path's Trailhead", () => {
    expect(journeyBreadcrumbs(place).trail).toEqual([
      { label: "Products", href: "/app" },
      { label: "Tarot", href: "/app/products/p1" },
      { label: "Paths", href: "/app/products/p1/journeys" },
      {
        label: "Dream Sequence",
        href: "/app/paths/dream-sequence",
      },
    ]);
  });

  test("a Worksheet's trail links the Journey and ends on the Worksheet", () => {
    const { trail, current } = journeyWorksheetBreadcrumbs(
      { ...place, status: "abandoned" },
      "Product Summary",
    );
    expect(trail.at(-1)).toEqual({
      label: "Abandoned Journey",
      href: "/app/products/p1/journeys/j1",
    });
    expect(current).toBe("Product Summary");
    expect(new Set(trail.map(({ href }) => href)).size).toBe(trail.length);
  });
});

test("journeyStatus reads a finished Journey as completed, even if it was once abandoned", () => {
  expect(journeyStatus({ finishedAt: null, abandonedAt: null })).toBe(
    "in-progress",
  );
  expect(journeyStatus({ finishedAt: null, abandonedAt: "t" })).toBe(
    "abandoned",
  );
  expect(journeyStatus({ finishedAt: "t", abandonedAt: "t" })).toBe(
    "completed",
  );
});
