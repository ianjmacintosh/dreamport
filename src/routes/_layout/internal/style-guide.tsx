import { createFileRoute } from "@tanstack/react-router";

import StyleGuide from "../../../components/StyleGuide";

export const Route = createFileRoute("/_layout/internal/style-guide")({
  component: StyleGuide,
});
