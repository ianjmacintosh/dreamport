import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

import Header from "../components/Header";
import Footer from "../components/Footer";

export const Route = createFileRoute("/_withFooter")({
  component: WithFooterLayout,
});

function WithFooterLayout() {
  const { pathname } = useLocation();

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
