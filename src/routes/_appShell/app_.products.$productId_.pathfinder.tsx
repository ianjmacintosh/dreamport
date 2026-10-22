import { createFileRoute, redirect } from "@tanstack/react-router";

// Pathfinder moved off the Product to `/app/paths` (#192), so a link from
// before still lands.
export const Route = createFileRoute(
  "/_appShell/app_/products/$productId_/pathfinder",
)({
  beforeLoad: () => {
    throw redirect({ to: "/app/paths" });
  },
});
