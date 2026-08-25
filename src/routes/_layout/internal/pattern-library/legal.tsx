import { createFileRoute } from "@tanstack/react-router";

import Legal from "../../../../components/PatternLibrary/Legal";

export const Route = createFileRoute("/_layout/internal/pattern-library/legal")(
  {
    component: Legal,
  },
);
