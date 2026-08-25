import { createFileRoute } from "@tanstack/react-router";

import PatternLibrary from "../../../../components/PatternLibrary";

export const Route = createFileRoute("/_layout/internal/pattern-library/")({
  component: PatternLibrary,
});
