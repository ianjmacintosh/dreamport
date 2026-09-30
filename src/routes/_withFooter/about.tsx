import { createFileRoute } from "@tanstack/react-router";

import Link from "../../components/Link";

export const Route = createFileRoute("/_withFooter/about")({
  component: About,
});

function About() {
  return (
    <>
      <h1>About Dreamport</h1>

      <p className="text-2xl">
        Dreamport is for anyone who&apos;s ever had a great idea but didn&apos;t
        know what to do with it. Some people store their ideas in a notebook or
        in a file somewhere, while others just let them leave as quick as they
        arrived. Dreamport gives you a platform where you can record your
        product ideas, build out the concepts associated with them, and revisit
        them at your own pace.
      </p>

      <p className="text-2xl">
        If you want more structure, you can follow proven paths with defined
        guard rails and timelines to keep you moving forward. And if you want to
        stop, you can do that too, knowing that all the progress you made is
        stored in place.
      </p>

      <p className="text-2xl">
        It all starts with your product. Give it a name and add a description.
        That&apos;s your starting point to start building out the ideas
        associated with your product. Maybe some of those ideas will be good,
        some will need to be refined, and (for the exceptionally disciplined)
        some will be thrown away entirely. That&apos;s all up to you, but you
        can track them and give them some structure. You can label them by theme
        (like &quot;Pricing&quot; or &quot;Design&quot;), and keep building
        them.
      </p>

      <p className="text-2xl">
        If you&apos;re feeling stuck, you can work through exercises to refine
        your ideas. If you like, you can follow proven methodologies that can
        guide you from your product&apos;s infancy to full maturity. But the
        most important thing is that you get started. Take your first step and{" "}
        <Link href="/login">start now</Link>.
      </p>
    </>
  );
}
