import {
  createFileRoute,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";

import Header from "../components/Header";
import Footer from "../components/Footer";

export const Route = createFileRoute("/_withFooter")({
  component: WithFooterLayout,
});

function WithFooterLayout() {
  // `location` updates the instant a navigation is requested, ahead of the
  // route swap — reading it directly caused a brief flash where this
  // (`_withFooter`) layout re-rendered with the destination's pathname (e.g.
  // `/login`, which has no header) just before `/login`'s own header-less
  // layout mounted and unmounted this one. `resolvedLocation` only updates
  // once the destination has actually finished loading and rendered, so it
  // tracks what's on screen rather than what's pending.
  const pathname = useRouterState({
    select: (s) => (s.resolvedLocation ?? s.location).pathname,
  });

  return (
    <>
      <Header showWordmark={pathname !== "/"} />
      <main>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
