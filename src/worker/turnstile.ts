/**
 * Cloudflare Turnstile server-side verification for the send-OTP path.
 *
 * The gate lives in `src/worker/index.ts` as a dedicated route registered
 * ahead of the `/api/auth/*` catch-all: a send request must carry a valid
 * Turnstile token (in the `x-turnstile-token` header) or it is rejected here,
 * before Better Auth issues a code and before the email sender is called.
 *
 * Fail closed, never open: a missing/oversized token, a non-2xx `siteverify`
 * response, a malformed body, a timeout, a thrown fetch, an `action` that
 * isn't the one we expect, or a `hostname` outside the allowlist all resolve
 * to `false`. A bot check that cannot run is a bot check that failed.
 */

/** Cloudflare's token-verification endpoint. */
const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Turnstile tokens are short (~hundreds of chars); anything longer is junk. */
const MAX_TOKEN_LENGTH = 2048;

/** How long to wait on `siteverify` before giving up (and failing closed). */
const SITEVERIFY_TIMEOUT_MS = 10_000;

/** The parts of a `siteverify` response the gate looks at. */
interface SiteverifyResult {
  success?: boolean;
  /** The `action` the widget was rendered with, echoed back. */
  action?: string;
  /** The hostname the challenge was solved on. */
  hostname?: string;
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
  /**
   * If set, the `action` the token must have been minted for. Lets a token
   * issued for one form on the site not be replayed against this endpoint.
   * Omitted on test-key environments, whose responses don't carry a stable
   * action (see `TURNSTILE_HOSTNAMES` in `src/worker/index.ts`).
   */
  expectedAction?: string;
  /**
   * If non-empty, the set of hostnames the challenge may have been solved
   * on. Binds a token to the origin that produced it. Empty on test-key
   * environments (localhost, previews) where the hostname isn't fixed.
   */
  allowedHostnames?: string[];
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
 * `siteverify` reports `success: true` **and** (when asked) the `action` and
 * `hostname` match; every other outcome resolves `false`.
 *
 * Turnstile tokens are single-use and short-lived (~300s); a redeemed token
 * comes back `success: false`, so the client resets the widget after a send
 * that consumed one.
 */
export const verifyTurnstile: TurnstileVerifier = async ({
  secret,
  token,
  remoteIp,
  expectedAction,
  allowedHostnames,
}) => {
  if (!token || token.length > MAX_TOKEN_LENGTH) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  let result: SiteverifyResult;
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    result = (await res.json()) as SiteverifyResult;
  } catch {
    return false;
  }

  if (result.success !== true) return false;
  if (expectedAction !== undefined && result.action !== expectedAction) {
    return false;
  }
  if (
    allowedHostnames &&
    allowedHostnames.length > 0 &&
    !allowedHostnames.includes(result.hostname ?? "")
  ) {
    return false;
  }
  return true;
};
