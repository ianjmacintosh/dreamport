import { expect, test, type Page } from "@playwright/test";

import { TEST_EMAILS } from "../test/emails";
import { signIn } from "./sign-in";

/** Make a Path with one Milestone from the Paths list, and save Version 1. */
async function savedPath(page: Page, name: string) {
  await page.getByRole("link", { name: "Paths", exact: true }).click();
  await page.getByRole("button", { name: "Make New Path" }).click();
  const make = page.getByRole("dialog", { name: "Make New Path" });
  await make.getByLabel("Path name").fill(name);
  await make.getByLabel("Description").fill("Two days to sign-ups.");
  await make.getByRole("button", { name: "Make New Path" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  await page.getByRole("button", { name: "Manage Milestones" }).click();
  const editPath = page.getByRole("dialog", { name: "Edit Path" });
  await editPath.getByRole("button", { name: "Add Milestone" }).click();
  const add = page.getByRole("dialog", { name: "Add Milestone" });
  await add.getByLabel("Milestone name").fill("Launch");
  await add.getByLabel("Description").fill("Ship it.");
  await add.getByLabel("Done when").fill("It's live.");
  await add.getByRole("button", { name: "Add Milestone" }).click();
  await editPath.getByRole("button", { name: "Update Path" }).click();
  await expect(editPath).toBeHidden();

  await page.getByRole("button", { name: "Save as New Version" }).click();
}

function versionLine(page: Page) {
  return page.getByRole("main").locator("b").first();
}

test("a Guide publishes Version 1, opens the Path, and unpublishing it closes the Path and says so", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page, TEST_EMAILS.guide);
  await savedPath(page, `Guided Launch ${Date.now()}`);
  const main = page.getByRole("main");
  const pathStatus = main.getByText(/^Path Status:/);
  await expect(versionLine(page)).toHaveText("Version 1 (unpublished)");
  await expect(pathStatus).toHaveText("Path Status: Closed");
  await expect(
    main.getByRole("button", { name: "Open This Path" }),
  ).toBeHidden();

  await main.getByRole("button", { name: "Manage Versions" }).click();
  const versions = page.getByRole("dialog", { name: "Manage Versions" });
  await versions.getByRole("button", { name: "Publish" }).click();
  await expect(
    versions
      .getByRole("status")
      .filter({ hasText: "This Path is still closed" }),
  ).toBeVisible();
  await versions.getByRole("button", { name: "Copy Link" }).click();
  await expect(
    versions.getByRole("button", { name: "Copied Link" }),
  ).toBeVisible();
  await expect(
    versions.getByRole("button", { name: "Copy Link" }),
  ).toBeVisible();
  const pathId = new URL(page.url()).pathname.split("/")[3];
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    new URL(`/app/paths/${pathId}?version=1`, page.url()).href,
  );
  await versions.getByRole("button", { name: "Done" }).click();
  await expect(versionLine(page)).toHaveText("Version 1");

  await main.getByRole("button", { name: "Open This Path" }).click();
  await expect(pathStatus).toHaveText("Path Status: Open");
  await expect(main.getByRole("button", { name: "Delete Path" })).toBeHidden();

  await main.getByRole("button", { name: "Manage Versions" }).click();
  await versions.getByRole("button", { name: "Unpublish" }).click();
  await expect(versions).toContainText(
    "Users who already Added Version 1 keep it. It's the only published version, so unpublishing it closes this Path.",
  );
  await versions.getByRole("button", { name: "Unpublish" }).click();
  await expect(versions.getByRole("button", { name: "Publish" })).toBeVisible();
  await versions.getByRole("button", { name: "Done" }).click();

  await expect(
    main.getByRole("status").filter({ hasText: "only published version" }),
  ).toHaveText(
    "Version 1 was the only published version, so this Path is now closed.",
  );
  await expect(pathStatus).toHaveText("Path Status: Closed");
  await expect(versionLine(page)).toHaveText("Version 1 (unpublished)");
  await expect(main.getByRole("button", { name: "Delete Path" })).toBeVisible();

  await page.reload();
  await expect(pathStatus).toHaveText("Path Status: Closed");
  await expect(versionLine(page)).toHaveText("Version 1 (unpublished)");
});

test("a plain User's editor shows the version, and nothing about publishing", async ({
  page,
}) => {
  await signIn(page, TEST_EMAILS.e2ePlainPathMaker);
  await savedPath(page, `Plain Launch ${Date.now()}`);
  const main = page.getByRole("main");
  await expect(versionLine(page)).toHaveText("Version 1");
  await expect(main.getByText(/Path Status|publish/i)).toHaveCount(0);
  await expect(
    main.getByRole("button", { name: "Manage Versions" }),
  ).toHaveCount(0);
});
