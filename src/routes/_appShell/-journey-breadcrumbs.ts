import type { BreadcrumbsProps } from "../../components/Breadcrumbs";

/** Mirrors `JourneyStatus` in `src/worker/journeys.ts`. */
export type JourneyStatus = "in-progress" | "completed" | "abandoned";

const JOURNEY_CRUMB: Record<JourneyStatus, string> = {
  "in-progress": "Current Journey",
  completed: "Completed Journey",
  abandoned: "Abandoned Journey",
};

/** Where a Journey stands, from its progress as the Journey GET answers it. */
export function journeyStatus(journey: {
  finishedAt: string | null;
  abandonedAt: string | null;
}): JourneyStatus {
  if (journey.finishedAt) return "completed";
  if (journey.abandonedAt) return "abandoned";
  return "in-progress";
}

export interface JourneyPlace {
  product: { id: string; name: string };
  path: { id: string; name: string };
  journeyId: string;
  status: JourneyStatus;
}

/** A Journey page's trail (#198): Products › Product › Paths › Path › {state} Journey. */
export function journeyBreadcrumbs({
  product,
  path,
  status,
}: JourneyPlace): BreadcrumbsProps {
  return {
    trail: [
      { label: "Products", href: "/app" },
      { label: product.name, href: `/app/products/${product.id}` },
      { label: "Paths", href: `/app/products/${product.id}/journeys` },
      {
        label: path.name,
        href: `/app/paths/${path.id}`,
      },
    ],
    current: JOURNEY_CRUMB[status],
  };
}

/** A Worksheet page's trail: the Journey page's, then the Worksheet. */
export function journeyWorksheetBreadcrumbs(
  place: JourneyPlace,
  worksheetName: string,
): BreadcrumbsProps {
  const { trail, current } = journeyBreadcrumbs(place);
  return {
    trail: [
      ...trail,
      {
        label: current,
        href: `/app/products/${place.product.id}/journeys/${place.journeyId}`,
      },
    ],
    current: worksheetName,
  };
}
