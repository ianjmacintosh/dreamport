import { createFileRoute, redirect } from "@tanstack/react-router";

// The one-Journey page's old address, from before a Product could follow
// more than one Path (#170). Kept so a bookmark lands on the Journeys page.
export const Route = createFileRoute(
  "/_appShell/app_/products/$productId_/journey",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/app/products/$productId/journeys",
      params: { productId: params.productId },
    });
  },
});
