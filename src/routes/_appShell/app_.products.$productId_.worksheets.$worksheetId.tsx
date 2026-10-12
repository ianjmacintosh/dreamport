import { createFileRoute, redirect } from "@tanstack/react-router";

// A Worksheet's old address, from before its URL named the Journey it's on
// (#170). It doesn't say which Journey, so a bookmark lands on the
// Journeys page.
export const Route = createFileRoute(
  "/_appShell/app_/products/$productId_/worksheets/$worksheetId",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/app/products/$productId/journeys",
      params: { productId: params.productId },
    });
  },
});
