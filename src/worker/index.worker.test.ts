import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TEST_EMAILS } from "../../test/emails";
import { createAuth } from "./auth";
import { getMockSender, type EmailSender, type OtpEmail } from "./email/sender";
import { createApp } from "./index";
import { recordDailySend } from "./otp-send-throttle";
import { PRODUCTION_HOST } from "./trusted-origins";
import type { TurnstileVerifier } from "./turnstile";

/**
 * Seam 1 — the Worker's HTTP boundary.
 *
 * These run inside workerd (via @cloudflare/vitest-pool-workers) with the
 * real `DB` binding and per-test isolated storage. `test/apply-migrations.ts`
 * has already applied `migrations/0001_*.sql` to a fresh database.
 *
 * The auth flow is driven entirely through `Request`s; the 6-digit code is
 * recovered from the shared mock email sender, which the Worker and this
 * test share by module identity. Recipient addresses come from
 * `TEST_EMAILS` (see `test/emails.ts`) — never a literal — and all sit on
 * `@resend.dev`, which cannot deliver to a real inbox.
 *
 * Since #23 the send-OTP path is behind a Turnstile gate. These tests drive
 * the Worker through `createApp({ verifyTurnstile })` with a stub verifier,
 * so nothing here calls Cloudflare's `siteverify` endpoint — the real
 * `verifyTurnstile` is covered hermetically in `turnstile.test.ts`.
 */

const ORIGIN = "https://dreamport.test";
const json = { "content-type": "application/json" };

/** Any non-empty token; the stub verifier below only checks presence. */
const TURNSTILE_TOKEN = "dummy-turnstile-token";

/** Stub verifier: a request passes the gate iff it carried a token header. */
const acceptTokenIfPresent: TurnstileVerifier = async ({ token }) =>
  token !== null && token !== "";

/**
 * The Worker under test, wired with a stub Turnstile verifier so the send
 * path never makes a network call. Gate-specific cases in the "Turnstile
 * gate" block build their own `createApp(...)` with a different stub.
 */
const app = createApp({ verifyTurnstile: acceptTokenIfPresent });

/** A stable client IP for these requests (see `fetchWorker`). */
const CLIENT_IP = "203.0.113.9";

/**
 * Drive the Worker like a real client would. Two headers a synthetic
 * `Request` lacks but a real one always carries:
 *
 *  - `Host` — `auth.ts`'s dynamic `baseURL` (see `ALLOWED_HOSTS` in
 *    `trusted-origins.ts`) resolves per request from it.
 *  - `cf-connecting-ip` — since #24 the send path is rate limited per client
 *    IP (`auth.ts` `rateLimit`); a fixed value keeps every request in this
 *    file on one bucket, which `beforeEach` resets. That bucket is 3 sends /
 *    60s: no single `it` here sends more than three codes, and a test that
 *    needs to should clear the tables mid-way or vary this header.
 */
async function fetchWorker(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("host")) headers.set("host", new URL(ORIGIN).host);
  if (!headers.has("cf-connecting-ip")) {
    headers.set("cf-connecting-ip", CLIENT_IP);
  }
  return app.fetch(new Request(`${ORIGIN}${path}`, { ...init, headers }), env);
}

/**
 * Drive the send-OTP endpoint. By default it carries a Turnstile token that
 * the stub verifier accepts; pass `{ token: null }` to omit the header
 * entirely, or a specific string to send that value.
 */
function sendCode(
  email: string,
  {
    token = TURNSTILE_TOKEN,
    host,
  }: { token?: string | null; host?: string } = {},
) {
  const headers: Record<string, string> = { ...json };
  if (token !== null) headers["x-turnstile-token"] = token;
  // `fetchWorker` only sets a default Host when one isn't already present.
  if (host) headers["host"] = host;
  return fetchWorker("/api/auth/email-otp/send-verification-otp", {
    method: "POST",
    headers,
    body: JSON.stringify({ email, type: "sign-in" }),
  });
}

function verifyCode(email: string, otp: string) {
  return fetchWorker("/api/auth/sign-in/email-otp", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ email, otp }),
  });
}

/** The Better Auth error `code` from a failed-auth JSON response. */
async function errorCode(res: Response): Promise<string> {
  const body = (await res.json()) as { code?: string };
  return body.code ?? "";
}

/** The most recent code the mock sender was handed for `email`. */
function codeFor(email: string): string {
  const sent = getMockSender().sent.filter((e) => e.to === email);
  const last = sent.at(-1);
  if (!last) throw new Error(`no OTP was sent to ${email}`);
  return last.otp;
}

/** A 6-digit code guaranteed to differ from `right`. */
function notCode(right: string): string {
  return right === "000000" ? "999999" : "000000";
}

/** Force one verification row to look expired; assert it actually matched. */
async function expireCode(email: string): Promise<void> {
  const { meta } = await env.DB.prepare(
    "UPDATE verification SET expiresAt = ? WHERE identifier = ?",
  )
    .bind(new Date(Date.now() - 60_000).toISOString(), `sign-in-otp-${email}`)
    .run();
  // Guards against Better Auth changing the identifier format or date
  // encoding out from under this helper.
  expect(meta.changes).toBe(1);
}

/** `name=value` for the session cookie, ready to hand back as a Cookie header. */
function sessionCookie(res: Response): string {
  const setCookie = res.headers
    .getSetCookie()
    .find((c) => c.includes("better-auth.session_token="));
  if (!setCookie) throw new Error("response set no session cookie");
  return setCookie.split(";")[0];
}

/** Send + verify, returning the Cookie header for the new session. */
async function signIn(email: string): Promise<string> {
  await sendCode(email);
  const res = await verifyCode(email, codeFor(email));
  expect(res.status).toBe(200);
  return sessionCookie(res);
}

function countUsers(email: string) {
  return env.DB.prepare("SELECT COUNT(*) AS n FROM user WHERE email = ?")
    .bind(email)
    .first<{ n: number }>();
}

function userIdFor(email: string) {
  return env.DB.prepare("SELECT id FROM user WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
}

function countSessions(userId: string) {
  return env.DB.prepare(
    'SELECT COUNT(*) AS n FROM "session" WHERE "userId" = ?',
  )
    .bind(userId)
    .first<{ n: number }>();
}

/** A trusted origin for the state-changing, cookie-bearing #26 requests. */
const TRUSTED_ORIGIN = `https://${PRODUCTION_HOST}`;

/** POST /api/auth/sign-out with a trusted Origin and the session cookie. */
function signOut(cookie: string) {
  return fetchWorker("/api/auth/sign-out", {
    method: "POST",
    headers: { origin: TRUSTED_ORIGIN, cookie },
  });
}

/**
 * POST /api/auth/delete-user — the "email me a confirmation link" step. Better
 * Auth runs its origin check on this (state-changing + cookie-bearing), so it
 * carries the same `origin` + `cookie` shape as `signOut`.
 */
function requestAccountDeletion(cookie: string) {
  return fetchWorker("/api/auth/delete-user", {
    method: "POST",
    headers: { ...json, origin: TRUSTED_ORIGIN, cookie },
    body: JSON.stringify({ callbackURL: "/" }),
  });
}

/** Path + query of the last deletion link the mock sender was handed for `email`. */
function deleteLinkPathFor(email: string): string {
  const last = getMockSender()
    .deleteLinksSent.filter((e) => e.to === email)
    .at(-1);
  if (!last) throw new Error(`no delete link was sent to ${email}`);
  const u = new URL(last.url);
  return u.pathname + u.search;
}

beforeEach(async () => {
  getMockSender().clear();
  // Since #24 the send-OTP path is rate limited (per-IP via Better Auth's
  // `rateLimit` table, per-email via `otpSendThrottle`, a global daily cap
  // via `otpSendDaily`). Storage is isolated per test file but not per `it`,
  // and several cases here send a handful of codes; clearing all three keeps
  // each `it` starting from a full budget. The limits themselves are covered
  // in `rate-limit.worker.test.ts`.
  await env.DB.prepare('DELETE FROM "rateLimit"').run();
  await env.DB.prepare('DELETE FROM "otpSendThrottle"').run();
  await env.DB.prepare('DELETE FROM "otpSendDaily"').run();
});

describe("non-/api paths", () => {
  it("serves the SPA shell from the asset layer, not the Worker", async () => {
    const res = await fetchWorker("/");

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('data-fixture="spa-shell"');
  });

  it("falls back to the SPA shell for unknown client routes", async () => {
    const res = await fetchWorker("/some/client/route");

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('data-fixture="spa-shell"');
  });
});

describe("/api/auth/* is mounted", () => {
  it("GET /api/auth/ok returns { ok: true }", async () => {
    const res = await fetchWorker("/api/auth/ok");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("send a sign-in code", () => {
  it("succeeds and hands the mock sender a 6-digit code for that email", async () => {
    const res = await sendCode(TEST_EMAILS.sendBasic);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(codeFor(TEST_EMAILS.sendBasic)).toMatch(/^\d{6}$/);
  });

  it("looks identical for a known and an unknown email", async () => {
    await signIn(TEST_EMAILS.knownSender);
    getMockSender().clear();

    const known = await sendCode(TEST_EMAILS.knownSender);
    const unknown = await sendCode(TEST_EMAILS.strangerSender);

    expect(known.status).toBe(unknown.status);
    expect(await known.json()).toEqual(await unknown.json());
    expect(known.status).toBe(200);
  });
});

describe("Turnstile gate on the send-OTP path (#23)", () => {
  // The gate's job: reject a send whose token is missing or fails
  // verification *before* Better Auth issues a code, and fail closed when the
  // secret is unset. Verification itself is stubbed here (the real
  // `verifyTurnstile` is covered in `turnstile.test.ts`).
  const originalSecret = env.TURNSTILE_SECRET_KEY;
  const originalHostnames = env.TURNSTILE_HOSTNAMES;

  afterEach(() => {
    env.TURNSTILE_SECRET_KEY = originalSecret;
    env.TURNSTILE_HOSTNAMES = originalHostnames;
  });

  /** POST the send-OTP endpoint against a Worker built with `verifier`. */
  function send(
    verifier: TurnstileVerifier,
    email: string,
    { token = TURNSTILE_TOKEN }: { token?: string | null } = {},
  ) {
    const headers = new Headers({ ...json, host: new URL(ORIGIN).host });
    if (token !== null) headers.set("x-turnstile-token", token);
    return createApp({ verifyTurnstile: verifier }).fetch(
      new Request(`${ORIGIN}/api/auth/email-otp/send-verification-otp`, {
        method: "POST",
        headers,
        body: JSON.stringify({ email, type: "sign-in" }),
      }),
      env,
    );
  }

  const accept: TurnstileVerifier = async () => true;
  const reject: TurnstileVerifier = async () => false;

  it("issues a code when verification passes", async () => {
    const res = await send(accept, TEST_EMAILS.turnstilePass);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(codeFor(TEST_EMAILS.turnstilePass)).toMatch(/^\d{6}$/);
  });

  /** Capture the options the gate hands the verifier for one send. */
  async function optionsSeenBySend(headerOverrides: Record<string, string>) {
    let seen: Parameters<TurnstileVerifier>[0] | undefined;
    const spy: TurnstileVerifier = async (opts) => {
      seen = opts;
      return true;
    };
    await createApp({ verifyTurnstile: spy }).fetch(
      new Request(`${ORIGIN}/api/auth/email-otp/send-verification-otp`, {
        method: "POST",
        headers: new Headers({
          ...json,
          host: new URL(ORIGIN).host,
          ...headerOverrides,
        }),
        body: JSON.stringify({
          email: TEST_EMAILS.turnstilePass,
          type: "sign-in",
        }),
      }),
      env,
    );
    return seen;
  }

  it("passes the header token and client IP through to the verifier", async () => {
    const seen = await optionsSeenBySend({
      "x-turnstile-token": "tok-123",
      "cf-connecting-ip": "203.0.113.7",
    });

    expect(seen).toMatchObject({ token: "tok-123", remoteIp: "203.0.113.7" });
  });

  it("does not pin action or hostname when TURNSTILE_HOSTNAMES is unset", async () => {
    env.TURNSTILE_HOSTNAMES = undefined;

    const seen = await optionsSeenBySend({ "x-turnstile-token": "t" });

    expect(seen?.expectedAction).toBeUndefined();
    expect(seen?.allowedHostnames).toEqual([]);
  });

  it("pins the send-otp action and the configured hostnames when set", async () => {
    env.TURNSTILE_HOSTNAMES = " dreamport.example.com , preview.example.com ";

    const seen = await optionsSeenBySend({ "x-turnstile-token": "t" });

    expect(seen?.expectedAction).toBe("send-otp");
    expect(seen?.allowedHostnames).toEqual([
      "dreamport.example.com",
      "preview.example.com",
    ]);
  });

  it("rejects a send with no Turnstile token, before any code is issued", async () => {
    const res = await send(reject, TEST_EMAILS.turnstileNoToken, {
      token: null,
    });

    expect(res.status).toBe(403);
    expect(
      getMockSender().sent.some((e) => e.to === TEST_EMAILS.turnstileNoToken),
    ).toBe(false);
  });

  it("rejects a send whose token fails verification, before any code is issued", async () => {
    const res = await send(reject, TEST_EMAILS.turnstileBadToken);

    expect(res.status).toBe(403);
    expect(
      getMockSender().sent.some((e) => e.to === TEST_EMAILS.turnstileBadToken),
    ).toBe(false);
  });

  it("fails closed with 503 when no Turnstile secret is configured, without calling the verifier", async () => {
    env.TURNSTILE_SECRET_KEY = "";
    const mustNotRun: TurnstileVerifier = async () => {
      throw new Error("verifier called despite missing secret");
    };

    const res = await send(mustNotRun, TEST_EMAILS.turnstileUnconfigured);

    expect(res.status).toBe(503);
    expect(
      getMockSender().sent.some(
        (e) => e.to === TEST_EMAILS.turnstileUnconfigured,
      ),
    ).toBe(false);
  });
});

describe("production host refuses mock email on the send-OTP path (#41)", () => {
  // The mock sender delivers nothing, so the production host must never run
  // it: a send whose `Host` is the production domain while the resolved
  // `EMAIL_MODE` is anything but `resend` is refused (503) before Better Auth
  // generates a code. Every deployed environment ships `EMAIL_MODE=mock`
  // today, so this is what keeps a production deploy failing closed (login
  // unavailable) rather than open (codes generated but never delivered) until
  // #38 wires real Resend delivery. `env.EMAIL_MODE` in this pool is `mock`
  // (the `local` wrangler env), so these cases only vary the Host.

  it("503s a send from the production Host, before any code is generated", async () => {
    const res = await sendCode(TEST_EMAILS.prodHostGuard, {
      host: PRODUCTION_HOST,
    });

    expect(res.status).toBe(503);
    expect(
      getMockSender().sent.some((e) => e.to === TEST_EMAILS.prodHostGuard),
    ).toBe(false);
  });

  it("does not fire for the staging Host running the same code and mode", async () => {
    const res = await sendCode(TEST_EMAILS.prodHostStagingOk, {
      host: "dreamport-staging.bananasquad.workers.dev",
    });

    expect(res.status).toBe(200);
    expect(codeFor(TEST_EMAILS.prodHostStagingOk)).toMatch(/^\d{6}$/);
  });
});

describe("verify a sign-in code", () => {
  it("issues a host-only, secure, http-only session cookie on the right code", async () => {
    await sendCode(TEST_EMAILS.verifyOk);

    const res = await verifyCode(
      TEST_EMAILS.verifyOk,
      codeFor(TEST_EMAILS.verifyOk),
    );

    expect(res.status).toBe(200);
    const cookie = res.headers
      .getSetCookie()
      .find((c) => c.includes("session_token="))!;
    expect(cookie).toContain("__Secure-better-auth.session_token=");
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*Secure/i);
    expect(cookie).toMatch(/;\s*SameSite=Lax/i);
    expect(cookie).toMatch(/;\s*Path=\//i);
    expect(cookie).not.toMatch(/;\s*Domain=/i);
    // 30-day rolling session.
    expect(cookie).toMatch(/;\s*Max-Age=2592000/i);
  });

  it("creates a User the first time an unknown email verifies", async () => {
    expect((await countUsers(TEST_EMAILS.freshUser))?.n).toBe(0);

    await sendCode(TEST_EMAILS.freshUser);
    const res = await verifyCode(
      TEST_EMAILS.freshUser,
      codeFor(TEST_EMAILS.freshUser),
    );

    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toContain("session_token=");
    expect((await countUsers(TEST_EMAILS.freshUser))?.n).toBe(1);
  });

  it("rejects a wrong code, decrements the budget, then locks out the 4th try", async () => {
    await sendCode(TEST_EMAILS.attempts);
    const right = codeFor(TEST_EMAILS.attempts);
    const wrong = notCode(right);

    for (let i = 0; i < 3; i++) {
      const res = await verifyCode(TEST_EMAILS.attempts, wrong);
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe("INVALID_OTP");
    }

    // 4th attempt is refused even though the code is correct.
    const res = await verifyCode(TEST_EMAILS.attempts, right);
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe("TOO_MANY_ATTEMPTS");
  });

  it("rejects a code past its 60-minute expiry", async () => {
    await sendCode(TEST_EMAILS.expired);
    const code = codeFor(TEST_EMAILS.expired);
    await expireCode(TEST_EMAILS.expired);

    const res = await verifyCode(TEST_EMAILS.expired, code);
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe("OTP_EXPIRED");
  });

  it("issues a working code again after the previous one expired", async () => {
    await sendCode(TEST_EMAILS.reissueAfterExpiry);
    await expireCode(TEST_EMAILS.reissueAfterExpiry);
    getMockSender().clear();

    await sendCode(TEST_EMAILS.reissueAfterExpiry);
    const res = await verifyCode(
      TEST_EMAILS.reissueAfterExpiry,
      codeFor(TEST_EMAILS.reissueAfterExpiry),
    );

    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toContain("session_token=");
  });

  it("issues a working code again after the attempt budget was exhausted", async () => {
    await sendCode(TEST_EMAILS.reissueAfterExhaustion);
    const wrong = notCode(codeFor(TEST_EMAILS.reissueAfterExhaustion));
    for (let i = 0; i < 4; i++) {
      await verifyCode(TEST_EMAILS.reissueAfterExhaustion, wrong);
    }
    getMockSender().clear();

    await sendCode(TEST_EMAILS.reissueAfterExhaustion);
    const res = await verifyCode(
      TEST_EMAILS.reissueAfterExhaustion,
      codeFor(TEST_EMAILS.reissueAfterExhaustion),
    );

    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toContain("session_token=");
  });

  it("fails identically for a wrong code whether or not the email is known", async () => {
    await signIn(TEST_EMAILS.knownVerify);
    getMockSender().clear();

    await sendCode(TEST_EMAILS.knownVerify);
    await sendCode(TEST_EMAILS.unknownVerify);

    // One string that is wrong for both live codes.
    const wrong = [
      codeFor(TEST_EMAILS.knownVerify),
      codeFor(TEST_EMAILS.unknownVerify),
    ].includes("000000")
      ? "999999"
      : "000000";

    const known = await verifyCode(TEST_EMAILS.knownVerify, wrong);
    const unknown = await verifyCode(TEST_EMAILS.unknownVerify, wrong);

    expect(known.status).toBe(unknown.status);
    expect(await known.json()).toEqual(await unknown.json());
    expect(known.status).toBe(400);
  });

  it("uses an injected email sender, bypassing EMAIL_MODE", async () => {
    const captured: OtpEmail[] = [];
    const spy: EmailSender = {
      async sendOtp(email) {
        captured.push(email);
      },
      async sendDeleteAccountVerification() {
        throw new Error("not exercised by this test");
      },
    };

    const auth = createAuth(env, { emailSender: spy });
    const res = await auth.api.sendVerificationOTP({
      body: { email: TEST_EMAILS.injectedSender, type: "sign-in" },
      // A direct `auth.api.*` call bypasses the Worker's HTTP boundary
      // entirely, so there's no Request for the dynamic `baseURL` to read a
      // Host from — it has to be handed one directly.
      headers: { host: new URL(ORIGIN).host },
      asResponse: true,
    });

    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      to: TEST_EMAILS.injectedSender,
      type: "sign-in",
    });
    expect(captured[0].otp).toMatch(/^\d{6}$/);
    // The shared mock never saw it.
    expect(
      getMockSender().sent.some((e) => e.to === TEST_EMAILS.injectedSender),
    ).toBe(false);
  });
});

describe("GET /api/me", () => {
  it("returns the signed-in email with a valid session cookie", async () => {
    const cookie = await signIn(TEST_EMAILS.meOk);

    const res = await fetchWorker("/api/me", { headers: { cookie } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: TEST_EMAILS.meOk });
  });

  it("rejects a request with no session cookie", async () => {
    const res = await fetchWorker("/api/me");

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not signed in" });
  });

  it("rejects a request with a junk session cookie", async () => {
    const res = await fetchWorker("/api/me", {
      headers: {
        cookie: "__Secure-better-auth.session_token=not-a-real-token",
      },
    });

    expect(res.status).toBe(401);
  });
});

describe("GET /api/test/last-otp (mock-only test hook)", () => {
  // Mounted only when EMAIL_MODE=mock (the `local` test env sets it). It is
  // the browser's stand-in for the dev console: Playwright reads the code the
  // mock sender was handed instead of a real inbox.
  it("returns the most recent code handed to the mock sender for an email", async () => {
    await sendCode(TEST_EMAILS.lastOtpHook);

    const res = await fetchWorker(
      `/api/test/last-otp?email=${encodeURIComponent(TEST_EMAILS.lastOtpHook)}`,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ otp: codeFor(TEST_EMAILS.lastOtpHook) });
  });

  it("404s when no code has been sent to that email", async () => {
    const res = await fetchWorker(
      `/api/test/last-otp?email=${encodeURIComponent(TEST_EMAILS.neverSent)}`,
    );

    expect(res.status).toBe(404);
  });

  it("400s when the email query param is missing", async () => {
    const res = await fetchWorker("/api/test/last-otp");

    expect(res.status).toBe(400);
  });
});

describe("sign out (#26)", () => {
  it("clears the session cookie, and the old cookie no longer works", async () => {
    const cookie = await signIn(TEST_EMAILS.signOut);

    const res = await signOut(cookie);
    expect(res.status).toBe(200);

    const cleared = res.headers
      .getSetCookie()
      .find((c) => c.includes("session_token="));
    expect(cleared).toBeDefined();
    expect(cleared).toMatch(/;\s*Max-Age=0/i);

    // The AC's "cookie no longer accepted": /app's guard calls /api/me.
    const me = await fetchWorker("/api/me", { headers: { cookie } });
    expect(me.status).toBe(401);
  });
});

// Better Auth's `/delete-user` + `/delete-user/callback` signal their happy
// and refusal paths with a thrown `APIError` (302, 404). workerd's rejection
// tracker flags the transient gap before the handler adopts it, even though
// these tests assert the resulting HTTP response and pass. If a `better-auth`
// bump makes these start failing the run with an "unhandled rejection" from
// the workers pool, the allowlist is `onUnhandledError` in `vitest.config.ts`.
describe("delete account (#26)", () => {
  const originalDailyCap = env.SEND_OTP_DAILY_CAP;
  afterEach(() => {
    env.SEND_OTP_DAILY_CAP = originalDailyCap;
  });

  it("emails a confirmation link and leaves the User in place until it is followed", async () => {
    const cookie = await signIn(TEST_EMAILS.deleteSendOk);

    const res = await requestAccountDeletion(cookie);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });
    const links = getMockSender().deleteLinksSent.filter(
      (e) => e.to === TEST_EMAILS.deleteSendOk,
    );
    expect(links).toHaveLength(1);
    expect(links[0].url).toContain("/api/auth/delete-user/callback?token=");
    expect((await countUsers(TEST_EMAILS.deleteSendOk))?.n).toBe(1);
  });

  it("401s a deletion request with no session, and sends no link", async () => {
    const res = await fetchWorker("/api/auth/delete-user", {
      method: "POST",
      headers: { ...json, origin: TRUSTED_ORIGIN },
      body: JSON.stringify({ callbackURL: "/" }),
    });

    expect(res.status).toBe(401);
    expect(getMockSender().deleteLinksSent).toHaveLength(0);
  });

  it("completes deletion when the emailed link is opened in the same session", async () => {
    const cookie = await signIn(TEST_EMAILS.deleteCallbackOk);
    const userId = (await userIdFor(TEST_EMAILS.deleteCallbackOk))!.id;
    await requestAccountDeletion(cookie);

    const res = await fetchWorker(
      deleteLinkPathFor(TEST_EMAILS.deleteCallbackOk),
      { headers: { cookie } },
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(
      res.headers.getSetCookie().some((c) => /;\s*Max-Age=0/i.test(c)),
    ).toBe(true);
    expect((await countUsers(TEST_EMAILS.deleteCallbackOk))?.n).toBe(0);
    expect((await countSessions(userId))?.n).toBe(0);
  });

  it("lets the same address register again after deletion, as a brand-new User", async () => {
    const cookie = await signIn(TEST_EMAILS.deleteThenReregister);
    const firstId = (await userIdFor(TEST_EMAILS.deleteThenReregister))!.id;
    await requestAccountDeletion(cookie);
    await fetchWorker(deleteLinkPathFor(TEST_EMAILS.deleteThenReregister), {
      headers: { cookie },
    });
    expect((await countUsers(TEST_EMAILS.deleteThenReregister))?.n).toBe(0);

    // "cannot sign in without registering again" — registering again works,
    // and it is a genuinely new User row, not the old one revived.
    const newCookie = await signIn(TEST_EMAILS.deleteThenReregister);
    const secondId = (await userIdFor(TEST_EMAILS.deleteThenReregister))!.id;
    expect((await countUsers(TEST_EMAILS.deleteThenReregister))?.n).toBe(1);
    expect(secondId).not.toBe(firstId);

    const me = await fetchWorker("/api/me", { headers: { cookie: newCookie } });
    expect(me.status).toBe(200);
  });

  it("404s the callback for an unknown token and keeps the User", async () => {
    const cookie = await signIn(TEST_EMAILS.deleteBadToken);
    await requestAccountDeletion(cookie);

    const res = await fetchWorker(
      "/api/auth/delete-user/callback?token=not-a-real-token&callbackURL=%2F",
      { headers: { cookie } },
    );

    expect(res.status).toBe(404);
    expect((await countUsers(TEST_EMAILS.deleteBadToken))?.n).toBe(1);
  });

  it("404s the callback when the browser is no longer signed in, and keeps the User", async () => {
    const cookie = await signIn(TEST_EMAILS.deleteCallbackNoSession);
    await requestAccountDeletion(cookie);
    const path = deleteLinkPathFor(TEST_EMAILS.deleteCallbackNoSession);

    const res = await fetchWorker(path); // no cookie

    expect(res.status).toBe(404);
    expect((await countUsers(TEST_EMAILS.deleteCallbackNoSession))?.n).toBe(1);
  });

  it("refuses the old session cookie at /api/me after a completed deletion", async () => {
    const cookie = await signIn(TEST_EMAILS.deleteThenMe);
    await requestAccountDeletion(cookie);
    await fetchWorker(deleteLinkPathFor(TEST_EMAILS.deleteThenMe), {
      headers: { cookie },
    });

    const res = await fetchWorker("/api/me", { headers: { cookie } });

    expect(res.status).toBe(401);
  });

  it("429s a deletion request once the daily send cap is spent, sending nothing", async () => {
    const cookie = await signIn(TEST_EMAILS.deleteDailyCap);
    env.SEND_OTP_DAILY_CAP = "1";
    await recordDailySend(env.DB);

    const res = await requestAccountDeletion(cookie);

    expect(res.status).toBe(429);
    expect(res.headers.has("retry-after")).toBe(true);
    expect(
      getMockSender().deleteLinksSent.some(
        (e) => e.to === TEST_EMAILS.deleteDailyCap,
      ),
    ).toBe(false);
  });

  it("429s the 4th deletion request in 60s from one client (per-IP customRule)", async () => {
    const cookie = await signIn(TEST_EMAILS.deleteRateLimit);

    for (let i = 0; i < 3; i++) {
      expect((await requestAccountDeletion(cookie)).status).toBe(200);
    }

    expect((await requestAccountDeletion(cookie)).status).toBe(429);
  });
});

describe("GET /api/test/last-delete-link (mock-only test hook)", () => {
  it("returns the last deletion link handed to the mock sender for an email", async () => {
    const cookie = await signIn(TEST_EMAILS.lastDeleteLinkHook);
    await requestAccountDeletion(cookie);

    const res = await fetchWorker(
      `/api/test/last-delete-link?email=${encodeURIComponent(
        TEST_EMAILS.lastDeleteLinkHook,
      )}`,
    );

    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(url).toContain("/api/auth/delete-user/callback?token=");
  });

  it("404s when no link has been sent to that address", async () => {
    const res = await fetchWorker(
      `/api/test/last-delete-link?email=${encodeURIComponent(
        TEST_EMAILS.neverSent,
      )}`,
    );

    expect(res.status).toBe(404);
  });

  it("400s when the email query param is missing", async () => {
    const res = await fetchWorker("/api/test/last-delete-link");

    expect(res.status).toBe(400);
  });
});

describe("fixed E2E-test OTP code (#39)", () => {
  // Marker-carrying address, `EMAIL_MODE=mock` (this pool's setting): the
  // code is the fixed "000000" and a real sign-in completes with it.
  it("verifies with the fixed code for a +e2e-test@ address", async () => {
    await sendCode(TEST_EMAILS.e2eTestFixedCode);

    expect(codeFor(TEST_EMAILS.e2eTestFixedCode)).toBe("000000");

    const res = await verifyCode(TEST_EMAILS.e2eTestFixedCode, "000000");
    expect(res.status).toBe(200);
  });

  // Same mode, no marker: falls through to Better Auth's own generator.
  it("still gets a random code for an address without the marker", async () => {
    await sendCode(TEST_EMAILS.e2eTestNoMarker);

    expect(codeFor(TEST_EMAILS.e2eTestNoMarker)).toMatch(/^\d{6}$/);
  });

  // The production-safety guarantee: even a marker address never gets the
  // fixed code once `EMAIL_MODE=resend`, regardless of what the address
  // looks like. Driven through `auth.api.*` directly with an injected
  // sender (as the "bypassing EMAIL_MODE" case above does) so this needs no
  // real Resend call — only `generateOTP`'s own `env.EMAIL_MODE` read is
  // under test here.
  it("is inert when EMAIL_MODE=resend, even for a marker address", async () => {
    const captured: OtpEmail[] = [];
    const spy: EmailSender = {
      async sendOtp(email) {
        captured.push(email);
      },
      async sendDeleteAccountVerification() {
        throw new Error("not exercised by this test");
      },
    };

    const auth = createAuth(
      { ...env, EMAIL_MODE: "resend" },
      { emailSender: spy },
    );
    const res = await auth.api.sendVerificationOTP({
      body: { email: TEST_EMAILS.e2eTestFixedCode, type: "sign-in" },
      headers: { host: new URL(ORIGIN).host },
      asResponse: true,
    });

    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0].otp).not.toBe("000000");
    expect(captured[0].otp).toMatch(/^\d{6}$/);
  });
});

describe("trusted origins (via Better Auth's origin check)", () => {
  // Better Auth only runs the origin check on state-changing requests that
  // carry a cookie. sign-out fits, and with an unsigned cookie it does no
  // database work — so the status is purely the origin verdict.
  const signOutFrom = (origin: string) =>
    fetchWorker("/api/auth/sign-out", {
      method: "POST",
      headers: { origin, cookie: "better-auth.session_token=unsigned" },
    });

  it("accepts the production origin", async () => {
    expect(
      (await signOutFrom("https://dreamport.ianjmacintosh.com")).status,
    ).toBe(200);
  });

  it("accepts the long-lived staging origin (bare host, no version prefix)", async () => {
    const origin = "https://dreamport-staging.bananasquad.workers.dev";
    expect((await signOutFrom(origin)).status).toBe(200);
  });

  it("accepts a branch-preview origin on this account's subdomain", async () => {
    const origin = "https://a1b2c3-dreamport-staging.bananasquad.workers.dev";
    expect((await signOutFrom(origin)).status).toBe(200);
  });

  it("rejects a workers.dev host outside this account's subdomain", async () => {
    expect(
      (await signOutFrom("https://a1b2c3-dreamport.someoneelse.workers.dev"))
        .status,
    ).toBe(403);
  });

  it("rejects an unrelated origin", async () => {
    expect((await signOutFrom("https://evil.example.com")).status).toBe(403);
  });
});

describe("dynamic baseURL (ALLOWED_HOSTS)", () => {
  // `auth.ts` resolves Better Auth's `baseURL` per request from the Host
  // header (see `ALLOWED_HOSTS` in `trusted-origins.ts`), rather than
  // trusting whatever Host a request claims — these exercise that directly,
  // independent of the origin-check tests above.
  const fetchAs = (host: string) =>
    app.fetch(
      new Request(`http://${host}/api/auth/ok`, { headers: { host } }),
      env,
    );

  it("resolves for a localhost Host, matching the local-dev pattern", async () => {
    const res = await fetchAs("localhost:5199");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("resolves for the long-lived staging Host (bare, no version prefix)", async () => {
    const res = await fetchAs("dreamport-staging.bananasquad.workers.dev");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("resolves for a branch-preview Host, matching the staging wildcard", async () => {
    const res = await fetchAs(
      "a1b2c3d4-dreamport-staging.bananasquad.workers.dev",
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("fails rather than self-trusting a Host matching no allowed pattern", async () => {
    const res = await fetchAs("not-a-known-host.example.com");

    expect(res.status).toBe(500);
  });
});

describe("other /api/* paths", () => {
  it("are owned by the Worker and 404 as JSON", async () => {
    const res = await fetchWorker("/api/does-not-exist");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});

describe("createAuth", () => {
  it("builds a fresh instance per call — no shared singleton", () => {
    expect(createAuth(env)).not.toBe(createAuth(env));
  });
});
