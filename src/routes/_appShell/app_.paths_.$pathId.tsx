import { createFileRoute, redirect } from "@tanstack/react-router";

// A Path has no page of its own yet, only its editor (#170), so its
// address goes there.
export const Route = createFileRoute("/_appShell/app_/paths_/$pathId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/app/paths/$pathId/edit",
      params: { pathId: params.pathId },
    });
  },
});
