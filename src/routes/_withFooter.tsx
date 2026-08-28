import { createFileRoute, Outlet } from "@tanstack/react-router";

import Footer from "../components/Footer";

export const Route = createFileRoute("/_withFooter")({
  component: WithFooterLayout,
});

function WithFooterLayout() {
  return (
    <>
      <main>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
