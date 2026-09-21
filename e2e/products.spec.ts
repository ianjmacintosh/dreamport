import { test, expect, type Page } from "@playwright/test";

import { TEST_EMAILS } from "../test/emails";

// Products v1: sign in, add a Product, see it in the list without a full
// page reload (slice 1, issue #88), and delete one (slice 2, issue #89).
// Signs in the same way `login.spec.ts` does (fixed `+e2e-test@` code, see
// docs/adr/0009) — see that file's header comment for why.

/** Give this spec its own per-IP send-OTP bucket, same reasoning as `login.spec.ts`. */
let sendBucket = 0;
test.beforeEach(async ({ page }, testInfo) => {
  const octet = (testInfo.workerIndex * 40 + sendBucket++) % 256;
  const ip = `203.0.113.${octet}`;
  await page.route(
    "**/api/auth/email-otp/send-verification-otp",
    (route) =>
      void route.continue({
        headers: { ...route.request().headers(), "cf-connecting-ip": ip },
      }),
  );
});

/** Drive `/login` from the email step through to landing on `/app`. */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);

  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(
    /.+/,
    { timeout: 15_000 },
  );

  await page.getByRole("button", { name: "Send code" }).click();

  await expect(page.getByLabel("Six-digit code")).toBeVisible();
  await page.getByLabel("Six-digit code").fill("000000");
  await page.getByRole("button", { name: "Verify and sign in" }).click();

  await expect(page).toHaveURL(/\/app$/);
}

test("sign in, add a Product, and see it in the list", async ({ page }) => {
  const email = TEST_EMAILS.e2eAddProduct;
  // The fixed `+e2e-test@` address is reused across runs against a
  // persistent local dev database (unlike the Seam 1 Vitest pool, which
  // isolates storage per test file), so a prior run's Product can still be
  // there — a unique name per run is what makes this run's own addition
  // identifiable, rather than asserting the list starts empty.
  const productName = `A phone-scale app ${Date.now()}`;

  await signIn(page, email);

  await expect(page.getByText(productName)).not.toBeVisible();

  await page.getByLabel("Product name").fill(productName);
  await page.getByRole("button", { name: "Add product" }).click();

  await expect(page.getByText(productName)).toBeVisible();
  // No full page reload: the field clears and is ready for the next entry
  // without the page itself having navigated.
  await expect(page.getByLabel("Product name")).toHaveValue("");
});

test("sign in, add a Product, delete it, and confirm it's gone", async ({
  page,
}) => {
  const email = TEST_EMAILS.e2eDeleteProduct;
  const productName = `A short-lived Product ${Date.now()}`;

  await signIn(page, email);

  await page.getByLabel("Product name").fill(productName);
  await page.getByRole("button", { name: "Add product" }).click();
  await expect(page.getByText(productName)).toBeVisible();

  const row = page.getByText(productName).locator("..");
  await row.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByText(productName)).not.toBeVisible();
});
