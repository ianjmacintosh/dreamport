import { test, expect, type Locator, type Page } from "@playwright/test";

import { TEST_EMAILS } from "../test/emails";
import { expectOtherRowsUnaffected, LAYOUT_WIDTHS } from "./list-rows";
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
  // The list is named by its own "Ideas" heading, not the page's h1 (#101)
  await expect(
    page.getByRole("list", { name: "Ideas", exact: true }).getByText(ideaName),
  ).toBeVisible();
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

  // Click the Delete button to reveal the confirming Delete/Cancel
  const ideaListItem = page.locator("li", { has: page.getByText(ideaName) });
  await ideaListItem.getByRole("button", { name: "Delete" }).click();

  // The confirming Delete (#101) should now be visible, alongside Cancel
  await expect(
    ideaListItem.getByRole("button", { name: "Delete" }),
  ).toBeVisible();
  await expect(
    ideaListItem.getByRole("button", { name: "Cancel" }),
  ).toBeVisible();

  // Click the confirming Delete to delete
  await ideaListItem.getByRole("button", { name: "Delete" }).click();

  // Idea should be removed from the list
  await expect(page.getByText(ideaName)).not.toBeVisible();
  await expect(page.getByText("No ideas yet.")).toBeVisible();
});

// Test that Cancel backs out without deleting
test("sign in, add a Product, add an Idea, click Delete to reveal a confirming Delete/Cancel, then Cancel backs out", async ({
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

  // Click the Delete button to reveal the confirming Delete/Cancel
  const ideaListItem = page.locator("li", { has: page.getByText(ideaName) });
  await ideaListItem.getByRole("button", { name: "Delete" }).click();

  // The confirming Delete (#101) should now be visible, alongside Cancel
  await expect(
    ideaListItem.getByRole("button", { name: "Delete" }),
  ).toBeVisible();
  await expect(
    ideaListItem.getByRole("button", { name: "Cancel" }),
  ).toBeVisible();

  // Edit stays available alongside the confirming Delete/Cancel (#102)
  await expect(
    ideaListItem.getByRole("button", { name: "Edit" }),
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

  const renameField = page.getByLabel("Rename", { exact: true });
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
  // Editing offers Save / Cancel / Delete (#102)
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
  await page.getByLabel("Rename", { exact: true }).fill("Should not be saved");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await expect(page.getByText(ideaName)).toBeVisible();
  await expect(page.getByText("Should not be saved")).not.toBeVisible();
  await expect(
    ideaListItem.getByRole("button", { name: "Edit" }),
  ).toBeVisible();
});

// Issue #102: each row is laid out on its own, so switching one row into
// editing or confirming never shifts the others — at desktop or phone width.
test("editing or confirming one Idea row leaves every other row's layout unchanged", async ({
  page,
}) => {
  const email = TEST_EMAILS.e2eIdeaRowsIndependent;
  const productName = `Row layout product ${Date.now()}`;
  const ideaNames = [
    `Short ${Date.now()}`,
    `An idea with a much longer name than usual ${Date.now()}`,
  ];

  await signIn(page, email);

  await page.getByLabel("Product name").fill(productName);
  await page.getByRole("button", { name: "Add product" }).click();
  await page.getByRole("link", { name: productName }).click();
  await expect(page).toHaveURL(/\/app\/products\/.+/);
  for (const name of ideaNames) {
    await page.getByLabel("Idea name").fill(name);
    await page.getByRole("button", { name: "Add idea" }).click();
    await expect(page.getByText(name)).toBeVisible();
  }

  // By position, not text: while editing, the row's name lives in the
  // input's value, which a text filter can't see. This Product is fresh, so
  // the first row is ideaNames[0].
  const row = page
    .getByRole("list", { name: "Ideas", exact: true })
    .locator("li")
    .first();
  for (const width of LAYOUT_WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await expectOtherRowsUnaffected(page, row, () =>
      row.getByRole("button", { name: "Edit" }).click(),
    );
    await expectOtherRowsUnaffected(page, row, () =>
      row.getByRole("button", { name: "Delete" }).click(),
    );
    await row.getByRole("button", { name: "Cancel" }).click();
  }
});

/**
 * A `TagPicker`'s trigger inside `scope` (#113). Its accessible name says
 * what's chosen — "Tags: Design, Pricing", or "Tags: none chosen".
 */
function tagPickerTrigger(scope: Locator): Locator {
  return scope.getByRole("button", { name: /^Tags: / });
}

/**
 * Toggle Tags in a `TagPicker` (#113): open its Dropdown from the trigger
 * inside `scope`, click each named checkbox item (the panel stays open
 * between clicks), then close it with Escape.
 */
async function toggleTags(
  page: Page,
  scope: Locator,
  tags: string[],
): Promise<void> {
  await tagPickerTrigger(scope).click();
  for (const tag of tags) {
    await page.getByRole("menuitemcheckbox", { name: tag }).click();
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).not.toBeVisible();
}

/** The pills in an Idea row's resting `TagList`. */
function restingTags(page: Page, ideaName: string): Locator {
  return page
    .locator("li", { has: page.getByText(ideaName) })
    .getByRole("list", { name: "Tags", exact: true })
    .getByRole("listitem");
}

// Issue #113: choose a Tag while adding an Idea, see it as a pill on the Idea.
test("sign in, add a Product, add an Idea with a Tag, and see the Tag listed", async ({
  page,
}) => {
  const email = TEST_EMAILS.e2eAddIdeaWithTag;
  const productName = `Tag add product ${Date.now()}`;
  const ideaName = `Tag add idea ${Date.now()}`;

  await signIn(page, email);

  await page.getByLabel("Product name").fill(productName);
  await page.getByRole("button", { name: "Add product" }).click();
  await page.getByRole("link", { name: productName }).click();
  await expect(page).toHaveURL(/\/app\/products\/.+/);

  const addForm = page.locator("form", { has: page.getByLabel("Idea name") });
  await page.getByLabel("Idea name").fill(ideaName);
  await toggleTags(page, addForm, ["Pricing"]);
  // The chosen Tag shows in the form before submitting.
  await expect(tagPickerTrigger(addForm)).toHaveAccessibleName("Tags: Pricing");
  await page.getByRole("button", { name: "Add idea" }).click();

  await expect(restingTags(page, ideaName)).toHaveText(["Pricing"]);
  // The add form resets for the next Idea, Tags included.
  await expect(tagPickerTrigger(addForm)).toHaveAccessibleName(
    "Tags: none chosen",
  );

  // Persisted, not just local state: survives a reload.
  await page.reload();
  await expect(restingTags(page, ideaName)).toHaveText(["Pricing"]);
});

// Issue #113: change an Idea's Tags via its edit mode.
test("sign in, add a Product, add an Idea, change its Tags in edit mode, and see the new Tags", async ({
  page,
}) => {
  const email = TEST_EMAILS.e2eEditIdeaTags;
  const productName = `Tag edit product ${Date.now()}`;
  const ideaName = `Tag edit idea ${Date.now()}`;

  await signIn(page, email);

  await page.getByLabel("Product name").fill(productName);
  await page.getByRole("button", { name: "Add product" }).click();
  await page.getByRole("link", { name: productName }).click();
  await expect(page).toHaveURL(/\/app\/products\/.+/);

  const addForm = page.locator("form", { has: page.getByLabel("Idea name") });
  await page.getByLabel("Idea name").fill(ideaName);
  await toggleTags(page, addForm, ["Design"]);
  await page.getByRole("button", { name: "Add idea" }).click();
  await expect(restingTags(page, ideaName)).toHaveText(["Design"]);

  const ideaListItem = page.locator("li", { has: page.getByText(ideaName) });
  await ideaListItem.getByRole("button", { name: "Edit" }).click();
  const editForm = page.locator("li form");
  // Edit mode starts from the Idea's current Tags.
  await expect(tagPickerTrigger(editForm)).toHaveAccessibleName("Tags: Design");
  await toggleTags(page, editForm, ["Design", "Staffing", "Promotion"]);
  await editForm.getByRole("button", { name: "Save" }).click();

  await expect(editForm).not.toBeVisible();
  // Catalog (alphabetical) order, not the order they were picked in.
  await expect(restingTags(page, ideaName)).toHaveText([
    "Promotion",
    "Staffing",
  ]);

  await page.reload();
  await expect(restingTags(page, ideaName)).toHaveText([
    "Promotion",
    "Staffing",
  ]);
});

// Issue #113: Tags that don't fit. On desktop a row's Tag column and the
// `TagPicker` box each stay one line — as many pills as fit, then "+N"; a
// row's "+N" opens a popover with every Tag. On a phone a row shows every
// pill instead.
test("an Idea with every Tag shows +N on desktop and every pill on a phone", async ({
  page,
}) => {
  const email = TEST_EMAILS.e2eIdeaTagOverflow;
  const productName = `Tag overflow product ${Date.now()}`;
  const ideaName = `Tag overflow idea ${Date.now()}`;

  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, email);

  await page.getByLabel("Product name").fill(productName);
  await page.getByRole("button", { name: "Add product" }).click();
  await page.getByRole("link", { name: productName }).click();
  await expect(page).toHaveURL(/\/app\/products\/.+/);

  const addForm = page.locator("form", { has: page.getByLabel("Idea name") });
  await page.getByLabel("Idea name").fill(ideaName);
  await tagPickerTrigger(addForm).click();
  const catalog = await page.getByRole("menuitemcheckbox").allTextContents();
  expect(catalog.length).toBeGreaterThan(3);
  for (const tag of catalog) {
    await page.getByRole("menuitemcheckbox", { name: tag }).click();
  }
  await page.keyboard.press("Escape");

  // Every Tag chosen, yet the box stays the name field's height: one line.
  const nameBox = await page.getByLabel("Idea name").boundingBox();
  const pickerBox = await tagPickerTrigger(addForm).boundingBox();
  expect(Math.round(pickerBox!.height)).toBe(Math.round(nameBox!.height));

  await page.getByRole("button", { name: "Add idea" }).click();

  const row = page.locator("li", { has: page.getByText(ideaName) });
  const more = row.getByRole("button", { name: /^Show \d+ more tags?$/ });
  await expect(more).toBeVisible();
  // The pills shown plus the ones "+N" stands for are every Tag.
  const shown = await restingTags(page, ideaName).count();
  expect(shown).toBeGreaterThan(0);
  await expect(more).toHaveAccessibleName(
    `Show ${catalog.length - shown} more tags`,
  );
  await more.click();
  await expect(page.getByRole("dialog").getByRole("listitem")).toHaveText(
    catalog,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();

  await page.setViewportSize({ width: 375, height: 900 });
  await expect(restingTags(page, ideaName)).toHaveText(catalog);
  await expect(more).not.toBeVisible();
});
