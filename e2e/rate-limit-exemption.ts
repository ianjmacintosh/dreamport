import type { Page } from "@playwright/test";

import { E2E_RATE_LIMIT_EXEMPT_IP } from "../src/worker/rate-limit-exemption";

/**
 * Send every send-OTP call from `page` as the e2e-exempt IP, so no spec's
 * sign-in can 429 on the send path's per-IP (3 / 60s) or per-email
 * (5 / 10min) limits — however many specs, workers, reruns, or CI retries
 * (`retries: 2`) there are. See `isRateLimitExempt` in
 * `src/worker/rate-limit-exemption.ts` for why that's safe (issue #102).
 *
 * Locally the browser sends no `cf-connecting-ip` at all, so without this
 * every send in the run shares one per-IP bucket. The route is scoped to the
 * send-OTP call only: putting the header on every request (via
 * `setExtraHTTPHeaders`) also rewrites the Turnstile widget's calls to
 * `challenges.cloudflare.com` and the challenge never solves.
 */
export async function exemptFromSendRateLimits(page: Page): Promise<void> {
  await page.route(
    "**/api/auth/email-otp/send-verification-otp",
    (route) =>
      void route.continue({
        headers: {
          ...route.request().headers(),
          "cf-connecting-ip": E2E_RATE_LIMIT_EXEMPT_IP,
        },
      }),
  );
}
