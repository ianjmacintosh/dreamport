import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Prototype, validateProtoSearch } from "./-prototype-added-copy";

import type { BreadcrumbsProps } from "../../components/Breadcrumbs";

// Filename note: `$productId_` makes this a sibling of the Product home
// rather than its child; see the Journey page's own header comment.
// PROTOTYPE (#192): stubbed; renders -prototype-added-copy.tsx. Never merge.
export const Route = createFileRoute(
  "/_appShell/app_/products/$productId_/pathfinder",
)({
  validateSearch: validateProtoSearch,
  beforeLoad: () => ({
    breadcrumbs: {
      trail: [
        { label: "Products", href: "/app" },
        { label: "Tarot", href: "/app" },
        { label: "Paths", href: "/app" },
      ],
      current: "Browse Available Paths",
    } satisfies BreadcrumbsProps,
  }),
  component: PrototypePathfinder,
});

function PrototypePathfinder() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <Prototype
      page="Pathfinder"
      search={search}
      setSearch={(next) => void navigate({ search: next, replace: true })}
    />
  );
}
