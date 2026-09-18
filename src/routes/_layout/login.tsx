import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

import Button from "../../components/Button";
import Link from "../../components/Link";
import TextInput from "../../components/TextInput";
import { authClient } from "../../utils/auth-client";

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

const TURNSTILE_INCOMPLETE = "Complete the challenge, then try again.";
const TURNSTILE_UNAVAILABLE =
  "The challenge didn't load. Reload the page and try again.";
const SIGNIN_UNAVAILABLE =
  "Sign-in is temporarily unavailable. Try again in a few minutes.";
const SEND_FAILED = "We couldn't send a code. Check the address and try again.";
const VERIFY_FAILED = "That code didn't work. Request a new one and try again.";
const CONNECTION_FAILED =
  "Something went wrong. Check your connection and try again.";

/** id of the shared inline error text, referenced by whichever field it
 * currently describes via `aria-describedby`. */
const ERROR_ID = "login-error";

/**
 * Passwordless sign-in: collect an email, send a one-time code to it, collect
 * the code, and on success let the browser follow the freshly-set session
 * cookie to `/app`.
 *
 * Both calls go through the Better Auth browser client (`authClient`), which
 * returns a uniform `{ data, error }` result. The send-OTP call is gated by a
 * Cloudflare Turnstile challenge (`@marsidev/react-turnstile`): the widget
 * token rides in the `x-turnstile-token` header and the Worker verifies it
 * server-side before any code is issued (#23).
 * Turnstile tokens are single-use, so the widget lives only on the email step
 * and is re-armed after a send that actually consumed the token (a 503 from
 * the gate hasn't — it rejects before verifying); "Request a new code"
 * returns to the email step for a fresh challenge.
 *
 * Composed from `TextInput` / `Button` / `Link` / a heading, laid out in the
 * `.form-shell` narrow-column primitive, plus the Turnstile widget in a
 * `.turnstile-container` that reserves its footprint up front. The inline
 * error text is tied to the active field via `aria-describedby` and takes
 * focus on failure; the code field takes focus when the form advances to it
 * (#28).
 */
function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined);
  // Guards both submit handlers against a double submit (Enter + click):
  // sendCode's token is single-use (a second request would fail siteverify),
  // and verifyCode's otp is single-use server-side too. `isSubmitting` drives
  // the visual disabled state — this ref guards reentry synchronously, before
  // that state update has committed.
  const submittingRef = useRef(false);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // Move focus to the code field as soon as the form advances to it.
  useEffect(() => {
    if (step === "code") {
      codeInputRef.current?.focus();
    }
  }, [step]);

  // Move focus to the error text whenever a submission fails. `error` is
  // always cleared to "" before a new attempt (see sendCode/verifyCode), so
  // this fires even when two attempts fail with the same message.
  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);

  /** Drop the current token and make the widget fetch a fresh one. */
  function rearmTurnstile() {
    setTurnstileToken("");
    turnstileRef.current?.reset();
  }

  async function sendCode() {
    if (submittingRef.current) return;
    setError("");
    if (!turnstileToken) {
      setError(TURNSTILE_INCOMPLETE);
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp(
        { email, type: "sign-in" },
        { headers: { "x-turnstile-token": turnstileToken } },
      );

      if (!error) {
        setCode("");
        setStep("code"); // the widget unmounts with the email step
        return;
      }
      if (error.status === 503) {
        // The gate rejected before verifying, so the token is still good —
        // keep it and let the user retry once the backend is back.
        setError(SIGNIN_UNAVAILABLE);
        return;
      }
      // Verification ran, or the token was rejected outright: it is spent.
      rearmTurnstile();
      setError(SEND_FAILED);
    } catch {
      // The client throws only when the request never reached the server, so
      // the token wasn't spent — but re-arm anyway for a clean fresh attempt,
      // and blame the connection rather than the address.
      rearmTurnstile();
      setError(CONNECTION_FAILED);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function verifyCode() {
    if (submittingRef.current) return;
    setError("");
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const { error } = await authClient.signIn.emailOtp({ email, otp: code });
      if (error) {
        setError(VERIFY_FAILED);
        return;
      }
      navigate({ to: "/app" });
    } catch {
      // Thrown only when the request never reached the server — the code may
      // still be good, so point at the connection, not the code.
      setError(CONNECTION_FAILED);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <div className="form-shell">
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
            aria-describedby={error ? ERROR_ID : undefined}
            required
          />
          <div className="turnstile-container">
            <Turnstile
              ref={turnstileRef}
              siteKey={TURNSTILE_SITE_KEY}
              // Server checks this matches (`TURNSTILE_ACTION` in the Worker),
              // so a token minted elsewhere on the site can't be replayed here.
              options={{ action: "send-otp" }}
              onSuccess={(token) => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken("")}
              onError={() => {
                setTurnstileToken("");
                setError(TURNSTILE_UNAVAILABLE);
              }}
            />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Sending…" : "Send code"}
          </Button>
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
            ref={codeInputRef}
            id="code"
            label="Six-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-describedby={error ? ERROR_ID : undefined}
            required
          />
          <div className="button-group">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Verifying…" : "Verify and sign in"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => {
                setError("");
                setStep("email");
              }}
            >
              Request a new code
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" id={ERROR_ID} tabIndex={-1} ref={errorRef}>
          {error}
        </p>
      )}

      <p>
        <Link href="/">Back to home</Link>
      </p>
    </div>
  );
}
