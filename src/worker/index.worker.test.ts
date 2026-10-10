import { env } from "cloudflare:workers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TEST_EMAILS } from "../../test/emails";
import { network } from "../../test/msw-network";
import { createAuth } from "./auth";
import { getMockSender, type EmailSender, type OtpEmail } from "./email/sender";
import { createApp } from "./index";
import { journeyState, worksheetState } from "./journeys";
import { recordDailySend } from "./otp-send-throttle";
import { PRODUCT_DESCRIPTION_MAX_LENGTH } from "./products";
import { E2E_RATE_LIMIT_EXEMPT_IP } from "./rate-limit-exemption";
import {
  PRODUCTION_HOST,
  PRODUCTION_HOSTS,
  STAGING_HOSTS,
} from "./trusted-origins";
import type { TurnstileVerifier } from "./turnstile";
import { WORKSHEET_ANSWER_MAX_LENGTH } from "./worksheets";

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

/**
 * A trusted origin for the state-changing, cookie-bearing #26 requests. Not
 * `PRODUCTION_HOST` (#63 / docs/adr/0011 stopped this build's
 * `TRUSTED_ORIGINS` from carrying every environment's hosts) — `ORIGIN`
 * itself, self-trusted via `fetchWorker`'s matching default Host, keeps
 * these tests about sign-out/delete-user, not about which origins this
 * particular build's environment happens to trust.
 */
const TRUSTED_ORIGIN = ORIGIN;

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
function requestAccountDeletion(cookie: string, ip?: string) {
  return fetchWorker("/api/auth/delete-user", {
    method: "POST",
    headers: {
      ...json,
      origin: TRUSTED_ORIGIN,
      cookie,
      ...(ip ? { "cf-connecting-ip": ip } : {}),
    },
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

  afterEach(() => {
    env.TURNSTILE_SECRET_KEY = originalSecret;
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

  /**
   * Capture the options the gate hands the verifier for one send.
   * `appDepsOverrides` stands in for `AppDeps`'s `turnstileHosts` /
   * `isProductionEnvironment` — this test pool's own build is `local`-shaped
   * (see `trusted-origins.test.ts`), so exercising production's or
   * staging's shape means overriding what `createApp` would otherwise
   * default to, not toggling a runtime var (#69 retired
   * `TURNSTILE_HOSTNAMES`, the var that used to let these tests do that).
   */
  async function optionsSeenBySend(
    headerOverrides: Record<string, string>,
    appDepsOverrides: {
      turnstileHosts?: readonly string[];
      isProductionEnvironment?: boolean;
    } = {},
  ) {
    let seen: Parameters<TurnstileVerifier>[0] | undefined;
    const spy: TurnstileVerifier = async (opts) => {
      seen = opts;
      return true;
    };
    await createApp({ verifyTurnstile: spy, ...appDepsOverrides }).fetch(
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

  it("does not pin action or hostname in this build's own (non-production) shape", async () => {
    const seen = await optionsSeenBySend({ "x-turnstile-token": "t" });

    expect(seen?.expectedAction).toBeUndefined();
    expect(seen?.allowedHostnames).toEqual([]);
  });

  // The exact gotcha #69 had to avoid: `CURRENT_ENVIRONMENT_HOSTS` is
  // non-empty for staging too (#68), so hostname-list emptiness can't be
  // what decides strict/lenient any more — only `IS_PRODUCTION_ENVIRONMENT`
  // does. This proves staging's own non-empty host list does not flip the
  // gate to strict on its own.
  it("stays lenient with a non-empty (staging-shaped) host list, since isProductionEnvironment is false", async () => {
    const seen = await optionsSeenBySend(
      { "x-turnstile-token": "t" },
      { turnstileHosts: STAGING_HOSTS, isProductionEnvironment: false },
    );

    expect(seen?.expectedAction).toBeUndefined();
    expect(seen?.allowedHostnames).toEqual([]);
  });

  it("pins the send-otp action and this build's environment hosts when isProductionEnvironment is true", async () => {
    const seen = await optionsSeenBySend(
      { "x-turnstile-token": "t" },
      { turnstileHosts: PRODUCTION_HOSTS, isProductionEnvironment: true },
    );

    expect(seen?.expectedAction).toBe("send-otp");
    expect(seen?.allowedHostnames).toEqual(PRODUCTION_HOSTS);
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
  // it: a send whose `Host` is the production domain while `RESEND_API_KEY`
  // is absent is refused (503) before Better Auth generates a code. No
  // deployed environment carries a key today outside production, so this is
  // what keeps a production deploy failing closed (login unavailable) rather
  // than open (codes generated but never delivered) until #38 wires real
  // Resend delivery. `env.RESEND_API_KEY` is unset in this pool (the `local`
  // wrangler env), so these cases only vary the Host.
  //
  // The guard itself (`index.ts`) compares the request `Host` against
  // `PRODUCTION_HOST` case-insensitively via `matchesHostPattern` (#60),
  // independent of `ALLOWED_HOSTS` — see that guard's own comment. It used
  // to be exercisable against a real staging Host in the same build; #63 /
  // docs/adr/0011 means this build's `ALLOWED_HOSTS` no longer resolves a
  // `baseURL` for staging at all (see "dynamic baseURL" above), so the
  // "doesn't fire" case below uses this build's own DEV-only host instead —
  // same property (exact match on value, not a prefix/substring test), a
  // host this build can actually complete the request for.

  it("503s a send from the production Host, before any code is generated", async () => {
    const res = await sendCode(TEST_EMAILS.prodHostGuard, {
      host: PRODUCTION_HOST,
    });

    expect(res.status).toBe(503);
    expect(
      getMockSender().sent.some((e) => e.to === TEST_EMAILS.prodHostGuard),
    ).toBe(false);
  });

  it("does not fire for a non-production Host running the same code and mode", async () => {
    const res = await sendCode(TEST_EMAILS.prodHostStagingOk);

    expect(res.status).toBe(200);
    expect(codeFor(TEST_EMAILS.prodHostStagingOk)).toMatch(/^\d{6}$/);
  });

  it("503s a send whose Host is a mixed-case spelling of the production host (#60)", async () => {
    // Host names are case-insensitive per RFC 9110; a mixed-case Host must
    // still read as production, not slip past the guard as an unrecognised
    // one.
    const mixedCaseHost = PRODUCTION_HOST.toUpperCase();
    expect(mixedCaseHost).not.toBe(PRODUCTION_HOST);

    const res = await sendCode(TEST_EMAILS.prodHostMixedCase, {
      host: mixedCaseHost,
    });

    expect(res.status).toBe(503);
    expect(
      getMockSender().sent.some((e) => e.to === TEST_EMAILS.prodHostMixedCase),
    ).toBe(false);
  });
});

describe("real ResendEmailSender send path, MSW-stubbed (#66)", () => {
  // Every other case in this file drives the send-OTP route with no
  // RESEND_API_KEY set, so `createEmailSender` always picks the mock sender
  // and `ResendEmailSender`'s request-construction/response-parsing code
  // never runs here. This proves that path end to end — through the real
  // HTTP boundary, `createAuth`, and `createEmailSender` — by setting a
  // (fake) key and letting `test/msw-network.ts` intercept the outbound
  // `fetch` to Resend inside workerd instead of hitting the real API. No
  // real network call, no real key. See docs/adr/0010.
  afterEach(() => {
    delete env.RESEND_API_KEY;
  });

  it("posts to the real Resend endpoint with the documented shape and completes the send", async () => {
    env.RESEND_API_KEY = "re_test_key";
    let capturedBody: Record<string, string> | undefined;
    let capturedAuth: string | null = null;
    network.use(
      http.post("https://api.resend.com/emails", async ({ request }) => {
        capturedAuth = request.headers.get("authorization");
        capturedBody = (await request.json()) as Record<string, string>;
        return HttpResponse.json({ id: "re_test_123" });
      }),
    );

    const res = await sendCode(TEST_EMAILS.resendPathMsw);

    expect(res.status).toBe(200);
    expect(capturedAuth).toBe("Bearer re_test_key");
    expect(capturedBody?.to).toBe(TEST_EMAILS.resendPathMsw);
    expect(capturedBody?.subject).toMatch(/sign-in code/i);
    expect(capturedBody?.text).toMatch(/^Your Dreamport code is \d{6}\./);
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

  it("uses an injected email sender, bypassing RESEND_API_KEY", async () => {
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

  it("never 429s a deletion request from the e2e-exempt IP", async () => {
    const cookie = await signIn(TEST_EMAILS.deleteRateLimitExempt);

    for (let i = 0; i < 5; i++) {
      expect(
        (await requestAccountDeletion(cookie, E2E_RATE_LIMIT_EXEMPT_IP)).status,
      ).toBe(200);
    }
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
  // Marker-carrying address, no RESEND_API_KEY set (this pool's setting): the
  // code is the fixed "000000" and a real sign-in completes with it.
  it("verifies with the fixed code for a +e2e-test@ address", async () => {
    await sendCode(TEST_EMAILS.e2eTestFixedCode);

    expect(codeFor(TEST_EMAILS.e2eTestFixedCode)).toBe("000000");

    const res = await verifyCode(TEST_EMAILS.e2eTestFixedCode, "000000");
    expect(res.status).toBe(200);
  });

  // Same setting, no marker: falls through to Better Auth's own generator.
  it("still gets a random code for an address without the marker", async () => {
    await sendCode(TEST_EMAILS.e2eTestNoMarker);

    expect(codeFor(TEST_EMAILS.e2eTestNoMarker)).toMatch(/^\d{6}$/);
  });

  // #66 / docs/adr/0010: staging deliberately carries a real RESEND_API_KEY
  // at the same time TEST_LOGIN_ENABLED may be on there — the combination
  // the old EMAIL_MODE-keyed clause used to block is now the intended
  // design, so `generateOTP` still hands out the fixed code here. Driven
  // through `auth.api.*` directly with an injected sender (as the
  // "bypassing RESEND_API_KEY" case above does) so this needs no real
  // Resend call.
  it("still returns the fixed code for a marker address with RESEND_API_KEY set", async () => {
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
      { ...env, TEST_LOGIN_ENABLED: "true", RESEND_API_KEY: "re_test_key" },
      { emailSender: spy },
    );
    const res = await auth.api.sendVerificationOTP({
      body: { email: TEST_EMAILS.e2eTestFixedCode, type: "sign-in" },
      headers: { host: new URL(ORIGIN).host },
      asResponse: true,
    });

    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0].otp).toBe("000000");
  });

  // The bug #61 shipped and #62 hotfixed: a real Resend key alone can't be
  // what keeps the fixed code off a public deployment (staging may carry one
  // per ADR-0010) — `TEST_LOGIN_ENABLED` is the sole var that does that job,
  // and it's absent from `staging`'s `wrangler.jsonc` vars. This constructs
  // exactly that shape (no `TEST_LOGIN_ENABLED`) and drives it through a
  // real `createAuth` + `sendVerificationOTP` call, the same way the case
  // above does — proof this is testable at all, which the old
  // `import.meta.env.DEV` gate never was.
  it("is inert when TEST_LOGIN_ENABLED is unset", async () => {
    const captured: OtpEmail[] = [];
    const spy: EmailSender = {
      async sendOtp(email) {
        captured.push(email);
      },
      async sendDeleteAccountVerification() {
        throw new Error("not exercised by this test");
      },
    };

    const stagingShaped = { ...env, TEST_LOGIN_ENABLED: undefined };
    const auth = createAuth(stagingShaped, { emailSender: spy });
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

  // #63 / docs/adr/0011: `TRUSTED_ORIGINS` is now resolved once per build
  // from that build's own `CLOUDFLARE_ENV`, not shared across every
  // environment — this pool's build is `local`-shaped (`CLOUDFLARE_ENV`
  // unset, see `trusted-origins.ts`'s `hostsForEnvironment`), so it carries
  // no production or staging hosts at all. What production's and staging's
  // own builds each resolve to is covered directly, for every environment,
  // by the pure-function tests in `trusted-origins.test.ts`
  // (`trustedOriginsForEnvironment`) — these prove the *consequence* end to
  // end: this build rejects every other environment's origin, the exact gap
  // ADR-0011 closed.

  it("accepts a self-trusted origin matching this build's resolved baseURL", async () => {
    // No environment-scoped host is trusted here (see above) — this passes
    // via Better Auth's baseURL self-trust instead: the request's Host
    // resolves to this same origin (see `fetchWorker`'s default Host, the
    // DEV-only `dreamport.test` pattern in `ALLOWED_HOSTS`).
    expect((await signOutFrom(ORIGIN)).status).toBe(200);
  });

  it("rejects the production origin — this build carries no environment-scoped hosts", async () => {
    expect(
      (await signOutFrom("https://dreamport.ianjmacintosh.com")).status,
    ).toBe(403);
  });

  it("rejects the long-lived staging origin, for the same reason", async () => {
    const origin = "https://dreamport-staging.bananasquad.workers.dev";
    expect((await signOutFrom(origin)).status).toBe(403);
  });

  it("rejects a branch-preview origin, for the same reason", async () => {
    const origin = "https://a1b2c3-dreamport-staging.bananasquad.workers.dev";
    expect((await signOutFrom(origin)).status).toBe(403);
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

  // #63 / docs/adr/0011: same split as the trusted-origins block above —
  // this build's `ALLOWED_HOSTS` carries no production or staging hosts, so
  // neither resolves a `baseURL` here even though each is exactly what its
  // own build resolves (see `allowedHostsForEnvironment` in
  // `trusted-origins.test.ts`).

  it("fails to resolve the production Host — this build carries no environment-scoped hosts", async () => {
    const res = await fetchAs(PRODUCTION_HOST);

    expect(res.status).toBe(500);
  });

  it("fails to resolve the long-lived staging Host, for the same reason", async () => {
    const res = await fetchAs("dreamport-staging.bananasquad.workers.dev");

    expect(res.status).toBe(500);
  });

  it("fails to resolve a branch-preview Host, for the same reason", async () => {
    const res = await fetchAs(
      "a1b2c3d4-dreamport-staging.bananasquad.workers.dev",
    );

    expect(res.status).toBe(500);
  });

  it("fails rather than self-trusting a Host matching no allowed pattern", async () => {
    const res = await fetchAs("not-a-known-host.example.com");

    expect(res.status).toBe(500);
  });
});

/** Shared by both the create/list and delete describe blocks below. */
function getProducts(cookie?: string) {
  return fetchWorker("/api/products", {
    headers: cookie ? { cookie } : {},
  });
}

/** Shared by both the create/list and delete describe blocks below. */
function addProduct(cookie: string, name: string) {
  return fetchWorker("/api/products", {
    method: "POST",
    headers: { ...json, origin: TRUSTED_ORIGIN, cookie },
    body: JSON.stringify({ name }),
  });
}

describe("/api/products (#88)", () => {
  it("rejects a request with no session", async () => {
    const res = await getProducts();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not signed in" });
  });

  it("starts empty, then lists a Product just added", async () => {
    const cookie = await signIn(TEST_EMAILS.productsAddOne);

    expect(await (await getProducts(cookie)).json()).toEqual({
      products: [],
    });

    const created = await addProduct(cookie, "A phone-scale app");
    expect(created.status).toBe(201);
    const { product } = (await created.json()) as {
      product: { id: string; name: string; createdAt: string };
    };
    expect(product.name).toBe("A phone-scale app");
    expect(product.id).toEqual(expect.any(String));

    const listed = await getProducts(cookie);
    expect(await listed.json()).toEqual({ products: [product] });
  });

  it("rejects an empty or whitespace-only name, creating nothing", async () => {
    const cookie = await signIn(TEST_EMAILS.productsInvalidName);

    const blank = await addProduct(cookie, "");
    expect(blank.status).toBe(400);
    const whitespace = await addProduct(cookie, "   ");
    expect(whitespace.status).toBe(400);

    expect(await (await getProducts(cookie)).json()).toEqual({
      products: [],
    });
  });

  it("rejects a name over the length cap, creating nothing", async () => {
    const cookie = await signIn(TEST_EMAILS.productsInvalidName);

    const tooLong = await addProduct(cookie, "x".repeat(201));
    expect(tooLong.status).toBe(400);

    expect(await (await getProducts(cookie)).json()).toEqual({
      products: [],
    });
  });

  it("only ever shows a User their own Products, never another User's", async () => {
    const cookieA = await signIn(TEST_EMAILS.productsOwnerA);
    const cookieB = await signIn(TEST_EMAILS.productsOwnerB);

    await addProduct(cookieA, "Owner A's Product");

    const asA = (await (await getProducts(cookieA)).json()) as {
      products: { name: string }[];
    };
    expect(asA.products.map((p) => p.name)).toEqual(["Owner A's Product"]);

    const asB = await getProducts(cookieB);
    expect(await asB.json()).toEqual({ products: [] });
  });
});

describe("DELETE /api/products/:productId (#89)", () => {
  function deleteProduct(id: string, cookie?: string) {
    return fetchWorker(`/api/products/${id}`, {
      method: "DELETE",
      headers: { origin: TRUSTED_ORIGIN, ...(cookie ? { cookie } : {}) },
    });
  }

  it("deletes a Product it owns, leaving the list empty again", async () => {
    const cookie = await signIn(TEST_EMAILS.productsDeleteOwn);
    const created = await addProduct(cookie, "A short-lived Product");
    const { product } = (await created.json()) as { product: { id: string } };

    const res = await deleteProduct(product.id, cookie);
    expect(res.status).toBe(200);

    expect(await (await getProducts(cookie)).json()).toEqual({
      products: [],
    });
  });
});

describe("PATCH /api/products/:productId (#112)", () => {
  function setDescription(id: string, description: unknown, cookie?: string) {
    return fetchWorker(`/api/products/${id}`, {
      method: "PATCH",
      headers: {
        ...json,
        origin: TRUSTED_ORIGIN,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify({ description }),
    });
  }

  /** Sign in and add one Product, returning both handles. */
  async function withOneProduct(email: string) {
    const cookie = await signIn(email);
    const created = await addProduct(cookie, "A phone-scale app");
    const { product } = (await created.json()) as {
      product: {
        id: string;
        name: string;
        description: string | null;
        createdAt: string;
      };
    };
    return { cookie, product };
  }

  it("starts a new Product with no description, sets one (trimmed), then clears it back to null", async () => {
    const { cookie, product } = await withOneProduct(
      TEST_EMAILS.productsDescribeOwner,
    );
    expect(product.description).toBeNull();

    const set = await setDescription(
      product.id,
      "  Turns a phone into a digital scale.  ",
      cookie,
    );
    expect(set.status).toBe(200);
    const described = {
      ...product,
      description: "Turns a phone into a digital scale.",
    };
    expect(await set.json()).toEqual({ product: described });
    expect(await (await getProducts(cookie)).json()).toEqual({
      products: [described],
    });

    for (const empty of ["", "   "]) {
      const cleared = await setDescription(product.id, empty, cookie);
      expect(cleared.status).toBe(200);
      expect(await cleared.json()).toEqual({ product });
    }
    expect(await (await getProducts(cookie)).json()).toEqual({
      products: [product],
    });
  });

  it("rejects an over-cap, missing, or non-string description, changing nothing", async () => {
    const { cookie, product } = await withOneProduct(
      TEST_EMAILS.productsDescribeInvalid,
    );

    // Exactly at the cap is fine; one over is not.
    const atCap = await setDescription(
      product.id,
      "x".repeat(PRODUCT_DESCRIPTION_MAX_LENGTH),
      cookie,
    );
    expect(atCap.status).toBe(200);
    const { product: atCapProduct } = (await atCap.json()) as {
      product: unknown;
    };

    for (const description of [
      "y".repeat(PRODUCT_DESCRIPTION_MAX_LENGTH + 1),
      undefined,
      42,
      null,
    ]) {
      const res = await setDescription(product.id, description, cookie);
      expect(res.status).toBe(400);
    }

    expect(await (await getProducts(cookie)).json()).toEqual({
      products: [atCapProduct],
    });
  });
});

/** Shared by the Ideas describe block below. */
function getIdeas(productId: string, cookie?: string) {
  return fetchWorker(`/api/products/${productId}/ideas`, {
    headers: cookie ? { cookie } : {},
  });
}

/** Shared by the Ideas describe block below. */
function addIdea(productId: string, cookie: string, name: string) {
  return fetchWorker(`/api/products/${productId}/ideas`, {
    method: "POST",
    headers: { ...json, origin: TRUSTED_ORIGIN, cookie },
    body: JSON.stringify({ name }),
  });
}

function deleteIdea(productId: string, ideaId: string, cookie?: string) {
  return fetchWorker(`/api/products/${productId}/ideas/${ideaId}`, {
    method: "DELETE",
    headers: cookie
      ? { origin: TRUSTED_ORIGIN, cookie }
      : { origin: TRUSTED_ORIGIN },
  });
}

function renameIdea(
  productId: string,
  ideaId: string,
  name: unknown,
  cookie?: string,
) {
  return fetchWorker(`/api/products/${productId}/ideas/${ideaId}`, {
    method: "PATCH",
    headers: cookie
      ? { ...json, origin: TRUSTED_ORIGIN, cookie }
      : { ...json, origin: TRUSTED_ORIGIN },
    body: JSON.stringify({ name }),
  });
}

describe("/api/products/:productId/ideas (#99)", () => {
  it("starts empty, then lists an Idea just added, alongside its Product", async () => {
    const cookie = await signIn(TEST_EMAILS.ideasAddOne);
    const created = await addProduct(cookie, "A phone-scale app");
    const { product } = (await created.json()) as {
      product: { id: string; name: string; createdAt: string };
    };

    expect(await (await getIdeas(product.id, cookie)).json()).toEqual({
      product,
      ideas: [],
    });

    const createdIdea = await addIdea(product.id, cookie, "Dark mode");
    expect(createdIdea.status).toBe(201);
    const { idea } = (await createdIdea.json()) as {
      idea: { id: string; name: string; createdAt: string };
    };
    expect(idea.name).toBe("Dark mode");
    expect(idea.id).toEqual(expect.any(String));

    expect(await (await getIdeas(product.id, cookie)).json()).toEqual({
      product,
      ideas: [idea],
    });
  });

  it("rejects an empty or whitespace-only name, creating nothing", async () => {
    const cookie = await signIn(TEST_EMAILS.ideasInvalidName);
    const created = await addProduct(cookie, "Invalid-name Product");
    const { product } = (await created.json()) as { product: { id: string } };

    const blank = await addIdea(product.id, cookie, "");
    expect(blank.status).toBe(400);
    const whitespace = await addIdea(product.id, cookie, "   ");
    expect(whitespace.status).toBe(400);

    expect(await (await getIdeas(product.id, cookie)).json()).toEqual({
      product,
      ideas: [],
    });
  });

  it("rejects a name over the length cap, creating nothing", async () => {
    const cookie = await signIn(TEST_EMAILS.ideasInvalidName);
    const created = await addProduct(cookie, "Too-long-name Product");
    const { product } = (await created.json()) as { product: { id: string } };

    const tooLong = await addIdea(product.id, cookie, "x".repeat(201));
    expect(tooLong.status).toBe(400);

    expect(await (await getIdeas(product.id, cookie)).json()).toEqual({
      product,
      ideas: [],
    });
  });

  describe("delete (#100)", () => {
    it("deletes an Idea and removes it from the list", async () => {
      const cookie = await signIn(TEST_EMAILS.ideasDeleteOwner);
      const created = await addProduct(cookie, "Delete Product");
      const { product } = (await created.json()) as { product: { id: string } };
      const idea = await addIdea(product.id, cookie, "To Be Deleted");
      const { idea: ideaData } = (await idea.json()) as {
        idea: { id: string };
      };

      expect(await (await getIdeas(product.id, cookie)).json()).toEqual({
        product,
        ideas: [ideaData],
      });

      const deleteRes = await deleteIdea(product.id, ideaData.id, cookie);
      expect(deleteRes.status).toBe(200);
      expect(await deleteRes.json()).toEqual({});

      expect(await (await getIdeas(product.id, cookie)).json()).toEqual({
        product,
        ideas: [],
      });
    });

    it("404s when trying to delete a nonexistent Idea", async () => {
      const cookie = await signIn(TEST_EMAILS.ideasDeleteNonexistent);
      const created = await addProduct(cookie, "Delete Nonexistent Product");
      const { product } = (await created.json()) as { product: { id: string } };

      const res = await deleteIdea(product.id, "not-a-real-id", cookie);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
    });
  });

  describe("rename (#102)", () => {
    /** Sign in, add a Product and one Idea under it, return all three handles. */
    async function withOneIdea(email: string, ideaName = "Dark mode") {
      const cookie = await signIn(email);
      const created = await addProduct(cookie, "Rename Product");
      const { product } = (await created.json()) as {
        product: { id: string; name: string; createdAt: string };
      };
      const createdIdea = await addIdea(product.id, cookie, ideaName);
      const { idea } = (await createdIdea.json()) as {
        idea: { id: string; name: string; createdAt: string };
      };
      return { cookie, product, idea };
    }

    it("renames an Idea, trimming the name, and lists it under the new name", async () => {
      const { cookie, product, idea } = await withOneIdea(
        TEST_EMAILS.ideasRenameOwner,
      );

      const res = await renameIdea(
        product.id,
        idea.id,
        "  Light mode  ",
        cookie,
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        idea: { ...idea, name: "Light mode" },
      });

      expect(await (await getIdeas(product.id, cookie)).json()).toEqual({
        product,
        ideas: [{ ...idea, name: "Light mode" }],
      });
    });

    it("rejects an empty, whitespace-only, missing, or over-cap name, changing nothing", async () => {
      const { cookie, product, idea } = await withOneIdea(
        TEST_EMAILS.ideasRenameInvalidName,
      );

      for (const name of ["", "   ", undefined, 42, "x".repeat(201)]) {
        const res = await renameIdea(product.id, idea.id, name, cookie);
        expect(res.status).toBe(400);
      }

      expect(await (await getIdeas(product.id, cookie)).json()).toEqual({
        product,
        ideas: [idea],
      });
    });

    it("404s when renaming a nonexistent Idea", async () => {
      const { cookie, product } = await withOneIdea(
        TEST_EMAILS.ideasRenameNonexistent,
      );

      const noIdea = await renameIdea(product.id, "not-a-real-id", "X", cookie);
      expect(noIdea.status).toBe(404);
      expect(await noIdea.json()).toEqual({ error: "Not found" });
    });
  });
});

/** The six starter Tags (#111), in the catalog's own alphabetical order. */
const TAG_CATALOG = [
  "Design",
  "Distribution",
  "Functionality",
  "Pricing",
  "Promotion",
  "Staffing",
];

function setIdeaTags(
  productId: string,
  ideaId: string,
  tags: unknown,
  cookie?: string,
) {
  return fetchWorker(`/api/products/${productId}/ideas/${ideaId}/tags`, {
    method: "PUT",
    headers: cookie
      ? { ...json, origin: TRUSTED_ORIGIN, cookie }
      : { ...json, origin: TRUSTED_ORIGIN },
    body: JSON.stringify({ tags }),
  });
}

describe("GET /api/tags (#113)", () => {
  it("lists the fixed Tag catalog, with no session needed", async () => {
    const res = await fetchWorker("/api/tags");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tags: TAG_CATALOG });
  });
});

describe("PUT /api/products/:productId/ideas/:id/tags (#113)", () => {
  async function withOneIdea(email: string, ideaName = "Dark mode") {
    const cookie = await signIn(email);
    const created = await addProduct(cookie, "A phone-scale app");
    const { product } = (await created.json()) as {
      product: { id: string; name: string; createdAt: string };
    };
    const createdIdea = await addIdea(product.id, cookie, ideaName);
    const { idea } = (await createdIdea.json()) as {
      idea: { id: string; name: string; createdAt: string; tags: string[] };
    };
    return { cookie, product, idea };
  }

  it("starts an Idea with no tags, sets them, replaces them, and lists them with the Idea", async () => {
    const { cookie, product, idea } = await withOneIdea(
      TEST_EMAILS.ideasTagsOwner,
    );
    expect(idea.tags).toEqual([]);

    // Submitted out of order and with a duplicate; stored once each, sorted.
    const set = await setIdeaTags(
      product.id,
      idea.id,
      ["Pricing", "Design", "Pricing"],
      cookie,
    );
    expect(set.status).toBe(200);
    expect(await set.json()).toEqual({ tags: ["Design", "Pricing"] });
    expect(await (await getIdeas(product.id, cookie)).json()).toEqual({
      product,
      ideas: [{ ...idea, tags: ["Design", "Pricing"] }],
    });

    // The whole set is replaced, not added to.
    const replaced = await setIdeaTags(
      product.id,
      idea.id,
      ["Staffing"],
      cookie,
    );
    expect(await replaced.json()).toEqual({ tags: ["Staffing"] });

    const cleared = await setIdeaTags(product.id, idea.id, [], cookie);
    expect(await cleared.json()).toEqual({ tags: [] });
    expect(await (await getIdeas(product.id, cookie)).json()).toEqual({
      product,
      ideas: [idea],
    });
  });

  it("lists each Idea with its own tags, not another Idea's", async () => {
    const { cookie, product, idea } = await withOneIdea(
      TEST_EMAILS.ideasTagsOwner,
    );
    const second = await addIdea(product.id, cookie, "Light mode");
    const { idea: other } = (await second.json()) as {
      idea: { id: string; name: string; createdAt: string; tags: string[] };
    };

    await setIdeaTags(product.id, idea.id, ["Design"], cookie);
    await setIdeaTags(product.id, other.id, ["Pricing", "Promotion"], cookie);

    expect(await (await getIdeas(product.id, cookie)).json()).toEqual({
      product,
      ideas: [
        { ...idea, tags: ["Design"] },
        { ...other, tags: ["Pricing", "Promotion"] },
      ],
    });
  });

  it("rejects an unknown tag name or a malformed body with a 400, changing nothing", async () => {
    const { cookie, product, idea } = await withOneIdea(
      TEST_EMAILS.ideasTagsInvalid,
    );
    await setIdeaTags(product.id, idea.id, ["Design"], cookie);

    for (const tags of [
      ["Design", "Not a real tag"],
      ["design"],
      "Design",
      undefined,
      [42],
    ]) {
      const res = await setIdeaTags(product.id, idea.id, tags, cookie);
      expect(res.status).toBe(400);
    }

    expect(await (await getIdeas(product.id, cookie)).json()).toEqual({
      product,
      ideas: [{ ...idea, tags: ["Design"] }],
    });
  });

  it("404s when tagging a nonexistent Idea", async () => {
    const { cookie, product } = await withOneIdea(
      TEST_EMAILS.ideasTagsNonexistent,
    );

    const noIdea = await setIdeaTags(
      product.id,
      "not-a-real-id",
      ["Design"],
      cookie,
    );
    expect(noIdea.status).toBe(404);
    expect(await noIdea.json()).toEqual({ error: "Not found" });
  });

  it("keeps an Idea's tags across a rename, and returns them with it", async () => {
    const { cookie, product, idea } = await withOneIdea(
      TEST_EMAILS.ideasTagsOwner,
    );
    await setIdeaTags(product.id, idea.id, ["Design"], cookie);

    const res = await renameIdea(product.id, idea.id, "Light mode", cookie);
    expect(await res.json()).toEqual({
      idea: { ...idea, name: "Light mode", tags: ["Design"] },
    });
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

/*
 * The Journey routes (#137-#140), one test each: status, response shape,
 * and the 404 when there's no Journey. What a Journey does — Advance
 * through every Milestone, Return, saving Worksheets, checking off Tasks —
 * is covered at the module's own interface in `journeys.worker.test.ts`.
 */

function getJourney(productId: string, cookie?: string) {
  return fetchWorker(`/api/products/${productId}/journey`, {
    headers: cookie ? { cookie } : {},
  });
}

function startJourney(productId: string, cookie?: string) {
  return fetchWorker(`/api/products/${productId}/journey`, {
    method: "POST",
    headers: cookie
      ? { origin: TRUSTED_ORIGIN, cookie }
      : { origin: TRUSTED_ORIGIN },
  });
}

function advanceJourney(productId: string, cookie?: string) {
  return fetchWorker(`/api/products/${productId}/journey/advance`, {
    method: "POST",
    headers: cookie
      ? { origin: TRUSTED_ORIGIN, cookie }
      : { origin: TRUSTED_ORIGIN },
  });
}

function returnJourney(productId: string, cookie?: string) {
  return fetchWorker(`/api/products/${productId}/journey/return`, {
    method: "POST",
    headers: cookie
      ? { origin: TRUSTED_ORIGIN, cookie }
      : { origin: TRUSTED_ORIGIN },
  });
}

function getWorksheet(productId: string, worksheetId: string, cookie?: string) {
  return fetchWorker(`/api/products/${productId}/worksheets/${worksheetId}`, {
    headers: cookie ? { cookie } : {},
  });
}

function saveWorksheet(
  productId: string,
  worksheetId: string,
  answers: unknown,
  cookie?: string,
) {
  return fetchWorker(`/api/products/${productId}/worksheets/${worksheetId}`, {
    method: "PUT",
    headers: {
      ...json,
      origin: TRUSTED_ORIGIN,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ answers }),
  });
}

function putTask(
  productId: string,
  taskId: string,
  done: unknown,
  cookie?: string,
) {
  return fetchWorker(`/api/products/${productId}/tasks/${taskId}`, {
    method: "PUT",
    headers: {
      ...json,
      origin: TRUSTED_ORIGIN,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ done }),
  });
}

type JourneyResponse = Awaited<ReturnType<typeof journeyState>>;
type WorksheetResponse = NonNullable<
  Awaited<ReturnType<typeof worksheetState>>
> & {
  product: { id: string; name: string };
};

const PRODUCT_SUMMARY = "product-summary";
const TALK_TASK = "talk-to-five-customers";

/** Sign in and add a Product, with no Journey yet. */
async function unstartedProduct(email: string) {
  const cookie = await signIn(email);
  const { product } = (await (
    await addProduct(cookie, "A phone-scale app")
  ).json()) as { product: { id: string; name: string } };
  return { cookie, product };
}

describe("Journey routes", () => {
  it("GET /journey answers the Path and no Journey before one starts, with the Product", async () => {
    const { cookie, product } = await unstartedProduct(
      TEST_EMAILS.journeysState,
    );

    const res = await getJourney(product.id, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as JourneyResponse & {
      product: { id: string; name: string };
    };
    expect(body).toEqual({
      product,
      path: {
        id: expect.any(String),
        name: expect.any(String),
        milestones: expect.any(Array),
      },
      journey: null,
      worksheets: expect.any(Array),
      tasks: expect.any(Array),
    });
    expect(body.path.milestones[0]).toEqual({
      id: expect.any(String),
      name: "Rough One-Pager",
      description: expect.stringMatching(/^Define your product in plain terms/),
      doneWhen:
        "Someone else can read it, say it in their own words, and you agree.",
      outcome: "Make a one-page summary of your understanding",
    });
  });

  it("POST /journey starts with a 201, then answers a repeat start with a 200 and the same state", async () => {
    const { cookie, product } = await unstartedProduct(
      TEST_EMAILS.journeysStart,
    );

    const started = await startJourney(product.id, cookie);
    expect(started.status).toBe(201);
    const body = (await started.json()) as JourneyResponse;
    expect(body.journey).toEqual({
      startedAt: expect.any(String),
      currentMilestoneId: body.path.milestones[0].id,
      finishedAt: null,
    });

    const again = await startJourney(product.id, cookie);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(body);
  });

  it("POST /journey/advance 404s with no Journey, then answers the advanced state", async () => {
    const { cookie, product } = await unstartedProduct(
      TEST_EMAILS.journeysAdvance,
    );
    expect((await advanceJourney(product.id, cookie)).status).toBe(404);

    await startJourney(product.id, cookie);
    const res = await advanceJourney(product.id, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as JourneyResponse;
    expect(body.journey?.currentMilestoneId).toBe(body.path.milestones[1].id);
  });

  it("POST /journey/return 404s with no Journey, then answers the returned state", async () => {
    const { cookie, product } = await unstartedProduct(
      TEST_EMAILS.journeysReturn,
    );
    expect((await returnJourney(product.id, cookie)).status).toBe(404);

    await startJourney(product.id, cookie);
    await advanceJourney(product.id, cookie);
    const res = await returnJourney(product.id, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as JourneyResponse;
    expect(body.journey?.currentMilestoneId).toBe(body.path.milestones[0].id);
  });

  it("GET /worksheets/:worksheetId 404s with no Journey or no such Worksheet, else answers it with the Product", async () => {
    const { cookie, product } = await unstartedProduct(
      TEST_EMAILS.worksheetsRead,
    );
    expect(
      (await getWorksheet(product.id, PRODUCT_SUMMARY, cookie)).status,
    ).toBe(404);

    await startJourney(product.id, cookie);
    const res = await getWorksheet(product.id, PRODUCT_SUMMARY, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as WorksheetResponse;
    expect(body).toEqual({
      product,
      worksheet: {
        id: PRODUCT_SUMMARY,
        name: "Product Summary",
        cardinality: "singleton",
        fields: expect.any(Array),
        milestoneIds: expect.any(Array),
      },
      answers: {},
    });
    expect(body.worksheet.fields[0]).toEqual({
      id: "problem",
      name: expect.any(String),
      prompt: expect.any(String),
    });

    expect(
      (await getWorksheet(product.id, "not-a-worksheet", cookie)).status,
    ).toBe(404);
  });

  it("PUT /worksheets/:worksheetId 404s with no Journey or no such Worksheet, 400s a bad body, else answers the trimmed answers", async () => {
    const { cookie, product } = await unstartedProduct(
      TEST_EMAILS.worksheetsSave,
    );
    expect(
      (
        await saveWorksheet(
          product.id,
          PRODUCT_SUMMARY,
          { problem: "x" },
          cookie,
        )
      ).status,
    ).toBe(404);

    await startJourney(product.id, cookie);
    const saved = await saveWorksheet(
      product.id,
      PRODUCT_SUMMARY,
      { problem: "  Kitchen scales are clunky  ", customer: "   " },
      cookie,
    );
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as WorksheetResponse;
    expect(body.product).toEqual(product);
    expect(body.worksheet.id).toBe(PRODUCT_SUMMARY);
    expect(body.answers).toEqual({ problem: "Kitchen scales are clunky" });

    for (const answers of [
      { problem: "x", "key-metrics": "x" },
      { problem: 42 },
      { problem: "x".repeat(WORKSHEET_ANSWER_MAX_LENGTH + 1) },
      ["x"],
      "x",
      null,
    ]) {
      expect(
        (await saveWorksheet(product.id, PRODUCT_SUMMARY, answers, cookie))
          .status,
      ).toBe(400);
    }
    expect(
      (
        (await (
          await getWorksheet(product.id, PRODUCT_SUMMARY, cookie)
        ).json()) as WorksheetResponse
      ).answers,
    ).toEqual({ problem: "Kitchen scales are clunky" });

    expect(
      (
        await saveWorksheet(
          product.id,
          "not-a-worksheet",
          { problem: "x" },
          cookie,
        )
      ).status,
    ).toBe(404);
  });

  it("PUT /tasks/:taskId 404s with no Journey or no such Task, 400s a non-boolean done, else answers the Journey's state", async () => {
    const { cookie, product } = await unstartedProduct(
      TEST_EMAILS.tasksCheckOff,
    );
    expect((await putTask(product.id, TALK_TASK, true, cookie)).status).toBe(
      404,
    );

    await startJourney(product.id, cookie);
    for (const done of ["true", 1, null, undefined]) {
      expect((await putTask(product.id, TALK_TASK, done, cookie)).status).toBe(
        400,
      );
    }
    expect((await putTask(product.id, "not-a-task", true, cookie)).status).toBe(
      404,
    );

    const res = await putTask(product.id, TALK_TASK, true, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as JourneyResponse;
    expect(body.journey).not.toBeNull();
    expect(body.tasks.find((t) => t.id === TALK_TASK)).toEqual({
      id: TALK_TASK,
      title: "Talk to 5 potential customers",
      milestoneIds: [body.path.milestones[1].id],
      done: true,
    });
  });
});

/*
 * The Trailblazer routes (#167), one test each: status and response shape.
 * The 401 and the 404 for someone else's Path are checked for every route
 * under "request gates" below. What a Draft does is covered at the
 * module's own interface in `paths.worker.test.ts`.
 */

/** A request as the signed-in browser sends it, JSON body and all. */
function callApi(
  method: string,
  path: string,
  cookie?: string,
  body?: unknown,
) {
  return fetchWorker(path, {
    method,
    headers: {
      ...json,
      origin: TRUSTED_ORIGIN,
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

interface PathJson {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

async function addPath(cookie: string, name = "Weekend Launch") {
  const res = await callApi("POST", "/api/paths", cookie, {
    name,
    description: "Two days to sign-ups.",
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { path: PathJson }).path;
}

const MILESTONE = {
  name: "Pick One Problem",
  description: "Write down the one problem.",
  doneWhen: "You can say it in one sentence.",
  outcome: "",
};

describe("Trailblazer routes", () => {
  it("GET and POST /api/paths list and add the User's Paths", async () => {
    expect((await callApi("GET", "/api/paths")).status).toBe(401);
    const cookie = await signIn(TEST_EMAILS.pathsRoutesList);
    expect(await (await callApi("GET", "/api/paths", cookie)).json()).toEqual({
      paths: [],
    });

    const blank = await callApi("POST", "/api/paths", cookie, { name: " " });
    expect(blank.status).toBe(400);
    expect(await blank.json()).toEqual({ error: "name is required" });

    const path = await addPath(cookie, "  Weekend Launch ");
    expect(path).toEqual({
      id: expect.any(String),
      name: "Weekend Launch",
      description: "Two days to sign-ups.",
      createdAt: expect.any(String),
    });
    expect(await (await callApi("GET", "/api/paths", cookie)).json()).toEqual({
      paths: [
        { id: path.id, name: "Weekend Launch", createdAt: path.createdAt },
      ],
    });
  });

  it("POST /api/paths refuses a Path past the cap with 409", async () => {
    const cookie = await signIn(TEST_EMAILS.pathsRoutesCap);
    for (let i = 0; i < 30; i++) {
      await addPath(cookie, `Path ${i}`);
    }

    const res = await callApi("POST", "/api/paths", cookie, { name: "More" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "You can have up to 30 Paths." });
    const { paths } = (await (
      await callApi("GET", "/api/paths", cookie)
    ).json()) as { paths: unknown[] };
    expect(paths).toHaveLength(30);
  });

  it("GET and PATCH /api/paths/:pathId read and edit the Draft", async () => {
    const cookie = await signIn(TEST_EMAILS.pathsRoutesDraft);
    const path = await addPath(cookie);

    const read = await callApi("GET", `/api/paths/${path.id}`, cookie);
    expect(await read.json()).toEqual({ draft: { ...path, milestones: [] } });

    const invalid = await callApi("PATCH", `/api/paths/${path.id}`, cookie, {
      name: "",
    });
    expect(invalid.status).toBe(400);

    const patched = await callApi("PATCH", `/api/paths/${path.id}`, cookie, {
      name: "Weekday Launch",
      description: "",
    });
    expect(patched.status).toBe(200);
    expect(await patched.json()).toEqual({
      path: { ...path, name: "Weekday Launch", description: "" },
    });
  });

  it("POST, PATCH and DELETE /api/paths/:pathId/milestones add, edit and remove a Milestone", async () => {
    const cookie = await signIn(TEST_EMAILS.pathsRoutesDraft);
    const path = await addPath(cookie);
    const base = `/api/paths/${path.id}/milestones`;

    const invalid = await callApi("POST", base, cookie, {
      ...MILESTONE,
      doneWhen: "",
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "doneWhen is required" });

    const added = await callApi("POST", base, cookie, MILESTONE);
    expect(added.status).toBe(201);
    const { milestone } = (await added.json()) as {
      milestone: { id: string };
    };
    expect(milestone).toEqual({
      id: expect.any(String),
      ...MILESTONE,
      tasks: [],
    });

    const edited = { ...MILESTONE, outcome: "A problem worth a weekend" };
    const patched = await callApi(
      "PATCH",
      `${base}/${milestone.id}`,
      cookie,
      edited,
    );
    expect(patched.status).toBe(200);
    expect(await patched.json()).toEqual({
      milestone: { id: milestone.id, ...edited },
    });
    expect(
      (await callApi("PATCH", `${base}/no-such-milestone`, cookie, edited))
        .status,
    ).toBe(404);

    expect(
      (await callApi("DELETE", `${base}/${milestone.id}`, cookie)).status,
    ).toBe(200);
    expect(
      (await callApi("DELETE", `${base}/${milestone.id}`, cookie)).status,
    ).toBe(404);
  });

  it("PUT /api/paths/:pathId/milestones/order reorders, or 409s on a stale list", async () => {
    const cookie = await signIn(TEST_EMAILS.pathsRoutesDraft);
    const path = await addPath(cookie);
    const base = `/api/paths/${path.id}/milestones`;
    const ids: string[] = [];
    for (const name of ["First", "Second"]) {
      const res = await callApi("POST", base, cookie, { ...MILESTONE, name });
      ids.push(
        ((await res.json()) as { milestone: { id: string } }).milestone.id,
      );
    }
    const order = () =>
      callApi("GET", `/api/paths/${path.id}`, cookie)
        .then((res) => res.json())
        .then((body) =>
          (
            body as { draft: { milestones: { name: string }[] } }
          ).draft.milestones.map((m) => m.name),
        );

    expect(
      (await callApi("PUT", `${base}/order`, cookie, { ids: "nope" })).status,
    ).toBe(400);

    const stale = await callApi("PUT", `${base}/order`, cookie, {
      ids: [ids[1]],
    });
    expect(stale.status).toBe(409);
    expect(await order()).toEqual(["First", "Second"]);

    const reordered = await callApi("PUT", `${base}/order`, cookie, {
      ids: [ids[1], ids[0]],
    });
    expect(reordered.status).toBe(200);
    expect(await order()).toEqual(["Second", "First"]);
  });

  it("POST /api/paths/:pathId/milestones/:milestoneId/tasks adds a Task, 400s a blank title and 404s an unknown Milestone", async () => {
    const cookie = await signIn(TEST_EMAILS.pathsRoutesDraft);
    const path = await addPath(cookie);
    const milestoneId = await addMilestoneOn(cookie, path.id);
    const tasks = `/api/paths/${path.id}/milestones/${milestoneId}/tasks`;

    const blank = await callApi("POST", tasks, cookie, { title: " " });
    expect(blank.status).toBe(400);
    expect(await blank.json()).toEqual({ error: "title is required" });
    expect(
      (
        await callApi(
          "POST",
          `/api/paths/${path.id}/milestones/no-such-milestone/tasks`,
          cookie,
          { title: "Lost" },
        )
      ).status,
    ).toBe(404);

    const added = await callApi("POST", tasks, cookie, { title: " Ask " });
    expect(added.status).toBe(201);
    const { task } = (await added.json()) as { task: { id: string } };
    expect(task).toEqual({ id: expect.any(String), title: "Ask" });
    expect(await draftTasks(cookie, path.id)).toEqual([[task]]);
  });

  it("PATCH and DELETE /api/paths/:pathId/milestones/:milestoneId/tasks/:taskId edit and remove a Task", async () => {
    const cookie = await signIn(TEST_EMAILS.pathsRoutesDraft);
    const path = await addPath(cookie);
    const milestoneId = await addMilestoneOn(cookie, path.id);
    const tasks = `/api/paths/${path.id}/milestones/${milestoneId}/tasks`;
    const taskId = await addTaskOn(cookie, tasks, "Ask");

    expect(
      (await callApi("PATCH", `${tasks}/${taskId}`, cookie, { title: "" }))
        .status,
    ).toBe(400);
    const patched = await callApi("PATCH", `${tasks}/${taskId}`, cookie, {
      title: "Ask five people",
    });
    expect(patched.status).toBe(200);
    expect(await patched.json()).toEqual({
      task: { id: taskId, title: "Ask five people" },
    });
    expect(
      (
        await callApi("PATCH", `${tasks}/no-such-task`, cookie, {
          title: "X",
        })
      ).status,
    ).toBe(404);

    expect((await callApi("DELETE", `${tasks}/${taskId}`, cookie)).status).toBe(
      200,
    );
    expect((await callApi("DELETE", `${tasks}/${taskId}`, cookie)).status).toBe(
      404,
    );
    expect(await draftTasks(cookie, path.id)).toEqual([[]]);
  });

  it("PUT /api/paths/:pathId/milestones/:milestoneId/tasks/order reorders, or 409s on a stale list", async () => {
    const cookie = await signIn(TEST_EMAILS.pathsRoutesDraft);
    const path = await addPath(cookie);
    const milestoneId = await addMilestoneOn(cookie, path.id);
    const tasks = `/api/paths/${path.id}/milestones/${milestoneId}/tasks`;
    const first = await addTaskOn(cookie, tasks, "First");
    const second = await addTaskOn(cookie, tasks, "Second");
    const titles = async () =>
      (await draftTasks(cookie, path.id))[0].map((t) => t.title);

    expect(
      (await callApi("PUT", `${tasks}/order`, cookie, { ids: "nope" })).status,
    ).toBe(400);

    const stale = await callApi("PUT", `${tasks}/order`, cookie, {
      ids: [second],
    });
    expect(stale.status).toBe(409);
    expect(await titles()).toEqual(["First", "Second"]);

    const reordered = await callApi("PUT", `${tasks}/order`, cookie, {
      ids: [second, first],
    });
    expect(reordered.status).toBe(200);
    expect(await titles()).toEqual(["Second", "First"]);
  });

  it("POST of a Milestone or a Task past 150 Milestones and Tasks combined is refused with 409", async () => {
    const cookie = await signIn(TEST_EMAILS.pathsRoutesDraft);
    const path = await addPath(cookie);
    const milestoneId = await addMilestoneOn(cookie, path.id);
    await env.DB.batch(
      Array.from({ length: 149 }, (_, i) =>
        env.DB.prepare(
          'INSERT INTO "draft_tasks" ("id", "milestoneId", "position", "title") VALUES (?, ?, ?, ?)',
        ).bind(crypto.randomUUID(), milestoneId, i + 1, `Task ${i + 1}`),
      ),
    );
    const capError = {
      error:
        "A Path can have up to 150 Milestones and Tasks combined. Remove one to make room.",
    };

    const milestone = await callApi(
      "POST",
      `/api/paths/${path.id}/milestones`,
      cookie,
      MILESTONE,
    );
    expect(milestone.status).toBe(409);
    expect(await milestone.json()).toEqual(capError);

    const task = await callApi(
      "POST",
      `/api/paths/${path.id}/milestones/${milestoneId}/tasks`,
      cookie,
      { title: "One more" },
    );
    expect(task.status).toBe(409);
    expect(await task.json()).toEqual(capError);
    expect((await draftTasks(cookie, path.id)).flat()).toHaveLength(149);
  });
});

async function addMilestoneOn(cookie: string, pathId: string) {
  const res = await callApi(
    "POST",
    `/api/paths/${pathId}/milestones`,
    cookie,
    MILESTONE,
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { milestone: { id: string } }).milestone.id;
}

async function addTaskOn(cookie: string, tasksUrl: string, title: string) {
  const res = await callApi("POST", tasksUrl, cookie, { title });
  expect(res.status).toBe(201);
  return ((await res.json()) as { task: { id: string } }).task.id;
}

async function draftTasks(cookie: string, pathId: string) {
  const res = await callApi("GET", `/api/paths/${pathId}`, cookie);
  const { draft } = (await res.json()) as {
    draft: { milestones: { tasks: { id: string; title: string }[] }[] };
  };
  return draft.milestones.map((m) => m.tasks);
}

/**
 * The two gates in front of Dreamport's own routes (#154), checked across
 * every route the app registers rather than one endpoint at a time, so a
 * route added later is covered without anyone remembering to add a test.
 */
describe("request gates, across every route (#154)", () => {
  const UNTRUSTED_ORIGIN = "https://evil.example";
  const routes = app.routes.filter((route) => route.method !== "ALL");

  /** `path` with each `:param` replaced from `params`; throws on one it lacks. */
  function fill(path: string, params: Record<string, string>) {
    return path.replace(/:(\w+)/g, (_, name: string) => {
      const value = params[name];
      if (value === undefined) {
        throw new Error(`no value for :${name} in ${path}`);
      }
      return value;
    });
  }

  describe("origin", () => {
    const changing = routes.filter(
      (route) =>
        route.method !== "GET" &&
        route.path.startsWith("/api/") &&
        !route.path.startsWith("/api/auth/"),
    );

    it("finds the routes that change data", () => {
      expect(changing.length).toBeGreaterThan(0);
    });

    it.each(changing.map((route) => [route.method, route.path]))(
      "%s %s refuses an untrusted origin before checking the session",
      async (method, path) => {
        const res = await fetchWorker(path.replace(/:\w+/g, "some-id"), {
          method,
          headers: { origin: UNTRUSTED_ORIGIN },
        });

        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: "Invalid origin" });
      },
    );

    it("refuses an untrusted origin on an unknown /api path too", async () => {
      const res = await fetchWorker("/api/no-such-route", {
        method: "POST",
        headers: { origin: UNTRUSTED_ORIGIN },
      });

      expect(res.status).toBe(403);
    });
  });

  describe("Product ownership", () => {
    const productScoped = routes.filter((route) =>
      route.path.startsWith("/api/products/:"),
    );

    /**
     * The owner's Product, with one of everything a product-scoped route
     * can name — an Idea, a started Journey (so its Worksheet exists), a
     * Task — so a route that skipped the ownership check would succeed
     * against it rather than 404 for some other reason.
     */
    async function ownedProduct() {
      const cookie = await signIn(TEST_EMAILS.gatesOwner);
      const { product } = (await (
        await addProduct(cookie, "A phone-scale app")
      ).json()) as { product: { id: string } };
      const { idea } = (await (
        await addIdea(product.id, cookie, "Dark mode")
      ).json()) as { idea: { id: string } };
      expect((await startJourney(product.id, cookie)).status).toBe(201);
      return {
        cookie,
        params: {
          productId: product.id,
          id: idea.id,
          worksheetId: PRODUCT_SUMMARY,
          taskId: TALK_TASK,
        },
      };
    }

    it("finds the product-scoped routes", () => {
      expect(productScoped.length).toBeGreaterThan(0);
    });

    it.each(productScoped.map((route) => [route.method, route.path]))(
      "%s %s answers only the Product's owner",
      async (method, path) => {
        const owner = await ownedProduct();
        const stranger = await signIn(TEST_EMAILS.gatesStranger);
        const request = (params: Record<string, string>, cookie?: string) =>
          fetchWorker(fill(path, params), {
            method,
            headers: {
              origin: TRUSTED_ORIGIN,
              ...(cookie ? { cookie } : {}),
            },
          });

        const signedOut = await request(owner.params);
        expect(signedOut.status).toBe(401);
        expect(await signedOut.json()).toEqual({ error: "Not signed in" });

        // Someone else's Product reads exactly like one that doesn't exist.
        const asStranger = await request(owner.params, stranger);
        const nonexistent = await request(
          { ...owner.params, productId: "no-such-product" },
          owner.cookie,
        );
        expect(asStranger.status).toBe(404);
        expect(await asStranger.json()).toEqual(await nonexistent.json());
        expect(nonexistent.status).toBe(404);

        // The control: the owner gets past the gate with the same params.
        expect((await request(owner.params, owner.cookie)).status).not.toBe(
          404,
        );
      },
    );
  });

  describe("Path ownership", () => {
    const pathScoped = routes.filter((route) =>
      route.path.startsWith("/api/paths/:"),
    );

    async function ownedPath() {
      const cookie = await signIn(TEST_EMAILS.gatesOwner);
      const path = await addPath(cookie);
      const milestoneId = await addMilestoneOn(cookie, path.id);
      const taskId = await addTaskOn(
        cookie,
        `/api/paths/${path.id}/milestones/${milestoneId}/tasks`,
        "Ask",
      );
      return { cookie, params: { pathId: path.id, milestoneId, taskId } };
    }

    it("finds the path-scoped routes", () => {
      expect(pathScoped.length).toBeGreaterThan(0);
    });

    it.each(pathScoped.map((route) => [route.method, route.path]))(
      "%s %s answers only the Path's owner",
      async (method, path) => {
        const owner = await ownedPath();
        const stranger = await signIn(TEST_EMAILS.gatesStranger);
        const request = (params: Record<string, string>, cookie?: string) =>
          callApi(
            method,
            fill(path, params),
            cookie,
            method === "GET" ? undefined : {},
          );

        const signedOut = await request(owner.params);
        expect(signedOut.status).toBe(401);
        expect(await signedOut.json()).toEqual({ error: "Not signed in" });

        // Someone else's Path, and Dreamport's own, read exactly like one
        // that doesn't exist.
        const nonexistent = await request(
          { ...owner.params, pathId: "no-such-path" },
          owner.cookie,
        );
        expect(nonexistent.status).toBe(404);
        const asStranger = await request(owner.params, stranger);
        expect(asStranger.status).toBe(404);
        expect(await asStranger.json()).toEqual(await nonexistent.json());
        const dreamports = await request(
          { ...owner.params, pathId: "dream-sequence" },
          owner.cookie,
        );
        expect(dreamports.status).toBe(404);

        // The control: the owner gets past the gate with the same params.
        expect((await request(owner.params, owner.cookie)).status).not.toBe(
          404,
        );
      },
    );
  });
});
