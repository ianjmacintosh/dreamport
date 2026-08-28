import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_withFooter/")({
  component: Home,
});

function Home() {
  return (
    <>
      <h1 className="text-hero">Dreamport</h1>
      <h2>Keep dreaming, keep building</h2>

      <p className="text-2xl">
        Dreamport is a free tool to put your product ideas in order.
      </p>
      <p className="text-2xl">
        Record your ideas and refine them with as much or as little structure as
        you want. Add details however you like, organize your thoughts by topic
        (like style, pricing, staff, or distribution), follow exercises to push
        your concept to the next level.
      </p>
      <p className="text-2xl">
        For more structure, buy paid toolsets and programs built around specific
        proven methodologies like <strong>Build-Measure-Learn</strong> or{" "}
        <strong>Lean Analytics</strong> with guard rails to keep you on track
        and on schedule.
      </p>
      <p className="text-2xl">The best time to start is now. Start now.</p>
    </>
  );
}
