import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import Button from "../../components/Button";
import Notice from "../../components/Notice";
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
 * Composed from `Button` plus heading/paragraph primitives in plain
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
 * Shows the signed-in email itself, too (#90) — `AppNav`'s account
 * `Dropdown` trigger truncates a long address on a narrow screen (#119), so
 * this page is where a visitor can always read it in full.
 */
function Settings() {
  const { email, guide } = Route.useRouteContext();
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

      {guide && <GettingPaid />}

      <h2>Delete account</h2>
      {deleteStep === "resting" && (
        <Button
          variant="secondary"
          onClick={() => {
            setError("");
            setDeleteStep("confirming");
          }}
        >
          Delete Account
        </Button>
      )}
      {deleteStep === "confirming" && (
        <>
          <p>
            This permanently deletes your account and everything in it. We'll
            email you a link to confirm.
          </p>
          <Button variant="primary" onClick={() => void requestDeletion()}>
            Email Me a Deletion Link
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

/** Where the Guide's Stripe account stands, as `GET /api/stripe/connect` says (#230). */
type ConnectStatus =
  | "unavailable"
  | "not-started"
  | "incomplete"
  | "ready"
  | "gone";

const CONNECT_FAILED = "We couldn't reach Stripe. Try again in a few minutes.";

/**
 * A Guide's Stripe account (#230): connect one, finish onboarding, or
 * replace one Stripe closed. Hidden where selling isn't available. Stripe's
 * onboarding sends the Guide back here, so the status is read fresh each
 * time the page loads.
 */
function GettingPaid() {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    fetch("/api/stripe/connect")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { status: ConnectStatus } | null) => {
        if (current) setStatus(body?.status ?? "unavailable");
      })
      .catch(() => {
        if (current) setStatus("unavailable");
      });
    return () => {
      current = false;
    };
  }, []);

  async function connect() {
    setError("");
    setConnecting(true);
    try {
      const res = await withMinimumDuration(() =>
        fetch("/api/stripe/connect", { method: "POST" }),
      );
      if (!res.ok) {
        setError(CONNECT_FAILED);
        setConnecting(false);
        return;
      }
      const { url } = (await res.json()) as { url: string };
      // Stays "Connecting…" while the browser leaves for Stripe.
      window.location.assign(url);
    } catch {
      setError(CONNECTION_FAILED);
      setConnecting(false);
    }
  }

  if (status === null || status === "unavailable") return null;

  const label = {
    "not-started": "Connect Stripe",
    incomplete: "Continue on Stripe",
    gone: "Connect a New Stripe Account",
    ready: "",
  }[status];

  return (
    <>
      <h2>Getting paid</h2>
      {status === "not-started" && (
        <p>
          Connect a Stripe account to be paid for your Paths. Stripe asks for
          your details and a bank account.
        </p>
      )}
      {status === "incomplete" && (
        <Notice>
          <p>Stripe needs more details before it can pay you.</p>
          <p>Pick up where you left off.</p>
        </Notice>
      )}
      {status === "gone" && (
        <Notice>
          <p>Your Stripe account is no longer active.</p>
          <p>Connect a new one to be paid for your Paths.</p>
        </Notice>
      )}
      {status === "ready" && (
        <p>Your Stripe account is connected and ready to be paid.</p>
      )}
      {label && (
        <div className="button-group button-group--end">
          <Button
            variant="primary"
            disabled={connecting}
            onClick={() => void connect()}
          >
            {connecting ? "Connecting…" : label}
          </Button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}

/**
 * Runs `fn`, then waits out the rest of `minMs`, so a pending button state
 * is perceivable rather than a flicker (docs/adr/0013). Same helper `/app`
 * and the Product pages each keep a copy of.
 */
async function withMinimumDuration<T>(
  fn: () => Promise<T>,
  minMs = 400,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await fn();
  } finally {
    const remaining = minMs - (Date.now() - startedAt);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }
}
