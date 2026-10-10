import { expect, test, type Page } from "@playwright/test";

import { TEST_EMAILS } from "../test/emails";
import { signIn } from "./sign-in";

/** Make a Path from the Paths list and open its page. */
async function addPath(page: Page, name: string) {
  await page.getByRole("link", { name: "Paths", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Paths" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add Path" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Path" });
  await dialog.getByLabel("Path name").fill(name);
  await dialog.getByLabel("Description").fill("Two days to sign-ups.");
  await dialog.getByRole("button", { name: "Add Path" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

/** Stage a Milestone from inside the open Edit Path Dialog. */
async function stageMilestone(page: Page, name: string) {
  await page
    .getByRole("dialog", { name: "Edit Path" })
    .getByRole("button", { name: "Add Milestone" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Add Milestone" });
  await dialog.getByLabel("Milestone name").fill(name);
  await dialog.getByLabel("Description").fill(`What ${name} is about.`);
  await dialog.getByLabel("Done when").fill(`${name} is done.`);
  await dialog.getByRole("button", { name: "Add Milestone" }).click();
  await expect(dialog).toBeHidden();
}

function isPathUpdate(url: string, method: string) {
  return /\/api\/paths\/[^/]+$/.test(url) && method === "PATCH";
}

test("make a Path, manage its Milestones in Edit Path, edit one, give it a Task, and save a version", async ({
  page,
}) => {
  // The e2e database outlives a run, so this run's Path gets its own name.
  const pathName = `Weekend Launch ${Date.now()}`;
  await signIn(page, TEST_EMAILS.e2eTrailblazer);
  await addPath(page, pathName);
  await expect(page.getByText("No Milestones yet.")).toBeVisible();
  const save = page.getByRole("button", { name: "Save as New Version" });
  const latestVersion = page
    .getByRole("status")
    .filter({ hasText: /saved version|Latest version/ });
  await save.click();
  await expect(page.getByRole("alert")).toHaveText(
    "Add a Milestone before saving a version.",
  );
  await expect(latestVersion).toHaveText("No saved versions yet.");

  // Adds and moves wait for Update Path, so Cancel sends nothing.
  const sent: string[] = [];
  page.on("request", (req) => {
    if (isPathUpdate(req.url(), req.method())) sent.push(req.url());
  });
  await page.getByRole("button", { name: "Manage Milestones" }).click();
  const editPath = page.getByRole("dialog", { name: "Edit Path" });
  await stageMilestone(page, "Discarded");
  await editPath.getByRole("button", { name: "Cancel" }).click();
  await expect(editPath).toBeHidden();
  await expect(page.getByText("No Milestones yet.")).toBeVisible();
  expect(sent).toEqual([]);

  await page.getByRole("button", { name: "Edit Path" }).click();
  await editPath.getByLabel("Path name").fill(`${pathName}, renamed`);
  await stageMilestone(page, "First");
  await stageMilestone(page, "Second");
  const staged = editPath
    .getByRole("list", { name: "Milestones" })
    .getByRole("listitem");
  await expect(staged).toHaveText(["1. First", "2. Second"]);
  // Several presses in a row: the handle keeps focus through each move.
  const handle = editPath.getByRole("button", { name: "Move Second" });
  await handle.focus();
  for (const [key, order] of [
    ["ArrowUp", ["1. Second", "2. First"]],
    ["ArrowDown", ["1. First", "2. Second"]],
    ["ArrowUp", ["1. Second", "2. First"]],
  ] as const) {
    await page.keyboard.press(key);
    await expect(staged).toHaveText(order);
    await expect(handle).toBeFocused();
  }
  const updated = page.waitForResponse((res) =>
    isPathUpdate(res.url(), res.request().method()),
  );
  await editPath.getByRole("button", { name: "Update Path" }).click();
  expect((await updated).status()).toBe(200);
  await expect(editPath).toBeHidden();
  expect(sent).toHaveLength(1);

  const renamed = `${pathName}, renamed`;
  await expect(
    page.getByRole("heading", { level: 1, name: renamed }),
  ).toBeVisible();
  const route = page.getByRole("list", { name: "Milestones" });
  const stops = route.getByRole("listitem");
  await expect(stops).toHaveText([/^1Second\s*No Tasks$/, /^2First/]);
  // The first Milestone is picked to start.
  await expect(
    page.getByRole("heading", { level: 3, name: "Second" }),
  ).toBeVisible();
  await expect(route.getByRole("button", { name: "Second" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await route.getByRole("button", { name: "First" }).click();
  await expect(route.getByRole("button", { name: "First" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("heading", { level: 3, name: "First" }),
  ).toBeVisible();
  await expect(page.getByText("What First is about.")).toBeVisible();

  await page.getByRole("button", { name: "Edit Milestone" }).click();
  const editMilestone = page.getByRole("dialog", { name: "Edit Milestone" });
  await expect(editMilestone.getByLabel("Milestone name")).toHaveValue("First");
  await editMilestone.getByLabel("Milestone name").fill("First, edited");
  await editMilestone.getByLabel("Outcome").fill("A problem worth a weekend");
  await editMilestone.getByRole("button", { name: "Update Milestone" }).click();
  await expect(editMilestone).toBeHidden();
  await expect(
    page.getByRole("heading", { level: 3, name: "First, edited" }),
  ).toBeVisible();
  await expect(page.getByText("A problem worth a weekend")).toBeVisible();

  await page.getByLabel("Task title").fill("Talk to 5 potential customers");
  await page.getByRole("button", { name: "Add Task" }).click();
  const tasks = page.getByRole("list", { name: "Tasks" }).getByRole("listitem");
  await expect(tasks).toHaveText([/^Talk to 5 potential customers/]);
  await expect(page.getByLabel("Task title")).toHaveValue("");
  await expect(stops).toHaveText([/^1Second/, /^2First, edited\s*1 Task$/]);

  await page.reload();
  await expect(stops).toHaveText([
    /^1Second\s*No Tasks$/,
    /^2First, edited\s*1 Task$/,
  ]);
  await route.getByRole("button", { name: "First, edited" }).click();
  await expect(tasks).toHaveText([/^Talk to 5 potential customers/]);

  // Deleting the picked Milestone picks the first one left.
  await route.getByRole("button", { name: "Second" }).click();
  await page.getByRole("button", { name: "Edit Milestone" }).click();
  await editMilestone.getByRole("button", { name: "Delete" }).click();
  await editMilestone.getByRole("button", { name: "Delete" }).click();
  await expect(editMilestone).toBeHidden();
  await expect(stops).toHaveText([/^1First, edited/]);
  await expect(
    page.getByRole("heading", { level: 3, name: "First, edited" }),
  ).toBeVisible();

  await save.click();
  await expect(latestVersion).toHaveText(/^Latest version: 1, saved /);
  await page.reload();
  await expect(latestVersion).toHaveText(/^Latest version: 1, saved /);
});

test("Update Path past 150 Milestones and Tasks shows the cap and changes nothing", async ({
  page,
  baseURL,
}) => {
  const pathName = `Full Path ${Date.now()}`;
  await signIn(page, TEST_EMAILS.e2eTrailblazer);
  await addPath(page, pathName);

  // Fill the Draft to the cap in one request, as Update Path would.
  const pathUrl = new URL(page.url()).pathname.replace("/app/", "/api/");
  const filled = await page.request.patch(pathUrl, {
    headers: { origin: new URL(baseURL ?? "").origin },
    data: {
      name: pathName,
      milestones: Array.from({ length: 150 }, (_, i) => ({
        name: `Step ${i + 1}`,
        description: "A step.",
        doneWhen: "It's done.",
      })),
    },
  });
  expect(filled.status()).toBe(200);
  await page.reload();

  await page.getByRole("button", { name: "Manage Milestones" }).click();
  const editPath = page.getByRole("dialog", { name: "Edit Path" });
  await stageMilestone(page, "One too many");
  await editPath.getByRole("button", { name: "Update Path" }).click();
  await expect(editPath.getByRole("alert")).toHaveText(
    "A Path can have up to 150 Milestones and Tasks combined. Remove one to make room.",
  );
  await editPath.getByRole("button", { name: "Cancel" }).click();
  await page.reload();
  await expect(
    page.getByRole("list", { name: "Milestones" }).getByRole("listitem"),
  ).toHaveCount(150);
});
