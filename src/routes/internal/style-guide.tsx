import { createFileRoute } from "@tanstack/react-router";

import StyleGuide from "../../components/StyleGuide";

export const Route = createFileRoute("/internal/style-guide")({
  component: StyleGuide,
});
