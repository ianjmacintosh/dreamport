import { createFileRoute, Outlet } from "@tanstack/react-router";

import Header from "../components/Header";
import Footer from "../components/Footer";

export const Route = createFileRoute("/_withFooter")({
  component: WithFooterLayout,
});

function WithFooterLayout() {
  return (
    <>
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer variant="marketing" />
    </>
  );
}
