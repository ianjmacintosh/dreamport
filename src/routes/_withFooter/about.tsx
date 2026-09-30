import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_withFooter/about")({
  component: About,
});

/** Stand-in until Ian writes the real About copy (#121) — brand voice, not
 * something to guess at. */
function About() {
  return (
    <>
      <h1>About Dreamport</h1>
      <p>[Ian: About page content pending]</p>
    </>
  );
}
