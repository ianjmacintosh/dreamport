import { createFileRoute, redirect } from "@tanstack/react-router";
import { PathIcon } from "@phosphor-icons/react";

import ActionCard from "../../components/ActionCard";
import type { BreadcrumbsProps } from "../../components/Breadcrumbs";
import Link from "../../components/Link";

/** A Path as `/api/products/:productId/pathfinder` lists it. */
interface FollowablePath {
  id: string;
  name: string;
  /** Whether the Product already has a Journey on it. */
  following: boolean;
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
        ],
        current: "Pathfinder",
      } satisfies BreadcrumbsProps,
    };
  },
  component: Pathfinder,
});

/**
 * Pathfinder (#170): every Path this Product can follow, Dream Sequence
 * first, then the User's own Paths that have a saved version. Each is an
 * `ActionCard` link to its Trailhead, marked "Following" when the Product
 * already has a Journey on it. Below, a quiet link to Trailblazer for
 * making another.
 */
function Pathfinder() {
  const { product, paths } = Route.useRouteContext();
  return (
    <>
      <h1>{product.name}</h1>
      <h2>Pathfinder</h2>
      <ul className="action-card-list">
        {paths.map((path) => (
          <li key={path.id}>
            <ActionCard
              href={`/app/products/${product.id}/paths/${path.id}/trailhead`}
              leading={<PathIcon weight="bold" aria-hidden="true" />}
              trailing={
                path.following && (
                  <ActionCard.Status>Following</ActionCard.Status>
                )
              }
            >
              {path.name}
            </ActionCard>
          </li>
        ))}
      </ul>
      <p>
        <Link href="/app/paths" className="link-quiet">
          Make your own Path in Trailblazer
        </Link>
      </p>
    </>
  );
}
