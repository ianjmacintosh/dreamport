import { useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

import Button from "../../components/Button";
import Link from "../../components/Link";
import TextInput from "../../components/TextInput";

export const Route = createFileRoute("/_layout/login")({
  component: Login,
});

/** Which of the two steps the form is on. */
type Step = "email" | "code";

/**
 * Cloudflare Turnstile site key — public, baked into the client bundle at
 * build time, per environment (see docs/deployment.md). If it is missing the
 * widget below cannot render and sign-in is impossible, so leave a breadcrumb
 * for whoever is looking at a broken deploy.
 */
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
if (!TURNSTILE_SITE_KEY) {
  console.error(
    "VITE_TURNSTILE_SITE_KEY is not set — the sign-in challenge cannot " +
      "render. Set it as a build variable for this environment (see " +
      "docs/deployment.md).",
  );
}

const NETWORK_ERROR =
  "Something went wrong. Check your connection and try again.";
const TURNSTILE_INCOMPLETE = "Complete the challenge, then try again.";
const TURNSTILE_UNAVAILABLE =
  "The challenge didn't load. Reload the page and try again.";
const SIGNIN_UNAVAILABLE =
  "Sign-in is temporarily unavailable. Try again in a few minutes.";

/** POST JSON, returning `null` if the request never reached the server. */
async function postJson(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response | null> {
  try {
    return await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

/**
 * Passwordless sign-in: collect an email, send a one-time code to it, collect
 * the code, and on success let the browser follow the freshly-set session
 * cookie to `/app`.
 *
 * Talks straight to the Better Auth `emailOTP` endpoints under `/api/auth/*`.
 * The send-OTP call is gated by a Cloudflare Turnstile challenge (`@marsidev/
 * react-turnstile`): the widget token rides in the `x-turnstile-token` header
 * and the Worker verifies it server-side before any code is issued (#23).
 * Turnstile tokens are single-use, so the widget lives only on the email step
 * and is re-armed after a send that actually consumed the token (a 503 from
 * the gate hasn't — it rejects before verifying); "Request a new code"
 * returns to the email step for a fresh challenge.
 *
 * Composed only from `TextInput` / `Button` / `Link` / a heading plus the
 * Turnstile widget, with a bare line of error text — the error banner, narrow
 * centred layout, and button loading/disabled states are left to the
 * design-system pass (#28).
 */
function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined);
  // Guards against a double submit (Enter + click) sending the single-use
  // token twice; the second request would fail siteverify. Not a visual
  // disabled state — that is #28.
  const sendingRef = useRef(false);

  /** Drop the current token and make the widget fetch a fresh one. */
  function rearmTurnstile() {
    setTurnstileToken("");
    turnstileRef.current?.reset();
  }

  async function sendCode() {
    if (sendingRef.current) return;
    setError("");
    if (!turnstileToken) {
      setError(TURNSTILE_INCOMPLETE);
      return;
    }
    sendingRef.current = true;
    try {
      const res = await postJson(
        "/api/auth/email-otp/send-verification-otp",
        { email, type: "sign-in" },
        { "x-turnstile-token": turnstileToken },
      );

      if (!res) {
        setError(NETWORK_ERROR);
        rearmTurnstile();
        return;
      }
      if (res.ok) {
        setCode("");
        setStep("code"); // the widget unmounts with the email step
        return;
      }
      if (res.status === 503) {
        // The gate rejected before verifying, so the token is still good —
        // keep it and let the user retry once the backend is back.
        setError(SIGNIN_UNAVAILABLE);
        return;
      }
      // Verification ran: the token is spent. Re-arm for a retry.
      rearmTurnstile();
      setError("We couldn't send a code. Check the address and try again.");
    } finally {
      sendingRef.current = false;
    }
  }

  async function verifyCode() {
    setError("");
    const res = await postJson("/api/auth/sign-in/email-otp", {
      email,
      otp: code,
    });
    if (!res) {
      setError(NETWORK_ERROR);
      return;
    }
    if (!res.ok) {
      setError("That code didn't work. Request a new one and try again.");
      return;
    }
    navigate({ to: "/app" });
  }

  return (
    <>
      <h1>Sign in</h1>

      {step === "email" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendCode();
          }}
        >
          <TextInput
            id="email"
            label="Email address"
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Turnstile
            ref={turnstileRef}
            siteKey={TURNSTILE_SITE_KEY}
            onSuccess={(token) => setTurnstileToken(token)}
            onExpire={() => setTurnstileToken("")}
            onError={() => {
              setTurnstileToken("");
              setError(TURNSTILE_UNAVAILABLE);
            }}
          />
          <Button type="submit">Send code</Button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verifyCode();
          }}
        >
          <p>We sent a six-digit code to {email}.</p>
          <TextInput
            id="code"
            label="Six-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <Button type="submit">Verify and sign in</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setError("");
              setStep("email");
            }}
          >
            Request a new code
          </Button>
        </form>
      )}

      {error && <p role="alert">{error}</p>}

      <p>
        <Link href="/">Back to home</Link>
      </p>
    </>
  );
}
