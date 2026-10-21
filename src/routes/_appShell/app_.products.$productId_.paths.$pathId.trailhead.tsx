import { createFileRoute, redirect } from "@tanstack/react-router";

// The Trailhead moved to the Path (#205), so a link from before still lands.
export const Route = createFileRoute(
  "/_appShell/app_/products/$productId_/paths/$pathId/trailhead",
)({
  validateSearch: (search: Record<string, unknown>): { version?: number } =>
    typeof search.version === "number" ? { version: search.version } : {},
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/app/paths/$pathId",
      params: { pathId: params.pathId },
      search: { version: search.version },
    });
  },
});
