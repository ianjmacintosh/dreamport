import { test, expect } from "@playwright/test";

import { TEST_EMAILS } from "../test/emails";

/**
 * Post-deploy smoke test for the Turnstile integration, run against a real
 * deployed environment — the check that would have caught every staging
 * breakage in the #23 rollout (site key dropped from the build,
 * `TURNSTILE_SECRET_KEY` unset, mismatched key pair).
 *
 * Opt-in: set `E2E_BASE_URL` to the target. `playwright.config.ts` then runs
 * *only* this spec, against that URL, with no local `webServer`:
 *
 *   E2E_BASE_URL=https://xxxxxxxx-dreamport-staging.bananasquad.workers.dev \
 *     npm run test:e2e
 *
 * Point it at **staging**, not production: staging runs Cloudflare's
 * always-pass test keys so the widget auto-solves for a plain headless load.
 * A real production Managed widget may serve an interactive challenge to
 * automation and hang — production stays a manual check.
 *
 * It can't finish sign-in (the `/api/test/last-otp` hook is `import.meta.env
 * .DEV`-only and stripped from deployed builds), so it stops once a code has
 * been sent. That's the whole Turnstile path: the widget rendered with a
 * real site key, solved a challenge, and the Worker verified the token
 * before Better Auth issued a code.
 */

const BASE_URL = process.env.E2E_BASE_URL;

test.describe("deployed Turnstile smoke", () => {
  test.skip(!BASE_URL, "set E2E_BASE_URL to a deployed environment to run");

  test("the /login widget renders and a code can be sent", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    // A build that dropped VITE_TURNSTILE_SITE_KEY renders
    // `<Turnstile siteKey={undefined}>`, which logs this and never produces a
    // token. Assert it first — a clearer failure than the timeout below.
    expect(
      consoleErrors.some((t) =>
        t.includes("VITE_TURNSTILE_SITE_KEY is not set"),
      ),
      "widget has no site key — the build variable was dropped (see docs/deployment.md, Build step)",
    ).toBe(false);

    // Widget solved the challenge and wrote the token into the hidden field
    // the gate reads. Fails if the site key is invalid or not authorised for
    // this hostname.
    await expect(
      page.locator('input[name="cf-turnstile-response"]'),
    ).toHaveValue(/.+/, { timeout: 30_000 });

    await page.getByLabel("Email address").fill(TEST_EMAILS.deploySmoke);
    await page.getByRole("button", { name: "Send code" }).click();

    // Reaching the code step means the Worker verified the token (so
    // TURNSTILE_SECRET_KEY is set and the key pair matches) and Better Auth
    // issued a code.
    await expect(page.getByLabel("Six-digit code")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
});
