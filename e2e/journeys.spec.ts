import { test, expect, type Page } from "@playwright/test";

import { TEST_EMAILS } from "../test/emails";
import { signIn } from "./sign-in";

// Journeys (#137, #170): sign in, open a Product, choose Dream Sequence in
// Pathfinder, read its Milestones on its Trailhead, start the Journey, see
// Milestone 1 current — then back on the Product home, see it named there.
// Also covers advancing from Milestone 1 to Milestone 2 (#138), and
// returning to Milestone 1 and advancing again, and filling out the
// Product Summary Worksheet on Milestone 1 and finding it kept on
// Milestone 2 (#139), with a Task ticked along the way (#140), and
// starting a Journey on a Path of the User's own (#170), and restarting a
// finished Journey and deleting the old one (#172). Signs in through
// the API with `signIn` (see `./sign-in.ts`).

/** Add a Product from `/app` and open it. */
async function openNewProduct(page: Page, productName: string) {
  await page.getByLabel("Product name").fill(productName);
  await page.getByRole("button", { name: "Add Product" }).click();
  await page.getByRole("link", { name: productName }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: productName }),
  ).toBeVisible();
}

/** From a Product with no Journeys, start one on Dream Sequence. */
async function startDreamSequence(page: Page) {
  await page.getByRole("link", { name: "Choose a Path" }).click();
  await page.getByRole("link", { name: "Dream Sequence" }).click();
  await page.getByRole("button", { name: "Start on Path" }).click();
  await expect(page).toHaveURL(/\/app\/products\/[^/]+\/journeys\/[^/]+$/);
}

test("sign in, open a Product, choose Dream Sequence in Pathfinder, start it from its Trailhead, and see Milestone 1 current", async ({
  page,
}) => {
  // Reused fixed address against a persistent local dev database (see
  // products.spec.ts's own note) — a unique name per run is what makes this
  // run's own Product identifiable.
  const productName = `A phone-scale app ${Date.now()}`;

  await signIn(page, TEST_EMAILS.e2eStartJourney);
  await openNewProduct(page, productName);

  // No Journeys yet: the Product home points at Pathfinder.
  await page.getByRole("link", { name: "Choose a Path" }).click();
  await expect(page).toHaveURL(/\/app\/products\/.+\/pathfinder$/);
  await expect(
    page.getByRole("link", { name: "Make your own Path" }),
  ).toHaveAttribute("href", "/app/paths");
  await page.getByRole("link", { name: "Dream Sequence" }).click();
  await expect(page).toHaveURL(
    /\/app\/products\/.+\/paths\/dream-sequence\/trailhead$/,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Dream Sequence" }),
  ).toBeVisible();

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
  // Dream Sequence has one version, so there's no other to pick.
  await expect(
    page.getByRole("link", { name: "Looking for an older version?" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Start on Path" }).click();

  await expect(page).toHaveURL(/\/app\/products\/[^/]+\/journeys\/[^/]+$/);
  await expect(milestones.locator('[aria-current="step"]')).toContainText(
    "Rough One-Pager",
  );
  // The current Milestone's heading sits on the baseline of "Milestones"
  // over the route, as on a Path's own page (#198).
  const baseline = (name: string) =>
    page.getByRole("heading", { name, exact: true }).evaluate((heading) => {
      const probe = document.createElement("span");
      probe.style.display = "inline-block";
      heading.append(probe);
      const y = probe.getBoundingClientRect().bottom;
      probe.remove();
      return y;
    });
  expect(await baseline("Rough One-Pager")).toBe(await baseline("Milestones"));

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

  // The breadcrumbs name the Path and the Journey's state; the Product's
  // Paths page lists it as in progress.
  const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText(
    "Current Journey",
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Dream Sequence" }),
  ).toBeVisible();
  await breadcrumbs.getByRole("link", { name: "Paths" }).click();
  await expect(page).toHaveURL(/\/app\/products\/[^/]+\/journeys$/);
  await expect(
    page.getByRole("link", { name: "Dream Sequence In Progress" }),
  ).toBeVisible();

  // Back on the Product home, its Active Paths shows it.
  await breadcrumbs.getByRole("link", { name: productName }).click();
  await expect(
    page
      .getByRole("list", { name: "Active Paths" })
      .getByRole("link", { name: "Dream Sequence In Progress" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "View Paths" })).toBeVisible();

  // Pathfinder now marks Dream Sequence as followed and links to its
  // Journey, not back to its Trailhead.
  const productUrl = page.url();
  await page.goto(`${productUrl}/pathfinder`);
  await page.getByRole("link", { name: "Dream Sequence Following" }).click();
  await expect(page).toHaveURL(/\/journeys\/[^/]+$/);

  // Its Trailhead, reached directly, offers the Journey, not a second start.
  await page.goto(`${productUrl}/paths/dream-sequence/trailhead`);
  await expect(
    page.getByText(`${productName} is already following Dream Sequence.`),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Start on Path" })).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: "View Current Path Journey" }).click();
  await expect(page).toHaveURL(/\/journeys\/[^/]+$/);

  // The Path's crumb goes back to its Trailhead for this Product.
  await breadcrumbs.getByRole("link", { name: "Dream Sequence" }).click();
  await expect(page).toHaveURL(`${productUrl}/paths/dream-sequence/trailhead`);

  // The one-Journey page's old address lands on the Journeys page.
  await page.goto(`${productUrl}/journey`);
  await expect(page).toHaveURL(`${productUrl}/journeys`);
});

test("make a Path in Trailblazer with a Milestone and a Task, save a version, and start a Journey on it from a Product", async ({
  page,
}) => {
  const pathName = `Weekend Launch ${Date.now()}`;
  const productName = `A weekend app ${Date.now()}`;

  await signIn(page, TEST_EMAILS.e2eFollowOwnPath);

  await page.getByRole("link", { name: "Paths", exact: true }).click();
  await page.getByRole("button", { name: "Make New Path" }).click();
  const makePath = page.getByRole("dialog", { name: "Make New Path" });
  await makePath.getByLabel("Path name").fill(pathName);
  await makePath.getByLabel("Description").fill("Two days to sign-ups.");
  await makePath.getByRole("button", { name: "Make New Path" }).click();
  await expect(page).toHaveURL(/\/app\/paths\/[^/]+\/edit$/);

  await page.getByRole("button", { name: "Manage Milestones" }).click();
  const editPath = page.getByRole("dialog", { name: "Edit Path" });
  await editPath.getByRole("button", { name: "Add Milestone" }).click();
  const addMilestone = page.getByRole("dialog", { name: "Add Milestone" });
  await addMilestone.getByLabel("Milestone name").fill("Pick a Problem");
  await addMilestone.getByLabel("Description").fill("Choose one problem.");
  await addMilestone.getByLabel("Done when").fill("It fits in a sentence.");
  await addMilestone.getByRole("button", { name: "Add Milestone" }).click();
  await editPath.getByRole("button", { name: "Update Path" }).click();
  await expect(editPath).toBeHidden();

  await page.getByLabel("Task title").fill("Write it down");
  await page.getByRole("button", { name: "Add Task" }).click();
  await expect(
    page.getByRole("list", { name: "Tasks" }).getByRole("listitem"),
  ).toHaveText([/^Write it down/]);
  const save = page.getByRole("button", { name: "Save as New Version" });
  const latestVersion = page
    .getByRole("status")
    .filter({ hasText: /saved version|Latest version/ });
  await save.click();
  await expect(latestVersion).toHaveText(/^Latest version: 1, saved /);
  await save.click();
  await expect(latestVersion).toHaveText(/^Latest version: 2, saved /);

  await page.getByRole("link", { name: "Products", exact: true }).click();
  await openNewProduct(page, productName);
  await page.getByRole("link", { name: "Choose a Path" }).click();
  await page.getByRole("link", { name: pathName }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: pathName }),
  ).toBeVisible();
  // A User's own Path shows its description where Dream Sequence has its pitch.
  await expect(page.getByText("Two days to sign-ups.")).toBeVisible();

  // An earlier version is in a Dialog behind a quiet link, and says how to
  // get back.
  const earlier = page.getByText("This is version 1.");
  await expect(earlier).toHaveCount(0);
  await page
    .getByRole("link", { name: "Looking for an older version?" })
    .click();
  const versions = page.getByRole("dialog", {
    name: `Versions of ${pathName}`,
  });
  await versions.getByRole("link", { name: /^Version 1, saved / }).click();
  await expect(page).toHaveURL(/\/trailhead\?version=1$/);
  await expect(versions).toHaveCount(0);
  await expect(earlier).toBeVisible();
  await page
    .getByRole("link", { name: "A newer version is available." })
    .click();
  await expect(page).toHaveURL(/\/trailhead$/);
  await expect(earlier).toHaveCount(0);

  await page.getByRole("button", { name: "Start on Path" }).click();

  await expect(page).toHaveURL(/\/app\/products\/[^/]+\/journeys\/[^/]+$/);
  await expect(
    page
      .getByRole("list", { name: "Milestones" })
      .locator('[aria-current="step"]'),
  ).toContainText("Pick a Problem");
  await expect(
    page.getByRole("checkbox", { name: "Write it down" }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toContainText(pathName);
});

test("finish a Journey, then Return: un-finished with Growth still current, and the Product home agrees", async ({
  page,
}) => {
  const productName = `A finished app ${Date.now()}`;

  await signIn(page, TEST_EMAILS.e2eReturnFromFinished);
  await openNewProduct(page, productName);
  await startDreamSequence(page);

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
  // The Product Summary stays a click away past the Milestones it's on (#139).
  await expect(
    page.getByRole("link", { name: "Product Summary Incomplete" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark Journey Complete" }).click();
  await expect(
    page.getByRole("heading", { name: "Dream Sequence complete" }),
  ).toBeVisible();
  // The last crumb follows the Journey's state without a reload.
  const currentCrumb = page
    .getByRole("navigation", { name: "Breadcrumb" })
    .locator('[aria-current="page"]');
  await expect(currentCrumb).toHaveText("Completed Journey");
  // …and once finished.
  await expect(
    page.getByRole("link", { name: "Product Summary Incomplete" }),
  ).toBeVisible();

  // Returning from finished mirrors finishing: it only un-finishes, so
  // Growth is current again rather than the Milestone before it.
  await page
    .getByRole("button", { name: "Return to Previous Milestone" })
    .click();
  await expect(current).toContainText("Growth");
  await expect(
    page.getByRole("button", { name: "Mark Journey Complete" }),
  ).toBeVisible();
  await expect(currentCrumb).toHaveText("Current Journey");

  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: productName })
    .click();
  await expect(
    page
      .getByRole("list", { name: "Active Paths" })
      .getByRole("link", { name: "Dream Sequence In Progress" }),
  ).toBeVisible();
});

test("tick a Task and fill out the Product Summary from Milestone 1, land back on the Journey with the Task still ticked, then see the Summary kept on Milestone 2", async ({
  page,
}) => {
  const productName = `A summarized app ${Date.now()}`;

  await signIn(page, TEST_EMAILS.e2eFillOnePager);
  await openNewProduct(page, productName);
  await startDreamSequence(page);

  // Milestone 1's Tasks (#140): the Event one shows an Event Tag instead of
  // its "EVENT:" prefix. Ticking one is saved.
  await expect(
    page.getByText("Schedule time to write the Product Summary (optional)"),
  ).toBeVisible();
  await expect(page.getByText("EVENT:")).toHaveCount(0);
  const completeTask = page.getByRole("checkbox", {
    name: "Complete the Product Summary",
  });
  await completeTask.check();
  await expect(completeTask).toBeChecked();
  await expect(completeTask).toBeEnabled();

  // Milestone 1 holds the Product Summary (#139), not yet filled in.
  await page.getByRole("link", { name: "Product Summary Incomplete" }).click();
  await expect(page).toHaveURL(
    /\/journeys\/[^/]+\/worksheets\/product-summary$/,
  );
  await expect(
    page.getByRole("heading", { name: "Product Summary" }),
  ).toBeVisible();
  // Its trail is the Journey's, then the Worksheet.
  const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumbs.getByRole("listitem")).toHaveText([
    "Products",
    productName,
    "Paths",
    "Dream Sequence",
    "Current Journey",
    "Product Summary",
  ]);
  await expect(
    breadcrumbs.getByRole("link", { name: "Current Journey" }),
  ).toHaveAttribute("href", /\/journeys\/[^/]+$/);
  // Credited to Lean Canvas, linking the license.
  await expect(
    page.getByText("Credit: Adapted from Lean Canvas by Ash Maurya"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "CC BY-SA 3.0" })).toBeVisible();

  await page.getByLabel("1. Problem").fill("Kitchen scales are clunky");
  await page.getByLabel("2. Customer").fill("Home bakers");
  // Saving drops you back on the Journey page.
  await page.getByRole("button", { name: "Save Product Summary" }).click();
  await expect(page).toHaveURL(/\/journeys\/[^/]+$/);
  // A fresh load of the Journey: the Task is still ticked.
  await expect(
    page.getByRole("checkbox", { name: "Complete the Product Summary" }),
  ).toBeChecked();

  // Kept, and still there to edit on Milestone 2.
  await page.getByRole("button", { name: "Advance to Next Milestone" }).click();
  await expect(
    page
      .getByRole("list", { name: "Milestones" })
      .locator('[aria-current="step"]'),
  ).toContainText("Real Talk");
  await page.getByRole("link", { name: "Product Summary Incomplete" }).click();
  await expect(page.getByLabel("1. Problem")).toHaveValue(
    "Kitchen scales are clunky",
  );
  await expect(page.getByLabel("2. Customer")).toHaveValue("Home bakers");
});

test("finish a Journey with a Task ticked, Restart it into a blank Journey, see only the new one in the Product's Active Paths, delete the finished one, then abandon, resume, abandon and delete the new one", async ({
  page,
}) => {
  await signIn(page, TEST_EMAILS.e2eRestartJourney);
  const productName = `A restarted app ${Date.now()}`;
  await openNewProduct(page, productName);
  await startDreamSequence(page);
  const finishedUrl = page.url();

  const task = page.getByRole("checkbox", {
    name: "Complete the Product Summary",
  });
  await task.check();
  await expect(task).toBeChecked();
  const advanceButton = page.getByRole("button", {
    name: "Advance to Next Milestone",
  });
  const current = page
    .getByRole("list", { name: "Milestones" })
    .locator('[aria-current="step"]');
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
  await page.getByRole("button", { name: "Mark Journey Complete" }).click();

  await page.getByRole("button", { name: "Restart Path" }).click();
  await expect(current).toContainText("Rough One-Pager");
  expect(page.url()).not.toBe(finishedUrl);
  await expect(task).not.toBeChecked();

  // The Product home lists active Journeys only.
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: productName })
    .click();
  await expect(
    page.getByRole("list", { name: "Active Paths" }).getByRole("link"),
  ).toHaveText([/Dream Sequence\s*In Progress/]);
  await page.getByRole("link", { name: "View Paths" }).click();
  const journeys = page.getByRole("link", { name: /^Dream Sequence/ });
  const active = page.getByRole("list", {
    name: "Active Paths",
    exact: true,
  });
  const inactive = page.getByRole("list", {
    name: "Inactive Paths",
    exact: true,
  });
  await expect(journeys).toHaveCount(2);
  await expect(active.getByRole("link")).toHaveText(/In Progress/);
  await expect(inactive.getByRole("link")).toHaveText(/Completed/);

  await inactive.getByRole("link").click();
  await page.getByRole("button", { name: "Delete This Journey" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Delete Journey Permanently?",
  });
  await expect(dialog).toContainText("Worksheet answers and checked Tasks");
  await dialog.getByRole("button", { name: "Delete This Journey" }).click();

  await expect(page).toHaveURL(/\/journeys$/);
  await expect(journeys).toHaveCount(1);
  await expect(inactive).toHaveCount(0);
  await expect(active.getByRole("link")).toHaveText(/In Progress/);

  // A Journey in progress can't be deleted until it's abandoned.
  await journeys.click();
  await expect(
    page.getByRole("button", { name: "Delete This Journey" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Abandon Path" }).click();
  await page.getByRole("button", { name: "Abandon Path" }).click();
  await expect(
    page.getByRole("heading", { name: "Dream Sequence abandoned" }),
  ).toBeVisible();
  await expect(advanceButton).toHaveCount(0);
  const currentCrumb = page
    .getByRole("navigation", { name: "Breadcrumb" })
    .locator('[aria-current="page"]');
  await expect(currentCrumb).toHaveText("Abandoned Journey");

  // Resuming puts it back where it was, with no Abandon half-confirmed.
  await page.getByRole("button", { name: "Resume Path" }).click();
  await expect(current).toContainText("Rough One-Pager");
  await expect(currentCrumb).toHaveText("Current Journey");
  await expect(advanceButton).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toHaveCount(0);
  await page.getByRole("button", { name: "Abandon Path" }).click();
  await page.getByRole("button", { name: "Abandon Path" }).click();
  await expect(
    page.getByRole("heading", { name: "Dream Sequence abandoned" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Delete This Journey" }).click();
  await dialog.getByRole("button", { name: "Delete This Journey" }).click();
  await expect(page).toHaveURL(/\/journeys$/);
  await expect(journeys).toHaveCount(0);
  await expect(
    page.getByText("This Product is not following any Paths yet."),
  ).toBeVisible();
});
