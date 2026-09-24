import { test, expect, type Page } from "@playwright/test";

import { TEST_EMAILS } from "../test/emails";
import { exemptFromRateLimits } from "./rate-limit-exemption";

// Ideas v1 slice 1 (issue #99): sign in, add a Product, open it via the link
// on `/app`, add an Idea, see it in that Product's own list without a full
// page reload. Signs in the same way `login.spec.ts`/`products.spec.ts` do
// (fixed `+e2e-test@` code, see docs/adr/0009) — see that file's header
// comment for why.

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

// Ideas v1 slice 2 (issue #100): add a Product, add an Idea, delete it,
// and confirm it's gone from the list. Also test that Cancel backs out
// without deleting.
test("sign in, add a Product, add an Idea, delete it, and confirm it's gone", async ({
  page,
}) => {
  const email = TEST_EMAILS.e2eDeleteIdea;
  const productName = `Delete test product ${Date.now()}`;
  const ideaName = `Delete test idea ${Date.now()}`;

  await signIn(page, email);

  await page.getByLabel("Product name").fill(productName);
  await page.getByRole("button", { name: "Add product" }).click();
  await expect(page.getByText(productName)).toBeVisible();

  await page.getByRole("link", { name: productName }).click();
  await expect(page).toHaveURL(/\/app\/products\/.+/);

  await page.getByLabel("Idea name").fill(ideaName);
  await page.getByRole("button", { name: "Add idea" }).click();
  await expect(page.getByText(ideaName)).toBeVisible();

  // Click the Delete button to reveal Confirm/Cancel
  const ideaListItem = page.locator("li", { has: page.getByText(ideaName) });
  await ideaListItem.getByRole("button", { name: "Delete" }).click();

  // Confirm button should now be visible
  await expect(
    ideaListItem.getByRole("button", { name: "Confirm" }),
  ).toBeVisible();
  await expect(
    ideaListItem.getByRole("button", { name: "Cancel" }),
  ).toBeVisible();

  // Click Confirm to delete
  await ideaListItem.getByRole("button", { name: "Confirm" }).click();

  // Idea should be removed from the list
  await expect(page.getByText(ideaName)).not.toBeVisible();
  await expect(page.getByText("No ideas yet.")).toBeVisible();
});

// Test that Cancel backs out without deleting
test("sign in, add a Product, add an Idea, click Delete to reveal Confirm/Cancel, then Cancel backs out", async ({
  page,
}) => {
  const email = TEST_EMAILS.e2eDeleteIdeaReveal;
  const productName = `Cancel test product ${Date.now()}`;
  const ideaName = `Cancel test idea ${Date.now()}`;

  await signIn(page, email);

  await page.getByLabel("Product name").fill(productName);
  await page.getByRole("button", { name: "Add product" }).click();
  await expect(page.getByText(productName)).toBeVisible();

  await page.getByRole("link", { name: productName }).click();
  await expect(page).toHaveURL(/\/app\/products\/.+/);

  await page.getByLabel("Idea name").fill(ideaName);
  await page.getByRole("button", { name: "Add idea" }).click();
  await expect(page.getByText(ideaName)).toBeVisible();

  // Click the Delete button to reveal Confirm/Cancel
  const ideaListItem = page.locator("li", { has: page.getByText(ideaName) });
  await ideaListItem.getByRole("button", { name: "Delete" }).click();

  // Confirm button should now be visible
  await expect(
    ideaListItem.getByRole("button", { name: "Confirm" }),
  ).toBeVisible();
  await expect(
    ideaListItem.getByRole("button", { name: "Cancel" }),
  ).toBeVisible();

  // Click Cancel to back out
  await ideaListItem.getByRole("button", { name: "Cancel" }).click();

  // Idea should still be visible and Delete button back
  await expect(page.getByText(ideaName)).toBeVisible();
  await expect(
    ideaListItem.getByRole("button", { name: "Delete" }),
  ).toBeVisible();
});

// Issue #102: add an Idea, rename it in place, and see the new name.
test("sign in, add a Product, add an Idea, rename it, and see the new name", async ({
  page,
}) => {
  const email = TEST_EMAILS.e2eRenameIdea;
  const productName = `Rename test product ${Date.now()}`;
  const ideaName = `Rename test idea ${Date.now()}`;
  const newName = `Renamed idea ${Date.now()}`;

  await signIn(page, email);

  await page.getByLabel("Product name").fill(productName);
  await page.getByRole("button", { name: "Add product" }).click();
  await page.getByRole("link", { name: productName }).click();
  await expect(page).toHaveURL(/\/app\/products\/.+/);

  await page.getByLabel("Idea name").fill(ideaName);
  await page.getByRole("button", { name: "Add idea" }).click();
  await expect(page.getByText(ideaName)).toBeVisible();

  const ideaListItem = page.locator("li", { has: page.getByText(ideaName) });
  await ideaListItem.getByRole("button", { name: "Edit" }).click();

  const renameField = page.getByLabel(`Rename ${ideaName}`);
  await expect(renameField).toHaveValue(ideaName);
  await renameField.fill(newName);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText(newName)).toBeVisible();
  await expect(page.getByText(ideaName)).not.toBeVisible();
  await expect(renameField).not.toBeVisible();

  // Persisted, not just local state: survives a reload.
  await page.reload();
  await expect(page.getByText(newName)).toBeVisible();
});

// Issue #102: Cancel backs out of a rename without saving.
test("sign in, add a Product, add an Idea, click Edit, then Cancel backs out without saving", async ({
  page,
}) => {
  const email = TEST_EMAILS.e2eRenameIdeaCancel;
  const productName = `Rename cancel product ${Date.now()}`;
  const ideaName = `Rename cancel idea ${Date.now()}`;

  await signIn(page, email);

  await page.getByLabel("Product name").fill(productName);
  await page.getByRole("button", { name: "Add product" }).click();
  await page.getByRole("link", { name: productName }).click();
  await expect(page).toHaveURL(/\/app\/products\/.+/);

  await page.getByLabel("Idea name").fill(ideaName);
  await page.getByRole("button", { name: "Add idea" }).click();
  await expect(page.getByText(ideaName)).toBeVisible();

  const ideaListItem = page.locator("li", { has: page.getByText(ideaName) });
  await ideaListItem.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel(`Rename ${ideaName}`).fill("Should not be saved");
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByText(ideaName)).toBeVisible();
  await expect(page.getByText("Should not be saved")).not.toBeVisible();
  await expect(
    ideaListItem.getByRole("button", { name: "Edit" }),
  ).toBeVisible();
});
