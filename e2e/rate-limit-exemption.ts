import type { Page } from "@playwright/test";

import { E2E_RATE_LIMIT_EXEMPT_IP } from "../src/worker/rate-limit-exemption";

/**
 * Rate-limited auth paths an e2e spec calls. Each one only gets the exempt
 * IP, not every request — putting the header on every request (via
 * `setExtraHTTPHeaders`) also rewrites the Turnstile widget's calls to
 * `challenges.cloudflare.com` and the challenge never solves.
 */
const RATE_LIMITED_PATHS = [
  "**/api/auth/email-otp/send-verification-otp",
  "**/api/auth/delete-user",
];

/**
 * Send every rate-limited auth request from `page` as the e2e-exempt IP, so
 * no spec can 429 on the send path's per-IP (3 / 60s) or per-email
 * (5 / 10min) limits, or `/delete-user`'s per-IP one — however many specs,
 * workers, reruns, or CI retries (`retries: 2`) there are. See
 * `isRateLimitExempt` in `src/worker/rate-limit-exemption.ts` for why that's
 * safe (issue #102).
 *
 * Locally the browser sends no `cf-connecting-ip` at all, so without this
 * every such request in the run shares one per-IP bucket per path.
 */
export async function exemptFromRateLimits(page: Page): Promise<void> {
  for (const path of RATE_LIMITED_PATHS) {
    await page.route(
      path,
      (route) =>
        void route.continue({
          headers: {
            ...route.request().headers(),
            "cf-connecting-ip": E2E_RATE_LIMIT_EXEMPT_IP,
          },
        }),
    );
  }
}
