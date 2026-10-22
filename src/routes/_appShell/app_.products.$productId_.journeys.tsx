import { createFileRoute, redirect } from "@tanstack/react-router";
import { CompassIcon } from "@phosphor-icons/react";

import ActionCard from "../../components/ActionCard";
import type { BreadcrumbsProps } from "../../components/Breadcrumbs";
import Link from "../../components/Link";

/** A Journey as `/api/products/:productId/journeys` lists it (see `JourneySummary` in `src/worker/journeys.ts`). */
interface JourneySummary {
  id: string;
  pathName: string;
  status: "in-progress" | "completed" | "abandoned";
}

/** What a Journey's card says it is (#172). */
const STATUS_LABEL = {
  "in-progress": "In Progress",
  completed: "Completed",
  abandoned: "Abandoned",
} as const;

// Filename note: `$productId_` makes this a sibling of the Product home
// rather than its child; see the Journey page's own header comment.
export const Route = createFileRoute(
  "/_appShell/app_/products/$productId_/journeys",
)({
  beforeLoad: async ({ params }) => {
    // Not signed in, not this User's Product, offline: back to `/app`, the
    // same convention as the Product home.
    const res = await fetch(`/api/products/${params.productId}/journeys`).catch(
      () => null,
    );
    if (!res || !res.ok) {
      throw redirect({ to: "/app" });
    }
    const { product, journeys } = (await res.json()) as {
      product: { id: string; name: string };
      journeys: JourneySummary[];
    };
    return {
      product,
      journeys,
      breadcrumbs: {
        trail: [
          { label: "Products", href: "/app" },
          { label: product.name, href: `/app/products/${product.id}` },
        ],
        current: "Paths",
      } satisfies BreadcrumbsProps,
    };
  },
  component: ProductJourneys,
});

/**
 * A Product's Paths page (#170, #198; the URL still says journeys): its
 * Journeys, split into Active Paths (in progress) and Inactive Paths (completed
 * or abandoned), each oldest first and left out when empty (#172). Each is an
 * `ActionCard` link to its Journey page, saying whether it's in progress,
 * completed or abandoned. Below them, "Find More Paths" points to Pathfinder
 * (`/app/paths`), which lists the Paths to start on. With no Journeys yet, the
 * page says so rather than sending the User straight to Pathfinder.
 */
function ProductJourneys() {
  const { product, journeys } = Route.useRouteContext();
  const active = journeys.filter((j) => j.status === "in-progress");
  const inactive = journeys.filter((j) => j.status !== "in-progress");

  const cards = (list: JourneySummary[], labelledBy: string) => (
    <ul className="action-card-list" aria-labelledby={labelledBy}>
      {list.map((journey) => (
        <li key={journey.id}>
          <ActionCard
            href={`/app/products/${product.id}/journeys/${journey.id}`}
            leading={<CompassIcon weight="bold" aria-hidden="true" />}
            trailing={
              <ActionCard.Status>
                {STATUS_LABEL[journey.status]}
              </ActionCard.Status>
            }
          >
            {journey.pathName}
          </ActionCard>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <h1>{product.name}</h1>
      {journeys.length === 0 && (
        <p>This Product is not following any Paths yet.</p>
      )}
      {active.length > 0 && (
        <>
          <h2 id="active-paths">Active Paths</h2>
          {cards(active, "active-paths")}
        </>
      )}
      {inactive.length > 0 && (
        <>
          <h2 id="inactive-paths">Inactive Paths</h2>
          {cards(inactive, "inactive-paths")}
        </>
      )}
      <h2>Find More Paths</h2>
      <p>Pathfinder lists every Path you can follow.</p>
      <p>
        <Link href="/app/paths" className="button button--secondary">
          Open Pathfinder
        </Link>
      </p>
    </>
  );
}
