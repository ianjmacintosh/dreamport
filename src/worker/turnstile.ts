/**
 * Cloudflare Turnstile server-side verification for the send-OTP path.
 *
 * The gate lives in `src/worker/index.ts` as a dedicated route registered
 * ahead of the `/api/auth/*` catch-all: a send request must carry a valid
 * Turnstile token (in the `x-turnstile-token` header) or it is rejected here,
 * before Better Auth issues a code and before the email sender is called.
 *
 * Fail closed, never open: a missing token, a non-2xx `siteverify` response,
 * a malformed body, or a network error all resolve to `false`. A bot check
 * that cannot run is treated as a bot check that failed.
 */

/** Cloudflare's token-verification endpoint (POST, JSON in and out). */
const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** The shape of a `siteverify` response we care about. */
interface SiteverifyResult {
  success?: boolean;
}

/** Inputs for {@link verifyTurnstile}. */
export interface VerifyTurnstileOptions {
  /** The per-environment Turnstile secret key (`TURNSTILE_SECRET_KEY`). */
  secret: string;
  /**
   * The token the widget produced, as sent by the client. `null` (or empty)
   * when the client never solved the challenge — rejected without a network
   * round trip.
   */
  token: string | null;
  /** The caller's IP (`cf-connecting-ip`), passed through to `siteverify`. */
  remoteIp: string | null;
}

/**
 * Verify a Turnstile token. The Worker's send-OTP gate depends on this shape,
 * not on {@link verifyTurnstile} directly, so a test can inject a stub and
 * keep the Seam 1 suite off the network (mirrors `AuthDeps.emailSender`).
 */
export type TurnstileVerifier = (
  options: VerifyTurnstileOptions,
) => Promise<boolean>;

/**
 * Verify a Turnstile token with Cloudflare. Resolves `true` only when
 * `siteverify` explicitly reports `success: true`; every other outcome —
 * including a missing token, an error response, or a thrown fetch — resolves
 * `false`.
 *
 * Turnstile tokens are single-use and short-lived (~300s); a token that has
 * already been redeemed comes back `success: false`, so the client must reset
 * the widget after each successful send.
 */
export const verifyTurnstile: TurnstileVerifier = async ({
  secret,
  token,
  remoteIp,
}) => {
  if (!token) return false;

  const body: Record<string, string> = { secret, response: token };
  if (remoteIp) body.remoteip = remoteIp;

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return false;
    const result = (await res.json()) as SiteverifyResult;
    return result.success === true;
  } catch {
    return false;
  }
};
