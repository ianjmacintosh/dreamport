import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import Button from "../../components/Button";
import Link from "../../components/Link";
import TextInput from "../../components/TextInput";

export const Route = createFileRoute("/_layout/login")({
  component: Login,
});

/** Which of the two steps the form is on. */
type Step = "email" | "code";

/** POST JSON, returning `null` if the request never reached the server. */
async function postJson(path: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

const NETWORK_ERROR =
  "Something went wrong. Check your connection and try again.";

/**
 * Passwordless sign-in: collect an email, send a one-time code to it, collect
 * the code, and on success let the browser follow the freshly-set session
 * cookie to `/app`.
 *
 * Talks straight to the Better Auth `emailOTP` endpoints under `/api/auth/*`.
 * Composed only from `TextInput` / `Button` / `Link` / a heading, with a bare
 * line of error text — the error banner, narrow centred layout, and button
 * loading/disabled states are left to the design-system pass (#28).
 */
function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  async function sendCode() {
    setError("");
    const res = await postJson("/api/auth/email-otp/send-verification-otp", {
      email,
      type: "sign-in",
    });
    if (!res) {
      setError(NETWORK_ERROR);
      return;
    }
    if (!res.ok) {
      setError("We couldn't send a code. Check the address and try again.");
      return;
    }
    setCode("");
    setStep("code");
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
            onClick={() => void sendCode()}
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
