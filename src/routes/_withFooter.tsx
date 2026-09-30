import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

import AppNav from "../components/AppNav";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useSignOut } from "../utils/use-sign-out";

/**
 * The shell for the signed-out pages (`/`, `/about`, `/privacy`, `/terms`,
 * `/login`). Anyone can visit them, signed in or not, so the chrome follows
 * the session (#121): signed out gets `Header` and the marketing `Footer`;
 * signed in gets the same `AppNav` and in-app `Footer` as `_appShell`, so
 * following Privacy Policy from inside the app doesn't look like you were
 * signed out.
 *
 * Same `/api/me` check as `_appShell`, minus the redirect — anything short
 * of a clean 200 just means signed-out chrome. It's resolved here in
 * `beforeLoad` rather than after render so the wrong header never flashes
 * first. `email` is `null` when signed out.
 */
export const Route = createFileRoute("/_withFooter")({
  beforeLoad: async () => {
    const res = await fetch("/api/me").catch(() => null);
    if (!res || !res.ok) {
      return { email: null };
    }
    const { email } = (await res.json()) as { email: string };
    return { email };
  },
  component: WithFooterLayout,
});

function WithFooterLayout() {
  const { email } = Route.useRouteContext();
  const { pathname } = useLocation();
  const { signOut, error } = useSignOut();

  if (email) {
    return (
      <>
        <AppNav
          email={email}
          onLogout={() => void signOut()}
          pathname={pathname}
        />
        {error && <p role="alert">{error}</p>}
        <main>
          <Outlet />
        </main>
        <Footer />
      </>
    );
  }

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
