import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/app")({
  loader: async () => {
    const res = await fetch("/api/me").catch(() => null);

    // Client-side route guard — a UX affordance only. `/api/me` verifies the
    // session against the database on its own, so this redirect is never the
    // security boundary. Anything short of a clean 200 (no session, offline,
    // a transient error) bounces to `/login` rather than a dead-end error
    // screen; a proper retry/error state is deferred to #28.
    if (!res || !res.ok) {
      throw redirect({ to: "/login" });
    }

    const { email } = (await res.json()) as { email: string };
    return { email };
  },
  component: App,
});

/** The first authenticated page: it says who you are and nothing else. */
function App() {
  const { email } = Route.useLoaderData();
  return <p>signed in as {email}</p>;
}
