import { createFileRoute, redirect } from "@tanstack/react-router";
import { PathIcon } from "@phosphor-icons/react";

import ActionCard from "../../components/ActionCard";
import type { BreadcrumbsProps } from "../../components/Breadcrumbs";
import Link from "../../components/Link";

/** A Path as `/api/products/:productId/pathfinder` lists it. */
interface FollowablePath {
  id: string;
  name: string;
  /** The Product's Journey in progress on it, if there is one. */
  journeyId: string | null;
  /** How the Product's latest other Journey on it ended, if it has one. */
  lastEnded: "completed" | "abandoned" | null;
}

// Filename note: `$productId_` makes this a sibling of the Product home
// rather than its child; see the Journey page's own header comment.
export const Route = createFileRoute(
  "/_appShell/app_/products/$productId_/pathfinder",
)({
  beforeLoad: async ({ params }) => {
    // Not signed in, not this User's Product, offline: back to `/app`, the
    // same convention as the Product home.
    const res = await fetch(
      `/api/products/${params.productId}/pathfinder`,
    ).catch(() => null);
    if (!res || !res.ok) {
      throw redirect({ to: "/app" });
    }
    const { product, paths } = (await res.json()) as {
      product: { id: string; name: string };
      paths: FollowablePath[];
    };
    return {
      product,
      paths,
      breadcrumbs: {
        trail: [
          { label: "Products", href: "/app" },
          { label: product.name, href: `/app/products/${product.id}` },
          { label: "Paths", href: `/app/products/${product.id}/journeys` },
        ],
        current: "Browse Available Paths",
      } satisfies BreadcrumbsProps,
    };
  },
  component: Pathfinder,
});

/**
 * Pathfinder (#170), titled "Browse Available Paths" under the Product's
 * Paths (#198): every Path this Product can follow, Dream Sequence
 * first, then the User's own Paths that have a saved version. Each is an
 * `ActionCard` link to its Trailhead, or, when the Product has a Journey
 * in progress on it, to that Journey, marked "Following", so the list never
 * invites a second start. One the Product has followed before, but isn't
 * now, says how its latest Journey on it ended, "Completed" or
 * "Abandoned", and goes to its Trailhead, to start again (#172). Below,
 * "Make Your Own Path" links to Trailblazer.
 */
function Pathfinder() {
  const { product, paths } = Route.useRouteContext();
  return (
    <>
      <h1>{product.name}</h1>
      <h2>Browse Available Paths</h2>
      <ul className="action-card-list">
        {paths.map((path) => (
          <li key={path.id}>
            <ActionCard
              href={
                path.journeyId
                  ? `/app/products/${product.id}/journeys/${path.journeyId}`
                  : `/app/products/${product.id}/paths/${path.id}/trailhead`
              }
              icon={PathIcon}
              trailing={
                path.journeyId ? (
                  <ActionCard.Status>Following</ActionCard.Status>
                ) : (
                  path.lastEnded && (
                    <ActionCard.Status>
                      {path.lastEnded === "completed"
                        ? "Completed"
                        : "Abandoned"}
                    </ActionCard.Status>
                  )
                )
              }
            >
              {path.name}
            </ActionCard>
          </li>
        ))}
      </ul>
      <h3>Make Your Own Path</h3>
      <p>
        Not finding a Path that does quite what you need?{" "}
        <Link href="/app/paths">Make your own Path</Link>
      </p>
    </>
  );
}
