import { useState } from "react";
import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";

import Button from "../../components/Button";
import { authClient } from "../../utils/auth-client";

export const Route = createFileRoute("/_layout/app")({
  beforeLoad: async () => {
    const res = await fetch("/api/me").catch(() => null);

    // Client-side route guard — a UX affordance only. `/api/me` verifies the
    // session against the database on its own, so this redirect is never the
    // security boundary. Anything short of a clean 200 (no session, offline,
    // a transient error) bounces to `/login` rather than a dead-end error
    // screen; a proper retry/error state is deferred to #28.
    //
    // TanStack Router's authenticated-routes guide runs the check here in
    // `beforeLoad` and threads the result through route `context`.
    if (!res || !res.ok) {
      throw redirect({ to: "/login" });
    }

    const { email } = (await res.json()) as { email: string };
    return { email };
  },
  component: App,
});

/** Which state the delete-account control is in. */
type DeleteStep = "resting" | "confirming" | "sent";

const SIGN_OUT_FAILED = "We couldn't sign you out. Try again in a moment.";
const DELETE_REQUEST_FAILED =
  "We couldn't start account deletion. Try again in a few minutes.";
const CONNECTION_FAILED =
  "Something went wrong. Check your connection and try again.";

/**
 * The first authenticated page: it says who you are, and offers the two
 * account-lifecycle actions from issue #26 — sign out, and delete account.
 *
 * Composed from `Button` plus heading/paragraph primitives in plain document
 * order: no page-specific CSS, no confirm-dialog or "danger zone" component
 * (that would need design sign-off, #28-adjacent). The delete control is a
 * two-step reveal rather than a native `confirm()` so a stray click can't
 * start an irreversible flow; the emailed link is the real confirmation.
 *
 * A failed sign-out or deletion request surfaces a bare line of error text —
 * enough that a throttled (429) or backend-down request doesn't look like it
 * worked. The styled error treatment and button loading states are #28, same
 * as `/login`.
 */
function App() {
  const { email } = Route.useRouteContext();
  const navigate = useNavigate();
  const router = useRouter();
  const [deleteStep, setDeleteStep] = useState<DeleteStep>("resting");
  const [error, setError] = useState("");

  async function signOut() {
    setError("");
    try {
      const { error } = await authClient.signOut();
      if (error) {
        setError(SIGN_OUT_FAILED);
        return;
      }
      // `/` is the genuine signed-out state (the homepage has its own way into
      // `/login` since #50). Invalidate first so no stale route context keeps
      // rendering "signed in as".
      void router.invalidate();
      void navigate({ to: "/" });
    } catch {
      setError(CONNECTION_FAILED);
    }
  }

  async function requestDeletion() {
    setError("");
    try {
      const { error } = await authClient.deleteUser({ callbackURL: "/" });
      if (error) {
        // Stay on the confirm step — nothing was sent.
        setError(DELETE_REQUEST_FAILED);
        return;
      }
      setDeleteStep("sent");
    } catch {
      setError(CONNECTION_FAILED);
    }
  }

  return (
    <>
      <p>signed in as {email}</p>

      <h2>Sign out</h2>
      <Button onClick={() => void signOut()}>Sign out</Button>

      <h2>Delete account</h2>
      {deleteStep === "resting" && (
        <Button
          variant="secondary"
          onClick={() => {
            setError("");
            setDeleteStep("confirming");
          }}
        >
          Delete account
        </Button>
      )}
      {deleteStep === "confirming" && (
        <>
          <p>
            This permanently deletes your account and everything in it. We'll
            email you a link to confirm.
          </p>
          <Button variant="primary" onClick={() => void requestDeletion()}>
            Email me a deletion link
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setError("");
              setDeleteStep("resting");
            }}
          >
            Cancel
          </Button>
        </>
      )}
      {deleteStep === "sent" && (
        <p>
          Check your email for a link to finish deleting your account. The link
          expires in 24 hours.
        </p>
      )}

      {error && <p role="alert">{error}</p>}
    </>
  );
}
