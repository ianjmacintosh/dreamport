import { useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";

import { authClient } from "./auth-client";

const SIGN_OUT_FAILED = "We couldn't sign you out. Try again in a moment.";
const CONNECTION_FAILED =
  "Something went wrong. Check your connection and try again.";

/**
 * Sign the User out, then land on `/` — the handler behind `AppNav`'s Log
 * out, shared by both layouts that render `AppNav`: `_appShell` (every
 * signed-in page) and `_withFooter` (a signed-out page visited while signed
 * in, #121). `AppNav` itself stays presentational (an `onLogout` callback)
 * since this needs `useNavigate`/`useRouter`/`authClient`, all of which
 * only work rendered under the real router.
 *
 * `error` is the message to show when sign-out fails, or "" otherwise.
 */
export function useSignOut() {
  const navigate = useNavigate();
  const router = useRouter();
  const [error, setError] = useState("");

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

  return { signOut, error };
}
