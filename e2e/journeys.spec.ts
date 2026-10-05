import { test, expect, type Page } from "@playwright/test";

import { TEST_EMAILS } from "../test/emails";
import { exemptFromRateLimits } from "./rate-limit-exemption";

// Journeys (issue #137): sign in, open a Product, follow "Learn More" to its
// Journey page, read the Path's Milestones, start the Journey, see
// Milestone 1 current — then back on the Product home, see it named there.
// Also covers advancing from Milestone 1 to Milestone 2 (issue #138), and
// returning to Milestone 1 and advancing again, and filling out the Rough
// One-Pager Worksheet on Milestone 1 and finding it kept on Milestone 2
// (issue #139).
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
  await expect(milestones).toContainText(
    "Learn from future customers by hearing their perspective",
  );
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

  // Nothing comes before Milestone 1, so there's no Return yet.
  const returnButton = page.getByRole("button", {
    name: "Return to Previous Milestone",
  });
  await expect(returnButton).toHaveCount(0);

  // Advancing (#138) moves current to exactly the next Milestone.
  const advanceButton = page.getByRole("button", {
    name: "Advance to Next Milestone",
  });
  await advanceButton.click();
  await expect(milestones.locator('[aria-current="step"]')).toContainText(
    "Real Talk",
  );

  // Returning moves it back one, and Return goes away again on Milestone 1.
  await returnButton.click();
  await expect(milestones.locator('[aria-current="step"]')).toContainText(
    "Rough One-Pager",
  );
  await expect(returnButton).toHaveCount(0);

  await advanceButton.click();
  await expect(milestones.locator('[aria-current="step"]')).toContainText(
    "Real Talk",
  );

  // Back on the Product home, the Journey section now names where it's at.
  await page.getByRole("link", { name: `Back to ${productName}` }).click();
  await expect(
    page.getByText("Current Milestone: Real Talk (2 of 7)"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "View Journey" })).toBeVisible();
});

test("finish a Journey, then Return: un-finished with Growth still current, and the Product home agrees", async ({
  page,
}) => {
  const productName = `A finished app ${Date.now()}`;

  await signIn(page, TEST_EMAILS.e2eReturnFromFinished);

  await page.getByLabel("Product name").fill(productName);
  await page.getByRole("button", { name: "Add Product" }).click();
  await page.getByRole("link", { name: productName }).click();
  await page.getByRole("link", { name: "Learn More" }).click();
  await page.getByRole("button", { name: "Start Journey" }).click();

  const milestones = page.getByRole("list", { name: "Milestones" });
  const current = milestones.locator('[aria-current="step"]');
  const advanceButton = page.getByRole("button", {
    name: "Advance to Next Milestone",
  });
  // Six advances take Milestone 1 to Growth, the last one.
  for (const name of [
    "Real Talk",
    "Solution Matchmaking",
    "Make It Real",
    "Observe & Refine",
    "Open Enrollment",
    "Growth",
  ]) {
    await advanceButton.click();
    await expect(current).toContainText(name);
  }
  // The one-pager stays a click away past the Milestones it's on (#139).
  await expect(
    page.getByRole("link", { name: "Fill out your Rough One-Pager" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Finish Journey" }).click();
  await expect(
    page.getByRole("heading", { name: "Dream Sequence complete" }),
  ).toBeVisible();
  // …and once finished.
  await expect(
    page.getByRole("link", { name: "Fill out your Rough One-Pager" }),
  ).toBeVisible();

  // Returning from finished mirrors finishing: it only un-finishes, so
  // Growth is current again rather than the Milestone before it.
  await page
    .getByRole("button", { name: "Return to Previous Milestone" })
    .click();
  await expect(current).toContainText("Growth");
  await expect(
    page.getByRole("button", { name: "Finish Journey" }),
  ).toBeVisible();

  await page.getByRole("link", { name: `Back to ${productName}` }).click();
  await expect(
    page.getByText("Current Milestone: Growth (7 of 7)"),
  ).toBeVisible();
});

test("fill out the Rough One-Pager from Milestone 1, then see it kept on Milestone 2", async ({
  page,
}) => {
  const productName = `A one-pager app ${Date.now()}`;

  await signIn(page, TEST_EMAILS.e2eFillOnePager);

  await page.getByLabel("Product name").fill(productName);
  await page.getByRole("button", { name: "Add Product" }).click();
  await page.getByRole("link", { name: productName }).click();
  await page.getByRole("link", { name: "Learn More" }).click();
  await page.getByRole("button", { name: "Start Journey" }).click();

  // Milestone 1 holds the one-pager (#139), nothing filled in yet.
  await expect(page.getByText("(0 of 7 filled in)")).toBeVisible();
  await page
    .getByRole("link", { name: "Fill out your Rough One-Pager" })
    .click();
  await expect(page).toHaveURL(/\/worksheets\/rough-one-pager$/);
  await expect(
    page.getByRole("heading", { name: "Rough One-Pager" }),
  ).toBeVisible();
  await expect(page.getByText("0 of 7 filled in")).toBeVisible();
  // Credited to Lean Canvas, linking the license and the Copyright page.
  await expect(page.getByRole("link", { name: "CC BY-SA 3.0" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Credits" })).toHaveAttribute(
    "href",
    "/copyright",
  );

  await page.getByLabel("Problem").fill("Kitchen scales are clunky");
  await page.getByLabel("Customer").fill("Home bakers");
  await page.getByRole("button", { name: "Save Rough One-Pager" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await expect(page.getByText("2 of 7 filled in")).toBeVisible();

  // Kept across a reload, and still there to edit on Milestone 2.
  await page.reload();
  await expect(page.getByLabel("Problem")).toHaveValue(
    "Kitchen scales are clunky",
  );
  await page.getByRole("link", { name: "Back to Journey" }).click();
  await page.getByRole("button", { name: "Advance to Next Milestone" }).click();
  await expect(
    page
      .getByRole("list", { name: "Milestones" })
      .locator('[aria-current="step"]'),
  ).toContainText("Real Talk");
  await expect(page.getByText("(2 of 7 filled in)")).toBeVisible();
  await page
    .getByRole("link", { name: "Fill out your Rough One-Pager" })
    .click();
  await expect(page.getByLabel("Customer")).toHaveValue("Home bakers");
});
