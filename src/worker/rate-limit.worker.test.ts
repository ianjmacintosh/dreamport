import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TEST_EMAILS } from "../../test/emails";
import { getMockSender } from "./email/sender";
import { createApp } from "./index";
import {
  DEFAULT_DAILY_CAP,
  peekDailySendCap,
  peekOtpSendBudget,
  recordDailySend,
  recordOtpSend,
  resolveDailyCap,
  WINDOW_MS,
} from "./otp-send-throttle";
import type { TurnstileVerifier } from "./turnstile";

/**
 * Seam 1 — rate limiting on the send-OTP path (issue #24).
 *
 * Its own `*.worker.test.ts` file, kept apart from `index.worker.test.ts`:
 * the limits accumulate rows in D1 (`rateLimit`, `otpSendThrottle`,
 * `otpSendDaily`) and each test file gets its own isolated storage, so the
 * counts built up here can't perturb the assertions there. The `beforeEach`
 * clears all three tables so each `it` starts from an empty budget (storage
 * is isolated per file, not per `it`).
 *
 * Turnstile is stubbed to always pass; the gate itself is covered in
 * `index.worker.test.ts` and `turnstile.test.ts`.
 *
 * Three limits (see `docs/adr/0007-send-otp-rate-limiting.md`):
 *   - per client IP    — Better Auth's own DB-backed limiter, keyed on
 *     `cf-connecting-ip` + path, tightened to 3 / 60s on the send path.
 *   - per target email — dreamport code in the Hono send route, 5 / 10min,
 *     because Better Auth's limiter never sees the request body.
 *   - global daily cap — one app-wide count per UTC day, the guard for the
 *     shared Resend quota; `SEND_OTP_DAILY_CAP`, default 90.
 */

const ORIGIN = "https://dreamport.test";
const json = { "content-type": "application/json" };

const alwaysPass: TurnstileVerifier = async () => true;
const app = createApp({ verifyTurnstile: alwaysPass });

/**
 * POST the send-OTP endpoint. `ip` sets `cf-connecting-ip`; `xff` sets
 * `x-forwarded-for`. Omit both and the request carries no client-IP header at
 * all.
 */
async function send(
  email: string,
  { ip, xff }: { ip?: string; xff?: string } = {},
): Promise<Response> {
  const headers = new Headers({
    ...json,
    host: new URL(ORIGIN).host,
    "x-turnstile-token": "tok",
  });
  if (ip) headers.set("cf-connecting-ip", ip);
  if (xff) headers.set("x-forwarded-for", xff);
  return app.fetch(
    new Request(`${ORIGIN}/api/auth/email-otp/send-verification-otp`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, type: "sign-in" }),
    }),
    env,
  );
}

async function verify(email: string, otp: string): Promise<Response> {
  return app.fetch(
    new Request(`${ORIGIN}/api/auth/sign-in/email-otp`, {
      method: "POST",
      headers: { ...json, host: new URL(ORIGIN).host },
      body: JSON.stringify({ email, otp }),
    }),
    env,
  );
}

/** The most recent code the mock sender was handed for `email`. */
function codeFor(email: string): string {
  const last = getMockSender()
    .sent.filter((e) => e.to === email)
    .at(-1);
  if (!last) throw new Error(`no OTP was sent to ${email}`);
  return last.otp;
}

const FILLERS = [
  TEST_EMAILS.rlFillerA,
  TEST_EMAILS.rlFillerB,
  TEST_EMAILS.rlFillerC,
  TEST_EMAILS.rlFillerD,
];

const originalDailyCap = env.SEND_OTP_DAILY_CAP;

beforeEach(async () => {
  getMockSender().clear();
  await env.DB.prepare('DELETE FROM "rateLimit"').run();
  await env.DB.prepare('DELETE FROM "otpSendThrottle"').run();
  await env.DB.prepare('DELETE FROM "otpSendDaily"').run();
});

afterEach(() => {
  env.SEND_OTP_DAILY_CAP = originalDailyCap;
});

describe("per-IP limit on the send-OTP path", () => {
  it("allows sends up to the limit from one IP, then 429s", async () => {
    const ip = "203.0.113.1";

    // A different email each time, so only the per-IP rule (3 / 60s) can bite.
    for (const email of FILLERS.slice(0, 3)) {
      expect((await send(email, { ip })).status).toBe(200);
    }

    const blocked = await send(TEST_EMAILS.rlFillerD, { ip });
    expect(blocked.status).toBe(429);
  });

  it("takes the client IP from cf-connecting-ip, not x-forwarded-for", async () => {
    // No cf-connecting-ip on any of these; x-forwarded-for varies but must
    // not carve out separate buckets — all four share one.
    await send(TEST_EMAILS.rlFillerA, { xff: "9.9.9.1" });
    await send(TEST_EMAILS.rlFillerB, { xff: "9.9.9.2" });
    await send(TEST_EMAILS.rlFillerC, { xff: "9.9.9.3" });
    const blocked = await send(TEST_EMAILS.rlFillerD, { xff: "9.9.9.4" });
    expect(blocked.status).toBe(429);
  });

  it("keys per cf-connecting-ip: a fresh IP is unaffected by another's limit", async () => {
    const busy = "203.0.113.20";
    for (const email of FILLERS.slice(0, 3)) {
      expect((await send(email, { ip: busy })).status).toBe(200);
    }
    expect((await send(TEST_EMAILS.rlFillerD, { ip: busy })).status).toBe(429);

    // Same request, different cf-connecting-ip → its own budget.
    expect(
      (await send(TEST_EMAILS.rlFillerD, { ip: "198.51.100.7" })).status,
    ).toBe(200);
  });
});

describe("per-email limit on the send-OTP path", () => {
  it("429s past the limit for one target email even as the IP varies", async () => {
    const email = TEST_EMAILS.rlPerEmail;

    // 5 / 10min per email. Each send from a different IP, so the per-IP rule
    // (3) is never the cause — this is purely the email dimension.
    for (let i = 1; i <= 5; i++) {
      expect((await send(email, { ip: `203.0.113.${100 + i}` })).status).toBe(
        200,
      );
    }

    const blocked = await send(email, { ip: "203.0.113.200" });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.has("retry-after")).toBe(true);
  });

  it("counts case and whitespace variants of an address as the same email", async () => {
    const email = TEST_EMAILS.rlNormalise;

    for (let i = 1; i <= 5; i++) {
      expect((await send(email, { ip: `192.0.2.${i}` })).status).toBe(200);
    }

    // Same address, different casing and surrounding space — must not reset
    // the count.
    const blocked = await send(`  ${email.toUpperCase()}  `, {
      ip: "192.0.2.9",
    });
    expect(blocked.status).toBe(429);
  });

  it("does not spend per-email budget on a send the per-IP limiter rejects", async () => {
    const ip = "203.0.113.77";
    const email = TEST_EMAILS.rlPerEmail;

    // Exhaust this IP's per-IP bucket (3 / 60s) with other addresses.
    for (const filler of FILLERS.slice(0, 3)) {
      expect((await send(filler, { ip })).status).toBe(200);
    }

    // Four attempts for `email` from that now-blocked IP: all 429 at the
    // per-IP limiter, before a code is issued.
    for (let i = 0; i < 4; i++) {
      expect((await send(email, { ip })).status).toBe(429);
    }

    // `email` still has its whole per-email budget — none of the rejected
    // attempts counted. Five sends from fresh IPs all succeed; the sixth is
    // the first to trip the per-email rule.
    for (let i = 1; i <= 5; i++) {
      expect((await send(email, { ip: `198.51.100.${i}` })).status).toBe(200);
    }
    expect((await send(email, { ip: "198.51.100.9" })).status).toBe(429);
  });
});

describe("per-email fixed window (peek / record)", () => {
  // The window-reset path can't be reached through HTTP (no way to advance
  // the clock), so drive the owned limiter directly with an injected `now`.
  it("resets the count once the window has elapsed", async () => {
    const email = TEST_EMAILS.rlPerEmail;
    const t0 = 1_000_000_000_000;

    for (let i = 1; i <= 5; i++) {
      expect((await peekOtpSendBudget(env.DB, email, t0)).allowed).toBe(true);
      await recordOtpSend(env.DB, email, t0);
    }

    // 6th within the same window is refused, with a positive retry hint.
    const blocked = await peekOtpSendBudget(env.DB, email, t0 + 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);

    // Just inside the window: still refused.
    expect(
      (await peekOtpSendBudget(env.DB, email, t0 + WINDOW_MS - 1)).allowed,
    ).toBe(false);

    // One millisecond past the window: a fresh budget.
    expect(
      (await peekOtpSendBudget(env.DB, email, t0 + WINDOW_MS)).allowed,
    ).toBe(true);
  });

  it("peeking never spends budget — only recordOtpSend does", async () => {
    const email = TEST_EMAILS.rlNormalise;
    const now = 2_000_000_000_000;

    for (let i = 0; i < 20; i++) {
      expect((await peekOtpSendBudget(env.DB, email, now)).allowed).toBe(true);
    }
  });
});

describe("global daily send cap (the Resend-quota guard)", () => {
  it("429s once the app-wide daily count reaches the cap, regardless of IP or email", async () => {
    env.SEND_OTP_DAILY_CAP = "3";

    // Three sends, each a fresh email from a fresh IP — so neither the per-IP
    // (3 / 60s) nor the per-email (5 / 10min) limit can be the cause.
    for (let i = 0; i < 3; i++) {
      expect(
        (await send(FILLERS[i], { ip: `203.0.113.${10 + i}` })).status,
      ).toBe(200);
    }

    // Fourth: still a fresh email and IP, but the day's budget is spent.
    const blocked = await send(FILLERS[3], { ip: "203.0.113.20" });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.has("retry-after")).toBe(true);
  });

  it("does not count a send the per-IP limiter rejected against the daily cap", async () => {
    env.SEND_OTP_DAILY_CAP = "5";
    const ip = "203.0.113.90";

    // Spend this IP's per-IP bucket (3), then hammer it — the extra attempts
    // 429 before a code is sent.
    for (const filler of FILLERS.slice(0, 3)) {
      expect((await send(filler, { ip })).status).toBe(200);
    }
    for (let i = 0; i < 10; i++) {
      expect((await send(TEST_EMAILS.rlPerEmail, { ip })).status).toBe(429);
    }

    // Daily count is at 3, not 13: two more fresh-IP sends still pass, the
    // third trips the cap.
    expect((await send(FILLERS[3], { ip: "198.51.100.1" })).status).toBe(200);
    expect(
      (await send(TEST_EMAILS.rlHappyPath, { ip: "198.51.100.2" })).status,
    ).toBe(200);
    expect(
      (await send(TEST_EMAILS.rlNormalise, { ip: "198.51.100.3" })).status,
    ).toBe(429);
  });

  it("rolls over at UTC midnight (peek / record, injected clock)", async () => {
    const cap = 2;
    const dayA = Date.UTC(2026, 8, 9, 12, 0, 0); // 2026-09-09 12:00 UTC
    const dayB = Date.UTC(2026, 8, 10, 0, 0, 0); // 2026-09-10 00:00 UTC

    await recordDailySend(env.DB, dayA);
    await recordDailySend(env.DB, dayA);
    const spent = await peekDailySendCap(env.DB, cap, dayA + 1000);
    expect(spent.allowed).toBe(false);
    expect(spent.retryAfter).toBeGreaterThan(0);

    // New UTC day → fresh budget.
    expect((await peekDailySendCap(env.DB, cap, dayB)).allowed).toBe(true);
  });

  it("resolveDailyCap falls back to the default for anything not a positive integer", () => {
    expect(resolveDailyCap(undefined)).toBe(DEFAULT_DAILY_CAP);
    expect(resolveDailyCap("")).toBe(DEFAULT_DAILY_CAP);
    expect(resolveDailyCap("abc")).toBe(DEFAULT_DAILY_CAP);
    expect(resolveDailyCap("0")).toBe(DEFAULT_DAILY_CAP);
    expect(resolveDailyCap("-5")).toBe(DEFAULT_DAILY_CAP);
    expect(resolveDailyCap("12.5")).toBe(DEFAULT_DAILY_CAP);
    expect(resolveDailyCap("150")).toBe(150);
  });
});

describe("a normal single sign-in", () => {
  it("is unaffected by the limiter: send + verify still issues a session", async () => {
    const email = TEST_EMAILS.rlHappyPath;

    const sent = await send(email, { ip: "203.0.113.50" });
    expect(sent.status).toBe(200);

    const res = await verify(email, codeFor(email));
    expect(res.status).toBe(200);
    expect(
      res.headers.getSetCookie().some((c) => c.includes("session_token=")),
    ).toBe(true);
  });
});
