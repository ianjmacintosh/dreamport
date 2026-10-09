import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
  useMatches,
} from "@tanstack/react-router";

import AppNav from "../components/AppNav";
import Breadcrumbs from "../components/Breadcrumbs";
import Footer from "../components/Footer";
import { useSignOut } from "../utils/use-sign-out";

/**
 * The shell every signed-in page (`/app`, `/app/settings`, …) renders
 * inside of: `AppNav` up top, `Footer` at the bottom, same as `_withFooter`
 * does for the signed-out marketing pages — but with `AppNav` instead of
 * `Header`, since a signed-in page shows who you are and a way out, not a
 * "Log In" button (#90 Q2/design-decisions.md), and the quieter `"app"`
 * `Footer` instead of the marketing one (#121).
 *
 * The `/api/me` guard that used to live separately in `/app` and
 * `/app/settings` moves up here — both pages needed it, and `AppNav` needs
 * the email either way, so one check replaces the two duplicate ones. Same
 * UX-affordance-only caveat as before: `/api/me` verifies the session
 * against the database on its own, so this redirect is never the security
 * boundary, and anything short of a clean 200 (no session, offline, a
 * transient error) bounces to `/login` rather than a dead-end error screen.
 *
 * The signed-out pages (`/`, `/about`, `/privacy`, `/terms`, `/login`)
 * render under `_withFooter` instead, which shows this same `AppNav` and
 * in-app `Footer` when it finds a session, without the redirect (#121).
 */
export const Route = createFileRoute("/_appShell")({
  beforeLoad: async ({ location }) => {
    // `/app`'s own beforeLoad also needs its Products list. TanStack
    // Router's beforeLoad chain runs parent-then-child in sequence, not in
    // parallel — awaiting this layout's own `/api/me` call before `/app`'s
    // beforeLoad even started would serialize the two requests, undoing the
    // deliberate `Promise.all` optimization the single-route version of
    // this code used to have. Kicking the products fetch off here instead,
    // ahead of the `/api/me` await below, keeps them concurrent; `/app`
    // then just awaits the pending promise handed down through context
    // rather than starting a fresh request. Gated to `/app` specifically —
    // `/app/settings` has no use for it and shouldn't pay for the fetch.
    const productsPromise =
      location.pathname === "/app"
        ? fetch("/api/products").catch(() => null)
        : null;

    const res = await fetch("/api/me").catch(() => null);
    if (!res || !res.ok) {
      throw redirect({ to: "/login" });
    }
    const { email } = (await res.json()) as { email: string };
    return { email, productsPromise };
  },
  component: AppShellLayout,
});

function AppShellLayout() {
  const { email } = Route.useRouteContext();
  const { pathname } = useLocation();
  // Sign-out used to be its own button on `/app/settings` (#26); it moved
  // to `AppNav` so every signed-in page carries the same way out.
  const { signOut, error } = useSignOut();
  // A nested page names its own trail in its route context (`breadcrumbs`);
  // drawn here so the band sits under `AppNav`, outside <main> (#109).
  const breadcrumbs = useMatches({
    select: (matches) => {
      const context = matches[matches.length - 1]?.context;
      return context && "breadcrumbs" in context
        ? context.breadcrumbs
        : undefined;
    },
  });

  return (
    <>
      {/* One #root grid row for the bar and its band, so <main> keeps the
          stretching row. */}
      <div>
        <AppNav
          email={email}
          onLogout={() => void signOut()}
          pathname={pathname}
        />
        {breadcrumbs && <Breadcrumbs {...breadcrumbs} />}
      </div>
      {error && <p role="alert">{error}</p>}
      <main>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
