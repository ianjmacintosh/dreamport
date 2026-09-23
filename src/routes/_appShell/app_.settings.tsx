import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import Button from "../../components/Button";
import Link from "../../components/Link";
import { authClient } from "../../utils/auth-client";

// Filename note: `app_.settings.tsx`, not `app.settings.tsx` or
// `app/settings.tsx`. TanStack Router's file-based routing treats a plain
// `app.settings.tsx` (or an `app/` directory) as *nested* under `app.tsx`'s
// layout — since `app.tsx` renders no `<Outlet />`, this page would then
// never actually render, even though the URL updates correctly. The
// trailing underscore on `app_` is the documented escape hatch: same
// `/app/settings` path, but a sibling of `/app` rather than its child. See
// https://tanstack.com/router/latest/docs/framework/react/routing/file-naming-conventions#non-nested-routes
export const Route = createFileRoute("/_appShell/app_/settings")({
  component: Settings,
});

/** Which state the delete-account control is in. */
type DeleteStep = "resting" | "confirming" | "sent";

const DELETE_REQUEST_FAILED =
  "We couldn't start account deletion. Try again in a few minutes.";
const CONNECTION_FAILED =
  "Something went wrong. Check your connection and try again.";

/**
 * Account-lifecycle actions from issue #26 — sign out, and delete account —
 * split off `/app` onto their own page so `/app` stays about the Products
 * list, not account management. Sign out itself moved on to `AppNav` (#90)
 * — every signed-in page carries that action now, not just this one — so
 * this page is delete-account only.
 *
 * Composed from `Button`/`Link` plus heading/paragraph primitives in plain
 * document order: no page-specific CSS, no confirm-dialog or "danger zone"
 * component (that would need design sign-off, #28-adjacent). The delete
 * control is a two-step reveal rather than a native `confirm()` so a stray
 * click can't start an irreversible flow; the emailed link is the real
 * confirmation.
 *
 * A failed deletion request surfaces a bare line of error text — enough
 * that a throttled (429) or backend-down request doesn't look like it
 * worked.
 *
 * Shows the signed-in email itself, too (#90) — `AppNav`'s own copy hides
 * below 640px (no dropdown variant exists yet to tuck it behind), so this
 * page is where a narrow-screen visitor can still find their address.
 */
function Settings() {
  const { email } = Route.useRouteContext();
  const [deleteStep, setDeleteStep] = useState<DeleteStep>("resting");
  const [error, setError] = useState("");

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
      <h1>Settings</h1>
      <p>Signed in as {email}</p>

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

      <p>
        <Link href="/app">Back to Products</Link>
      </p>
    </>
  );
}
