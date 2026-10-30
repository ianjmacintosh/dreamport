import { expect, test, type Page } from "@playwright/test";

import { TEST_EMAILS } from "../test/emails";
import { exemptFromRateLimits } from "./rate-limit-exemption";
import { signIn } from "./sign-in";

// A Path's Trailhead at `/app/paths/:pathId` (#205): signing in from a
// Trailhead opened signed out, Start on Path with no Products, and another
// User's view of a Guide's Path. The already-on-Path warning is in
// `journeys.spec.ts`, where a Journey is already under way.

/**
 * As the signed-in `page`, make a Path with one Milestone and save it
 * `versions` times, through the API: the Path editor's own flow is
 * `publishing.spec.ts`'s.
 */
async function savedPathThroughApi(page: Page, name: string, versions = 1) {
  const origin = new URL(page.url()).origin;
  const api = (method: string, url: string, data?: unknown) =>
    page.request.fetch(url, { method, headers: { origin }, data });

  const made = await api("POST", "/api/paths", {
    name,
    description: "Two days to sign-ups.",
  });
  expect(made.status()).toBe(201);
  const { path } = (await made.json()) as { path: { id: string } };
  const updated = await api("PATCH", `/api/paths/${path.id}`, {
    name,
    description: "Two days to sign-ups.",
    milestones: [
      {
        name: "Launch",
        description: "Ship it.",
        doneWhen: "It's live.",
        outcome: "",
      },
    ],
  });
  expect(updated.status()).toBe(200);
  for (let i = 0; i < versions; i++) {
    expect((await api("POST", `/api/paths/${path.id}/versions`)).status()).toBe(
      201,
    );
  }
  return { id: path.id, api };
}

test("opening a Trailhead signed out, then signing in, lands back on it", async ({
  page,
}) => {
  await exemptFromRateLimits(page);
  await page.goto("/app/paths/dream-sequence?version=1");
  await expect(page).toHaveURL(/\/login\?redirect=/);

  await page.getByLabel("Email address").fill(TEST_EMAILS.e2eTrailheadReturn);
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(
    /.+/,
    { timeout: 15_000 },
  );
  await page.getByRole("button", { name: "Send Code" }).click();
  await page.getByRole("textbox", { name: "Six-digit code" }).fill("000000");

  await expect(page).toHaveURL(/\/app\/paths\/dream-sequence\?version=1$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Dream Sequence" }),
  ).toBeVisible();
});

test("a /login redirect to another site is ignored", async ({ page }) => {
  await signIn(page, TEST_EMAILS.e2eTrailheadReturn);
  await page.goto("/login?redirect=//example.com/app");
  await expect(page).toHaveURL(/localhost:\d+\/app$/);
});

test("Start on Path with no Products warns only once pressed, and points at Products", async ({
  page,
}) => {
  await signIn(page, TEST_EMAILS.e2eTrailheadNoProducts);
  await page.goto("/app/paths/dream-sequence");

  const product = page.getByLabel("Product");
  await expect(product).toHaveValue("");
  await expect(product.getByRole("option")).toHaveText(["No Products yet"]);
  const warning = page.getByRole("status").filter({
    hasText: "You don't have a Product yet, and a Journey needs one.",
  });
  await expect(warning).toHaveCount(0);

  await page.getByRole("button", { name: "Start on Path" }).click();

  await expect(warning).toBeVisible();
  await expect(page).toHaveURL(/\/app\/paths\/dream-sequence$/);
  await warning.getByRole("link", { name: "Add a Product" }).click();
  await expect(page).toHaveURL(/\/app$/);
});

test("another User sees a Guide's open Path's published version with Add This Path, no Start or Edit Path, and then that it's no longer available once closed", async ({
  browser,
  page,
}) => {
  const pathName = `Guided Launch ${Date.now()}`;
  await signIn(page, TEST_EMAILS.guide);
  const path = await savedPathThroughApi(page, pathName, 2);
  expect(
    (
      await path.api("PUT", `/api/paths/${path.id}/versions/1/published`)
    ).status(),
  ).toBe(200);
  expect((await path.api("PUT", `/api/paths/${path.id}/open`)).status()).toBe(
    200,
  );

  // The Guide sees what everyone sees, plus Edit Path.
  await page.goto(`/app/paths/${path.id}`);
  await expect(
    page.getByText("Version 1 · Access: Everyone · Price: Free"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit Path" })).toBeVisible();

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await signIn(visitor, TEST_EMAILS.e2eTrailheadVisitor);
  await visitor.goto(`/app/paths/${path.id}`);
  await expect(
    visitor.getByRole("heading", { level: 1, name: pathName }),
  ).toBeVisible();
  await expect(
    visitor.getByText("Version 1 · Access: Everyone · Price: Free"),
  ).toBeVisible();
  await expect(visitor.getByRole("list", { name: "Milestones" })).toContainText(
    "Launch",
  );
  await expect(
    visitor.getByRole("button", { name: "Add This Path" }),
  ).toBeVisible();
  await expect(
    visitor.getByRole("button", { name: "Start on Path" }),
  ).toHaveCount(0);
  await expect(visitor.getByRole("link", { name: "Edit Path" })).toHaveCount(0);
  // Version 2 isn't published, so it's neither listed nor shown.
  await expect(
    visitor.getByRole("link", { name: "Looking for an older version?" }),
  ).toHaveCount(0);
  await visitor.goto(`/app/paths/${path.id}?version=2`);
  const unavailable = visitor.getByRole("status").filter({
    hasText: `This Path (${pathName}) is no longer available.`,
  });
  await expect(unavailable).toBeVisible();

  expect(
    (await path.api("DELETE", `/api/paths/${path.id}/open`)).status(),
  ).toBe(200);
  await visitor.goto(`/app/paths/${path.id}`);
  await expect(unavailable).toBeVisible();
  await visitor.getByRole("link", { name: "Back to Pathfinder" }).click();
  await expect(visitor).toHaveURL(/\/app\/paths$/);
  await visitorContext.close();
});

test("another User Adds a Guide's Path from its link, follows their copy, and finds it on Pathfinder; the Guide can then only close it, not delete it", async ({
  browser,
  page,
}) => {
  const pathName = `Added Launch ${Date.now()}`;
  const productName = `An added app ${Date.now()}`;
  await signIn(page, TEST_EMAILS.guide);
  const path = await savedPathThroughApi(page, pathName, 0);
  const { draft } = (await (
    await path.api("PATCH", `/api/paths/${path.id}`, {
      name: pathName,
      description: "Two days to sign-ups.",
      milestones: [
        { id: (await draftOf(path)).milestones[0].id },
        {
          name: "Grow",
          description: "Find more people.",
          doneWhen: "Ten people use it.",
          outcome: "",
        },
      ],
    })
  ).json()) as { draft: { milestones: { id: string }[] } };
  expect(
    (
      await path.api(
        "POST",
        `/api/paths/${path.id}/milestones/${draft.milestones[0].id}/tasks`,
        { title: "Tell five friends" },
      )
    ).status(),
  ).toBe(201);
  for (const [method, url] of [
    ["POST", `/api/paths/${path.id}/versions`],
    ["PUT", `/api/paths/${path.id}/versions/1/published`],
    ["PUT", `/api/paths/${path.id}/open`],
  ]) {
    expect((await path.api(method, url)).ok()).toBe(true);
  }

  const adderContext = await browser.newContext();
  const adder = await adderContext.newPage();
  await signIn(adder, TEST_EMAILS.e2eAdder);
  await adder.getByLabel("Product name").fill(productName);
  await adder.getByRole("button", { name: "Add Product" }).click();
  await expect(adder.getByRole("link", { name: productName })).toBeVisible();

  await adder.goto(`/app/paths/${path.id}`);
  await adder.getByRole("button", { name: "Add This Path" }).click();
  await expect(
    adder.getByRole("button", { name: "Add This Path" }),
  ).toHaveCount(0);
  await adder.getByLabel("Product").selectOption({ label: productName });
  await adder.getByRole("button", { name: "Start on Path" }).click();
  await expect(adder).toHaveURL(/\/app\/products\/[^/]+\/journeys\/[^/]+$/);
  await expect(
    adder.getByRole("heading", { level: 1, name: pathName }),
  ).toBeVisible();

  const task = adder.getByRole("checkbox", { name: "Tell five friends" });
  await task.check();
  await expect(task).toBeChecked();
  await adder
    .getByRole("button", { name: "Advance to Next Milestone" })
    .click();
  await adder
    .getByRole("button", { name: "Return to Previous Milestone" })
    .click();
  await expect(
    adder.getByRole("button", { name: "Advance to Next Milestone" }),
  ).toBeVisible();
  await expect(task).toBeChecked();

  // Pathfinder lists it among the Added Paths, linking to its Trailhead.
  await adder.getByRole("link", { name: "Pathfinder", exact: true }).click();
  await expect(
    adder.getByRole("heading", { level: 1, name: "Pathfinder" }),
  ).toBeVisible();
  await expect(
    adder
      .getByRole("list", { name: "Your Added Paths" })
      .getByRole("link", { name: pathName }),
  ).toHaveAttribute("href", `/app/paths/${path.id}`);

  // Closed, their copy still shows them, with nothing about the Guide.
  expect(
    (await path.api("DELETE", `/api/paths/${path.id}/open`)).status(),
  ).toBe(200);
  await adder.goto(`/app/paths/${path.id}`);
  await expect(
    adder.getByRole("button", { name: "Start on Path" }),
  ).toBeVisible();
  await expect(adder.locator("main")).not.toContainText(TEST_EMAILS.guide);
  await adderContext.close();

  // The Guide's Delete Path is refused, saying why.
  await page.goto(`/app/paths/${path.id}/edit`);
  await page.getByRole("button", { name: "Delete Path" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Delete Path Permanently?",
  });
  await dialog.getByRole("button", { name: "Delete Path" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Someone has Added this Path, so it can't be deleted.",
  );
});

/** The Path's Draft, as its owner reads it through the API. */
async function draftOf(path: Awaited<ReturnType<typeof savedPathThroughApi>>) {
  const res = await path.api("GET", `/api/paths/${path.id}`);
  return ((await res.json()) as { draft: { milestones: { id: string }[] } })
    .draft;
}

test("a Guide changes a Path's Access in the editor, and another User's Trailhead then reads By Request with no Add", async ({
  browser,
  page,
}) => {
  const pathName = `Gated Launch ${Date.now()}`;
  await signIn(page, TEST_EMAILS.guide);
  const path = await savedPathThroughApi(page, pathName);
  await path.api("PUT", `/api/paths/${path.id}/versions/1/published`);
  await path.api("PUT", `/api/paths/${path.id}/open`);

  await page.goto(`/app/paths/${path.id}/edit`);
  await expect(page.getByText("Access: Everyone")).toBeVisible();
  await page.getByRole("button", { name: "Change Access" }).click();
  const dialog = page.getByRole("dialog", { name: "Change Access" });
  await expect(dialog.getByRole("radio", { name: /^Everyone/ })).toBeChecked();
  await dialog.getByRole("radio", { name: /^By Request/ }).check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Access: By Request")).toBeVisible();

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await signIn(visitor, TEST_EMAILS.e2eTrailheadVisitor);
  await visitor.goto(`/app/paths/${path.id}`);
  await expect(
    visitor.getByText("Version 1 · Access: By Request · Price: Free"),
  ).toBeVisible();
  await expect(
    visitor.getByRole("button", { name: "Add This Path" }),
  ).toHaveCount(0);
  await visitorContext.close();
});
