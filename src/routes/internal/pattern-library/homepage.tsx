import { createFileRoute } from "@tanstack/react-router";

import Homepage from "../../../components/PatternLibrary/Homepage";

export const Route = createFileRoute("/internal/pattern-library/homepage")({
  component: Homepage,
});
