import { test, expect, type Page } from "@playwright/test";

import { TEST_EMAILS } from "../test/emails";

// Ideas v1 slice 1 (issue #99): sign in, add a Product, open it via the link
// on `/app`, add an Idea, see it in that Product's own list without a full
// page reload. Signs in the same way `login.spec.ts`/`products.spec.ts` do
// (fixed `+e2e-test@` code, see docs/adr/0009) — see that file's header
// comment for why.

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

test("sign in, add a Product, open it, add an Idea, and see it in the list", async ({
  page,
}) => {
  const email = TEST_EMAILS.e2eAddIdea;
  // Reused fixed address against a persistent local dev database (see
  // products.spec.ts's own note) — unique names per run are what make this
  // run's own rows identifiable.
  const productName = `A phone-scale app ${Date.now()}`;
  const ideaName = `Dark mode ${Date.now()}`;

  await signIn(page, email);

  await page.getByLabel("Product name").fill(productName);
  await page.getByRole("button", { name: "Add product" }).click();
  await expect(page.getByText(productName)).toBeVisible();

  await page.getByRole("link", { name: productName }).click();
  await expect(page).toHaveURL(/\/app\/products\/.+/);
  await expect(page.getByRole("heading", { name: productName })).toBeVisible();

  await expect(page.getByText(ideaName)).not.toBeVisible();

  await page.getByLabel("Idea name").fill(ideaName);
  await page.getByRole("button", { name: "Add idea" }).click();

  await expect(page.getByText(ideaName)).toBeVisible();
  // No full page reload: the field clears and is ready for the next entry
  // without the page itself having navigated.
  await expect(page.getByLabel("Idea name")).toHaveValue("");

  await page.getByRole("link", { name: "Back to Products" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText(productName)).toBeVisible();
});
