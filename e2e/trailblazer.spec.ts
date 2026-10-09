import { expect, test, type Page } from "@playwright/test";

import { TEST_EMAILS } from "../test/emails";
import { signIn } from "./sign-in";

// Trailblazer (#167): make a Path and edit its Draft's Milestones, each
// change sent as it's made, so a reload shows them all.

async function addMilestone(page: Page, name: string) {
  await page.getByRole("button", { name: "Add Milestone" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Milestone" });
  await dialog.getByLabel("Milestone name").fill(name);
  await dialog.getByLabel("Description").fill(`What ${name} is about.`);
  await dialog.getByLabel("Done when").fill(`${name} is done.`);
  await dialog.getByRole("button", { name: "Add Milestone" }).click();
  await expect(dialog).toBeHidden();
}

test("add a Path, then add, reorder, edit and delete its Milestones", async ({
  page,
}) => {
  // The e2e database outlives a run, so this run's Path gets its own name.
  const pathName = `Weekend Launch ${Date.now()}`;
  await signIn(page, TEST_EMAILS.e2eTrailblazer);

  await page.getByRole("link", { name: "Trailblazer" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Trailblazer" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add Path" }).click();
  const addPath = page.getByRole("dialog", { name: "Add Path" });
  await addPath.getByLabel("Path name").fill(pathName);
  await addPath.getByLabel("Description").fill("Two days to sign-ups.");
  await addPath.getByRole("button", { name: "Add Path" }).click();
  await expect(addPath).toBeHidden();

  await page.getByRole("link", { name: pathName }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: pathName }),
  ).toBeVisible();
  await expect(page.getByText("No Milestones yet.")).toBeVisible();

  await addMilestone(page, "First");
  await addMilestone(page, "Second");
  const rows = page
    .getByRole("list", { name: "Milestones" })
    .getByRole("listitem");
  await expect(rows).toHaveText([/^1\. First/, /^2\. Second/]);

  // Several presses in a row: the handle must keep focus through each
  // save, or the next arrow key goes nowhere.
  const handle = page.getByRole("button", { name: "Move Second" });
  await handle.focus();
  for (const [key, order] of [
    ["ArrowUp", [/^1\. Second/, /^2\. First/]],
    ["ArrowDown", [/^1\. First/, /^2\. Second/]],
    ["ArrowUp", [/^1\. Second/, /^2\. First/]],
  ] as const) {
    const saved = page.waitForResponse(
      (res) =>
        res.url().endsWith("/milestones/order") &&
        res.request().method() === "PUT",
    );
    await page.keyboard.press(key);
    expect((await saved).status(), `${key} saved`).toBe(200);
    await expect(rows).toHaveText(order);
    await expect(handle).toBeFocused();
    await expect(handle).toHaveAttribute("aria-disabled", "false");
  }

  await rows
    .filter({ hasText: "First" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const edit = page.getByRole("dialog", { name: "Edit Milestone" });
  await expect(edit.getByLabel("Milestone name")).toHaveValue("First");
  await edit.getByLabel("Milestone name").fill("First, edited");
  await edit.getByLabel("Outcome").fill("A problem worth a weekend");
  await edit.getByRole("button", { name: "Update Milestone" }).click();
  await expect(edit).toBeHidden();
  await expect(rows).toHaveText([/^1\. Second/, /^2\. First, edited/]);

  await rows
    .filter({ hasText: "Second" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await edit.getByRole("button", { name: "Delete" }).click();
  await edit.getByRole("button", { name: "Delete" }).click();
  await expect(edit).toBeHidden();
  await expect(rows).toHaveText([/^1\. First, edited/]);

  await page.reload();
  await expect(rows).toHaveText([/^1\. First, edited/]);
  await rows.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(edit.getByLabel("Outcome")).toHaveValue(
    "A problem worth a weekend",
  );
});
