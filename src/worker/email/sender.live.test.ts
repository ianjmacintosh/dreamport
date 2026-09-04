import { describe, expect, it } from "vitest";

import { TEST_EMAILS, TEST_FROM } from "../../../test/emails";
import { ResendEmailSender } from "./sender";

/**
 * Manual, opt-in check that a real Resend send works end to end. Never gates
 * CI: with no `RESEND_API_KEY` in the environment the cases are skipped, so a
 * normal run just reports them pending.
 *
 * To run it for real:
 *
 *   RESEND_API_KEY=re_... npx vitest run src/worker/email/sender.live.test.ts
 *
 * Sends to `delivered@resend.dev` — Resend's sink that always accepts and
 * never forwards — from `onboarding@resend.dev` (their shared test sender, no
 * domain verification needed).
 */
const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? TEST_FROM;

describe("ResendEmailSender (live)", () => {
  it.skipIf(!apiKey)(
    "sendOtp resolves against the real API (2xx)",
    async () => {
      // `sendOtp` throws on any non-2xx response, so resolving is the assertion.
      await expect(
        new ResendEmailSender({ apiKey: apiKey!, from }).sendOtp({
          to: TEST_EMAILS.liveSink,
          otp: "424242",
          type: "sign-in",
        }),
      ).resolves.toBeUndefined();
    },
  );

  it.skipIf(!apiKey)("the real API returns a message id", async () => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: TEST_EMAILS.liveSink,
        subject: "Your Dreamport sign-in code",
        text: "Your Dreamport code is 424242. It expires in 60 minutes.",
      }),
    });

    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    const body = (await res.json()) as { id?: string };
    expect(body.id).toBeTruthy();
  });
});
