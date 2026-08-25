import { createFileRoute } from "@tanstack/react-router";

import PatternLibrary from "../../../components/PatternLibrary";

export const Route = createFileRoute("/internal/pattern-library/")({
  component: PatternLibrary,
});
