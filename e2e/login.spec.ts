import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { TEST_EMAILS } from "../test/emails";

/**
 * The sign-in flow end to end, against the local Worker booted by
 * `playwright.config.ts`'s `webServer`. `EMAIL_MODE=mock`, so the six-digit
 * code is read back through the `/api/test/last-otp` hook instead of an inbox.
 * Every address is a `@resend.dev` test address from `TEST_EMAILS`.
 *
 * `VITE_TURNSTILE_SITE_KEY` is Cloudflare's always-pass test key (`.env` /
 * CI job env), so the Turnstile widget on the email step auto-solves; the
 * helper just waits for the hidden response field to fill before submitting.
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

/** Drive `/login` from the email step through to landing on `/app`. */
async function signIn(
  page: Page,
  request: APIRequestContext,
  email: string,
): Promise<void> {
  await page.goto("/login");
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
