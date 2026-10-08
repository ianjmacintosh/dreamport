import { expect, test, type Page } from "@playwright/test";

import { E2E_RATE_LIMIT_EXEMPT_IP } from "../src/worker/rate-limit-exemption";

/**
 * Cloudflare's documented dummy token. The always-pass test secret every
 * local and CI run uses (`TURNSTILE_SECRET_KEY`, wrangler.jsonc /
 * e2e-tests.yml) has `siteverify` accept it, so the Worker's real Turnstile
 * gate still runs — only the browser widget is skipped.
 */
const DUMMY_TURNSTILE_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

/**
 * Sign `page`'s browser context in as `email` and land on `/app`, for specs
 * that need a signed-in User but aren't testing sign-in itself.
 *
 * Goes through the same two auth calls `/login` makes, but from the page's
 * own request context (which shares its cookie jar), so the session cookie
 * ends up in the browser exactly as a UI sign-in would leave it. Skipping the
 * widget is the point: waiting for it to solve took ~4.5s of every ~5.7s UI
 * sign-in, and nearly every e2e test signs in (#150). `login.spec.ts` keeps
 * the full UI flow for the tests that are about signing in.
 *
 * `email` must carry the `+e2e-test@` marker so the code is the fixed
 * "000000" (docs/adr/0009). The calls go out as the rate-limit-exempt IP,
 * the same as `exemptFromRateLimits` does for page traffic (#102).
 */
export async function signIn(page: Page, email: string): Promise<void> {
  const { baseURL } = test.info().project.use;
  if (!baseURL) throw new Error("signIn needs the project's baseURL");
  const headers = {
    // Better Auth rejects an auth POST without a trusted Origin.
    origin: new URL(baseURL).origin,
    "cf-connecting-ip": E2E_RATE_LIMIT_EXEMPT_IP,
  };

  const sendCode = () =>
    page.request.post("/api/auth/email-otp/send-verification-otp", {
      headers: { ...headers, "x-turnstile-token": DUMMY_TURNSTILE_TOKEN },
      data: { email, type: "sign-in" },
    });
  let send = await sendCode();
  // A 403 here means the Worker's `siteverify` call to Cloudflare failed. With
  // the always-pass test secret that's a network blip, not a verdict (seen
  // once across a laptop sleep/wake, #150) — retry once. A real gate
  // regression fails the retry too.
  if (send.status() === 403) send = await sendCode();
  expect(send.status(), "send-verification-otp status").toBe(200);

  const verify = await page.request.post("/api/auth/sign-in/email-otp", {
    headers,
    data: { email, otp: "000000" },
  });
  expect(verify.status(), "sign-in/email-otp status").toBe(200);

  await page.goto("/app");
  await expect(page).toHaveURL(/\/app$/);
}
