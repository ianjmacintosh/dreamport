import { test, expect, type Page } from "@playwright/test";

import { TEST_EMAILS } from "../test/emails";
import { exemptFromRateLimits } from "./rate-limit-exemption";

// Journeys (issue #137): sign in, open a Product, follow "Learn More" to its
// Journey page, read the Path's Milestones, start the Journey, see
// Milestone 1 current — then back on the Product home, see it named there.
// Signs in the same way `ideas.spec.ts` does (fixed `+e2e-test@` code, see
// docs/adr/0009).

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

  await page.getByRole("button", { name: "Send Code" }).click();

  await expect(
    page.getByRole("textbox", { name: "Six-digit code" }),
  ).toBeVisible();
  // The sixth digit submits the form on its own (`autoSubmit`, #128).
  await page.getByRole("textbox", { name: "Six-digit code" }).fill("000000");

  await expect(page).toHaveURL(/\/app$/);
}

test("sign in, open a Product, learn about its Journey, start it, and see Milestone 1 current", async ({
  page,
}) => {
  // Reused fixed address against a persistent local dev database (see
  // products.spec.ts's own note) — a unique name per run is what makes this
  // run's own Product identifiable.
  const productName = `A phone-scale app ${Date.now()}`;

  await signIn(page, TEST_EMAILS.e2eStartJourney);

  await page.getByLabel("Product name").fill(productName);
  await page.getByRole("button", { name: "Add Product" }).click();
  await page.getByRole("link", { name: productName }).click();
  await expect(page.getByRole("heading", { name: productName })).toBeVisible();

  // The Product home only points at the Journey; the Journey page has it.
  await page.getByRole("link", { name: "Learn More" }).click();
  await expect(page).toHaveURL(/\/app\/products\/.+\/journey$/);

  // Every Milestone is there to read before committing to the Journey,
  // none of them current yet, with the line inviting them to start.
  const milestones = page.getByRole("list", { name: "Milestones" });
  await expect(milestones.getByRole("listitem")).toHaveCount(7);
  await expect(milestones).toContainText("Real Talk");
  await expect(milestones.locator('[aria-current="step"]')).toHaveCount(0);
  await expect(
    page.getByText("Start by describing your solution."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Start Journey" }).click();

  await expect(milestones.locator('[aria-current="step"]')).toContainText(
    "Rough One-Pager",
  );
  await expect(page.getByRole("button", { name: "Start Journey" })).toHaveCount(
    0,
  );

  // The started Journey is stored, not just shown: a reload still has it.
  await page.reload();
  await expect(milestones.locator('[aria-current="step"]')).toContainText(
    "Rough One-Pager",
  );

  // Back on the Product home, the Journey section now names where it's at.
  await page.getByRole("link", { name: `Back to ${productName}` }).click();
  await expect(
    page.getByText("Current Milestone: Rough One-Pager (1 of 7)"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "View Journey" })).toBeVisible();
});
