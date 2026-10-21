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

test("another User sees a Guide's open Path's published version with no Start or Edit Path, and then that it's no longer available once closed", async ({
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
  await expect(page.getByText("Version 1 · Free")).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit Path" })).toBeVisible();

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await signIn(visitor, TEST_EMAILS.e2eTrailheadVisitor);
  await visitor.goto(`/app/paths/${path.id}`);
  await expect(
    visitor.getByRole("heading", { level: 1, name: pathName }),
  ).toBeVisible();
  await expect(visitor.getByText("Version 1 · Free")).toBeVisible();
  await expect(visitor.getByRole("list", { name: "Milestones" })).toContainText(
    "Launch",
  );
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
  await visitor.getByRole("link", { name: "Back to Paths" }).click();
  await expect(visitor).toHaveURL(/\/app\/paths$/);
  await visitorContext.close();
});
