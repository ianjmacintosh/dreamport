import { createFileRoute } from "@tanstack/react-router";

import Link from "../../components/Link";

export const Route = createFileRoute("/_withFooter/")({
  component: Home,
});

function Home() {
  return (
    <>
      <h1 className="text-hero">Keep dreaming, keep building</h1>

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
        For more structure follow our free path with milestones and worksheets
        to keep you on track.
      </p>
      <p className="text-2xl">
        The best time to start is now. <Link href="/login">Start now</Link>.
      </p>
    </>
  );
}
