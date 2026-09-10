import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { TEST_EMAILS } from "../test/emails";

/**
 * This file's specs issue more than three sign-ins between them, and locally
 * every send-OTP call shares one 3 / 60s rate-limit bucket (no
 * `cf-connecting-ip` header — see the note above `readCode`). Run them
 * serially and clear that bucket before each, so no spec 429s because of an
 * earlier one. The DEV-only reset hook is mounted beside `/api/test/last-otp`.
 */
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  const res = await request.post("/api/test/reset-rate-limits");
  expect(res.ok()).toBeTruthy();
});

/**
 * The sign-in flow end to end, against the local Worker booted by
 * `playwright.config.ts`'s `webServer`. `EMAIL_MODE=mock`, so the six-digit
 * code is read back through the `/api/test/last-otp` hook instead of an inbox.
 * Every address is a `@resend.dev` test address from `TEST_EMAILS`.
 *
 * `VITE_TURNSTILE_SITE_KEY` is Cloudflare's always-pass test key (`.env` /
 * CI job env), so the Turnstile widget on the email step auto-solves; the
 * helper just waits for the hidden response field to fill before submitting.
 *
 * Rate limiting (issue #24): locally there is no `cf-connecting-ip`, so every
 * send-OTP call in the run shares one bucket of 3 / 60s, and nothing clears
 * the limiter tables between specs. The green suite issues two sends (two
 * distinct addresses), well under the limit. A genuine failure retried on CI
 * (`retries: 2`) can push over it and 429 a later spec for an unrelated
 * reason — if that becomes a problem, add a DEV-only reset hook like
 * `/api/test/last-otp` and call it in `beforeEach`.
 */

/** The most recent code the mock sender was handed for `email`. */
async function readCode(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const res = await request.get(
    `/api/test/last-otp?email=${encodeURIComponent(email)}`,
  );
  expect(res.ok()).toBeTruthy();
  const { otp } = (await res.json()) as { otp: string };
  return otp;
}

/** Open `/login` the way a visitor does: from the homepage header link. */
async function gotoLoginFromHomepage(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** Drive `/login` from the email step through to landing on `/app`. */
async function signIn(
  page: Page,
  request: APIRequestContext,
  email: string,
): Promise<void> {
  await gotoLoginFromHomepage(page);
  await page.getByLabel("Email address").fill(email);

  // Wait for Turnstile to auto-solve (always-pass test key) — the widget
  // writes the token into a hidden field the gate reads.
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(
    /.+/,
    { timeout: 15_000 },
  );

  await page.getByRole("button", { name: "Send code" }).click();

  await expect(page.getByLabel("Six-digit code")).toBeVisible();
  await page.getByLabel("Six-digit code").fill(await readCode(request, email));
  await page.getByRole("button", { name: "Verify and sign in" }).click();

  await expect(page).toHaveURL(/\/app$/);
}

test("happy path: email, then code, then /app shows the signed-in email", async ({
  page,
  request,
}) => {
  const email = TEST_EMAILS.e2eHappyPath;

  await signIn(page, request, email);

  await expect(page.getByText(`signed in as ${email}`)).toBeVisible();
});

test("the sign-in page presents a bot challenge on the email step", async ({
  page,
}) => {
  await gotoLoginFromHomepage(page);

  // The widget container is always in the markup; what proves the challenge
  // actually rendered is Cloudflare serving its challenge into a child frame.
  // With `siteKey` undefined (VITE_TURNSTILE_SITE_KEY dropped from the build)
  // the container mounts but no such frame ever appears.
  await expect(page.locator("#cf-turnstile")).toBeVisible();
  await expect
    .poll(
      () =>
        page
          .frames()
          .some((f) => f.url().includes("challenges.cloudflare.com")),
      {
        message: "no Cloudflare Turnstile challenge frame attached to the page",
        timeout: 15_000,
      },
    )
    .toBe(true);
});

test("logged out: visiting /app with no session redirects to /login", async ({
  page,
}) => {
  await page.goto("/app");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("persistent session: a return visit to /app stays signed in", async ({
  page,
  request,
}) => {
  const email = TEST_EMAILS.e2ePersistentSession;

  await signIn(page, request, email);

  // Navigate away, then back to /app in the same browser context.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dreamport" })).toBeVisible();

  await page.goto("/app");
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText(`signed in as ${email}`)).toBeVisible();
});

test("sign out from /app returns to the homepage and forgets the session", async ({
  page,
  request,
}) => {
  await signIn(page, request, TEST_EMAILS.e2eSignOut);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/localhost:\d+\/$/);

  // A later /app visit has no session to fall back on.
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
});

test("delete account from /app: confirm, follow the emailed link, session is gone", async ({
  page,
  request,
}) => {
  const email = TEST_EMAILS.e2eDeleteAccount;

  await signIn(page, request, email);

  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByRole("button", { name: "Email me a deletion link" }).click();
  await expect(page.getByText(/Check your email/)).toBeVisible();

  // Read the confirmation link the mock sender was handed, the same way the
  // code is read on the sign-in path.
  const res = await request.get(
    `/api/test/last-delete-link?email=${encodeURIComponent(email)}`,
  );
  expect(res.ok()).toBeTruthy();
  const { url } = (await res.json()) as { url: string };

  // The link must be opened in this same still-signed-in context.
  await page.goto(url);
  await expect(page).toHaveURL(/localhost:\d+\/$/);

  // The account is gone: /app has nothing to authenticate.
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
});
