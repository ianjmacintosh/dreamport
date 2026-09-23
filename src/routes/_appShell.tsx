import { useState } from "react";
import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";

import AppNav from "../components/AppNav";
import Footer from "../components/Footer";
import { authClient } from "../utils/auth-client";

const SIGN_OUT_FAILED = "We couldn't sign you out. Try again in a moment.";
const CONNECTION_FAILED =
  "Something went wrong. Check your connection and try again.";

/**
 * The shell every signed-in page (`/app`, `/app/settings`, …) renders
 * inside of: `AppNav` up top, `Footer` at the bottom, same as `_withFooter`
 * does for the signed-out marketing pages — but with `AppNav` instead of
 * `Header`, since a signed-in page shows who you are and a way out, not a
 * "Log in" button (#90 Q2/design-decisions.md).
 *
 * The `/api/me` guard that used to live separately in `/app` and
 * `/app/settings` moves up here — both pages needed it, and `AppNav` needs
 * the email either way, so one check replaces the two duplicate ones. Same
 * UX-affordance-only caveat as before: `/api/me` verifies the session
 * against the database on its own, so this redirect is never the security
 * boundary, and anything short of a clean 200 (no session, offline, a
 * transient error) bounces to `/login` rather than a dead-end error screen.
 *
 * `/login` stays under `_layout` instead, on its own — it's signed-out, so
 * it has no session to show and no nav to render.
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
  const navigate = useNavigate();
  const router = useRouter();
  const [error, setError] = useState("");

  // Sign-out used to be its own button on `/app/settings` (#26); it moved
  // to `AppNav` so every signed-in page carries the same way out, rather
  // than only the one page that happened to grow it first. `AppNav` itself
  // stays presentational (an `onLogout` callback) rather than owning this
  // directly, since it needs `useNavigate`/`useRouter`/`authClient`, all of
  // which only work rendered under the real router.
  async function signOut() {
    setError("");
    try {
      const { error } = await authClient.signOut();
      if (error) {
        setError(SIGN_OUT_FAILED);
        return;
      }
      // `/` is the genuine signed-out state (the homepage has its own way
      // into `/login` since #50). Invalidate first so no stale route
      // context keeps rendering a signed-in view.
      void router.invalidate();
      void navigate({ to: "/" });
    } catch {
      setError(CONNECTION_FAILED);
    }
  }

  return (
    <>
      <AppNav email={email} onLogout={() => void signOut()} />
      {error && <p role="alert">{error}</p>}
      <main>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
