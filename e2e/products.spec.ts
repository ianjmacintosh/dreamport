import { test, expect, type Page } from "@playwright/test";

import { TEST_EMAILS } from "../test/emails";
import { expectOtherRowsUnaffected, LAYOUT_WIDTHS } from "./list-rows";
import { exemptFromRateLimits } from "./rate-limit-exemption";

// Products v1: sign in, add a Product, see it in the list without a full
// page reload (slice 1, issue #88), delete one (slice 2, issue #89), behind
// a per-row Confirm/Cancel reveal (slice 3, issue #90). Signs in the same
// way `login.spec.ts` does (fixed `+e2e-test@` code, see docs/adr/0009) —
// see that file's header comment for why.

/** See `exemptFromRateLimits` for why rate-limited auth calls go out as one exempt IP. */
test.beforeEach(({ page }) => exemptFromRateLimits(page));

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

test("the Add product button disables and relabels while the request is in flight", async ({
  page,
}) => {
  const email = TEST_EMAILS.e2eAddProductPending;
  const productName = `A slow-to-add Product ${Date.now()}`;

  await signIn(page, email);

  // Slow the create down so the pending state has a real window to observe
  // — same reasoning as login.spec.ts's send-code delay.
  await page.route("**/api/products", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await route.fallback();
  });

  await page.getByLabel("Product name").fill(productName);
  await page.getByRole("button", { name: "Add product" }).click();

  await expect(page.getByRole("button", { name: "Adding…" })).toBeDisabled();
  await expect(page.getByText(productName)).toBeVisible({ timeout: 10_000 });
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
  await row.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByText(productName)).not.toBeVisible();
});

test("clicking Delete reveals a confirming Delete/Cancel without deleting, and Cancel backs out", async ({
  page,
}) => {
  const email = TEST_EMAILS.e2eDeleteProductReveal;
  const productName = `A not-actually-deleted Product ${Date.now()}`;

  await signIn(page, email);

  await page.getByLabel("Product name").fill(productName);
  await page.getByRole("button", { name: "Add product" }).click();
  await expect(page.getByText(productName)).toBeVisible();

  const row = page.getByText(productName).locator("..");
  await row.getByRole("button", { name: "Delete" }).click();

  // The confirming button says "Delete" too (#101), so the reveal shows up
  // as Cancel appearing alongside one Delete — the resting one swapped out,
  // not a second one added.
  await expect(row.getByRole("button", { name: "Cancel" })).toBeVisible();
  await expect(row.getByRole("button", { name: "Delete" })).toHaveCount(1);

  await row.getByRole("button", { name: "Cancel" }).click();

  await expect(row.getByRole("button", { name: "Delete" })).toBeVisible();
  await expect(page.getByText(productName)).toBeVisible();
});

test("the Delete button disables and relabels while the request is in flight", async ({
  page,
}) => {
  const email = TEST_EMAILS.e2eDeleteProductPending;
  const productName = `A slow-to-delete Product ${Date.now()}`;

  await signIn(page, email);

  await page.getByLabel("Product name").fill(productName);
  await page.getByRole("button", { name: "Add product" }).click();
  await expect(page.getByText(productName)).toBeVisible();

  // Slow the delete down so the pending state has a real window to observe
  // — same reasoning as login.spec.ts's send-code delay.
  await page.route("**/api/products/*", async (route) => {
    if (route.request().method() === "DELETE") {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await route.fallback();
  });

  const row = page.getByText(productName).locator("..");
  await row.getByRole("button", { name: "Delete" }).click();
  await row.getByRole("button", { name: "Delete" }).click();

  await expect(row.getByRole("button", { name: "Deleting…" })).toBeDisabled();
  await expect(page.getByText(productName)).not.toBeVisible({
    timeout: 10_000,
  });
});

test("even a near-instant delete holds the pending row for a minimum duration", async ({
  page,
}) => {
  const email = TEST_EMAILS.e2eDeleteProductMinDuration;
  const productName = `An instant-delete Product ${Date.now()}`;

  await signIn(page, email);

  await page.getByLabel("Product name").fill(productName);
  await page.getByRole("button", { name: "Add product" }).click();
  await expect(page.getByText(productName)).toBeVisible();

  // Deliberately no artificial delay: local D1 resolves this in a handful
  // of milliseconds, which is exactly what regressed before — the row
  // (carrying the "Deleting…" button) was removed the instant the request
  // settled, before app.tsx's minimum-duration floor had actually elapsed.
  const row = page.getByText(productName).locator("..");
  await row.getByRole("button", { name: "Delete" }).click();
  await row.getByRole("button", { name: "Delete" }).click();

  await page.waitForTimeout(200);
  await expect(row.getByRole("button", { name: "Deleting…" })).toBeVisible();

  await expect(page.getByText(productName)).not.toBeVisible({
    timeout: 2_000,
  });
});

// Issue #102: each row is laid out on its own, so one row's Delete/Cancel
// reveal never shifts the others — at desktop or phone width.
test("confirming one Product row leaves every other row's layout unchanged", async ({
  page,
}) => {
  const email = TEST_EMAILS.e2eProductRowsIndependent;
  const names = [
    `Short ${Date.now()}`,
    `A product with a much longer name than usual ${Date.now()}`,
  ];

  await signIn(page, email);
  for (const name of names) {
    await page.getByLabel("Product name").fill(name);
    await page.getByRole("button", { name: "Add product" }).click();
    await expect(page.getByText(name)).toBeVisible();
  }

  const row = page.locator("li").filter({ hasText: names[0] });
  for (const width of LAYOUT_WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await expectOtherRowsUnaffected(page, row, () =>
      row.getByRole("button", { name: "Delete" }).click(),
    );
    await row.getByRole("button", { name: "Cancel" }).click();
  }
});
