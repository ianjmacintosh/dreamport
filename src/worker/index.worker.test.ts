import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAuth } from "./auth";
import { getMockSender, type EmailSender, type OtpEmail } from "./email/sender";

/**
 * Seam 1 — the Worker's HTTP boundary.
 *
 * These run inside workerd (via @cloudflare/vitest-pool-workers) with the
 * real `DB` binding and per-test isolated storage. `test/apply-migrations.ts`
 * has already applied `migrations/0001_*.sql` to a fresh database.
 *
 * The auth flow is driven entirely through `Request`s; the 6-digit code is
 * recovered from the shared mock email sender, which the Worker and this
 * test share by module identity. Every address ends in `@resend.dev`.
 */

const ORIGIN = "https://dreamport.test";
const json = { "content-type": "application/json" };

function sendCode(email: string) {
  return SELF.fetch(`${ORIGIN}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ email, type: "sign-in" }),
  });
}

function verifyCode(email: string, otp: string) {
  return SELF.fetch(`${ORIGIN}/api/auth/sign-in/email-otp`, {
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

beforeEach(() => {
  getMockSender().clear();
});

describe("non-/api paths", () => {
  it("serves the SPA shell from the asset layer, not the Worker", async () => {
    const res = await SELF.fetch(`${ORIGIN}/`);

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('data-fixture="spa-shell"');
  });

  it("falls back to the SPA shell for unknown client routes", async () => {
    const res = await SELF.fetch(`${ORIGIN}/some/client/route`);

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('data-fixture="spa-shell"');
  });
});

describe("/api/auth/* is mounted", () => {
  it("GET /api/auth/ok returns { ok: true }", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/auth/ok`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("send a sign-in code", () => {
  it("succeeds and hands the mock sender a 6-digit code for that email", async () => {
    const res = await sendCode("send-basic@resend.dev");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(codeFor("send-basic@resend.dev")).toMatch(/^\d{6}$/);
  });

  it("looks identical for a known and an unknown email", async () => {
    await signIn("known-sender@resend.dev");
    getMockSender().clear();

    const known = await sendCode("known-sender@resend.dev");
    const unknown = await sendCode("stranger@resend.dev");

    expect(known.status).toBe(unknown.status);
    expect(await known.json()).toEqual(await unknown.json());
    expect(known.status).toBe(200);
  });
});

describe("verify a sign-in code", () => {
  it("issues a host-only, secure, http-only session cookie on the right code", async () => {
    await sendCode("verify-ok@resend.dev");

    const res = await verifyCode(
      "verify-ok@resend.dev",
      codeFor("verify-ok@resend.dev"),
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
    expect((await countUsers("fresh-user@resend.dev"))?.n).toBe(0);

    await sendCode("fresh-user@resend.dev");
    const res = await verifyCode(
      "fresh-user@resend.dev",
      codeFor("fresh-user@resend.dev"),
    );

    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toContain("session_token=");
    expect((await countUsers("fresh-user@resend.dev"))?.n).toBe(1);
  });

  it("rejects a wrong code, decrements the budget, then locks out the 4th try", async () => {
    await sendCode("attempts@resend.dev");
    const right = codeFor("attempts@resend.dev");
    const wrong = notCode(right);

    for (let i = 0; i < 3; i++) {
      const res = await verifyCode("attempts@resend.dev", wrong);
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe("INVALID_OTP");
    }

    // 4th attempt is refused even though the code is correct.
    const res = await verifyCode("attempts@resend.dev", right);
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe("TOO_MANY_ATTEMPTS");
  });

  it("rejects a code past its 60-minute expiry", async () => {
    await sendCode("expired@resend.dev");
    const code = codeFor("expired@resend.dev");
    await expireCode("expired@resend.dev");

    const res = await verifyCode("expired@resend.dev", code);
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe("OTP_EXPIRED");
  });

  it("issues a working code again after the previous one expired", async () => {
    await sendCode("reissue-expiry@resend.dev");
    await expireCode("reissue-expiry@resend.dev");
    getMockSender().clear();

    await sendCode("reissue-expiry@resend.dev");
    const res = await verifyCode(
      "reissue-expiry@resend.dev",
      codeFor("reissue-expiry@resend.dev"),
    );

    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toContain("session_token=");
  });

  it("issues a working code again after the attempt budget was exhausted", async () => {
    await sendCode("reissue-exhausted@resend.dev");
    const wrong = notCode(codeFor("reissue-exhausted@resend.dev"));
    for (let i = 0; i < 4; i++) {
      await verifyCode("reissue-exhausted@resend.dev", wrong);
    }
    getMockSender().clear();

    await sendCode("reissue-exhausted@resend.dev");
    const res = await verifyCode(
      "reissue-exhausted@resend.dev",
      codeFor("reissue-exhausted@resend.dev"),
    );

    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toContain("session_token=");
  });

  it("fails identically for a wrong code whether or not the email is known", async () => {
    await signIn("known-verify@resend.dev");
    getMockSender().clear();

    await sendCode("known-verify@resend.dev");
    await sendCode("unknown-verify@resend.dev");

    // One string that is wrong for both live codes.
    const wrong = [
      codeFor("known-verify@resend.dev"),
      codeFor("unknown-verify@resend.dev"),
    ].includes("000000")
      ? "999999"
      : "000000";

    const known = await verifyCode("known-verify@resend.dev", wrong);
    const unknown = await verifyCode("unknown-verify@resend.dev", wrong);

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
    };

    const auth = createAuth(env, { emailSender: spy });
    const res = await auth.api.sendVerificationOTP({
      body: { email: "injected@resend.dev", type: "sign-in" },
      asResponse: true,
    });

    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      to: "injected@resend.dev",
      type: "sign-in",
    });
    expect(captured[0].otp).toMatch(/^\d{6}$/);
    // The shared mock never saw it.
    expect(
      getMockSender().sent.some((e) => e.to === "injected@resend.dev"),
    ).toBe(false);
  });
});

describe("GET /api/me", () => {
  it("returns the signed-in email with a valid session cookie", async () => {
    const cookie = await signIn("me-ok@resend.dev");

    const res = await SELF.fetch(`${ORIGIN}/api/me`, { headers: { cookie } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "me-ok@resend.dev" });
  });

  it("rejects a request with no session cookie", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/me`);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not signed in" });
  });

  it("rejects a request with a junk session cookie", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/me`, {
      headers: {
        cookie: "__Secure-better-auth.session_token=not-a-real-token",
      },
    });

    expect(res.status).toBe(401);
  });
});

describe("trusted origins (via Better Auth's origin check)", () => {
  // Better Auth only runs the origin check on state-changing requests that
  // carry a cookie. sign-out fits, and with an unsigned cookie it does no
  // database work — so the status is purely the origin verdict.
  const signOutFrom = (origin: string) =>
    SELF.fetch(`${ORIGIN}/api/auth/sign-out`, {
      method: "POST",
      headers: { origin, cookie: "better-auth.session_token=unsigned" },
    });

  it("accepts the production origin", async () => {
    expect(
      (await signOutFrom("https://dreamport.ianjmacintosh.com")).status,
    ).toBe(200);
  });

  it("accepts a branch-preview origin on this account's subdomain", async () => {
    expect(
      (await signOutFrom("https://a1b2c3-dreamport.bananasquad.workers.dev"))
        .status,
    ).toBe(200);
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

describe("other /api/* paths", () => {
  it("are owned by the Worker and 404 as JSON", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/does-not-exist`);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});

describe("createAuth", () => {
  it("builds a fresh instance per call — no shared singleton", () => {
    expect(createAuth(env)).not.toBe(createAuth(env));
  });
});
