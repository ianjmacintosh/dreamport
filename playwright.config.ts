import { defineConfig, devices } from "@playwright/test";

/**
 * `E2E_BASE_URL` switches the run from the local Worker to a deployed
 * environment: the base URL points there, the local `webServer` and D1
 * migration setup are skipped, and only `deployment-smoke.spec.ts` runs (the
 * `/login`+`/app` specs' delete-account case needs the DEV-only
 * `/api/test/last-delete-link` hook, which deployed builds don't have — sign-
 * in itself no longer needs a hook there, since #39 moved it to the
 * `+e2e-test@` fixed-code marker). Unset, everything is as before and the
 * smoke spec is skipped.
 */
const DEPLOYED_TARGET = process.env.E2E_BASE_URL;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./e2e",
  testIgnore: DEPLOYED_TARGET
    ? "**/login.spec.ts"
    : "**/deployment-smoke.spec.ts",
  /* Apply the local D1 migrations before anything runs (also covers the
   * reuse-existing-server case, which skips `e2e:server`). Not needed when
   * testing a deployed environment. */
  globalSetup: DEPLOYED_TARGET ? undefined : "./e2e/global-setup.ts",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/login')`. */
    baseURL: DEPLOYED_TARGET ?? "http://localhost:5173",

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
  },

  /*
   * Chromium only. The auth flow under test has no browser-specific surface,
   * and every project would share the one webServer's in-memory mock email
   * sender — so the same sign-in spec on two browsers would race to read each
   * other's code. Cross-browser e2e is a deferred gap (see the #22 comment).
   */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /*
   * Boot the local Worker (Vite + the Cloudflare plugin's Miniflare) before
   * the run. `e2e:server` first applies the D1 migrations to the local
   * database, then starts the dev server on a fixed port. `EMAIL_MODE` is
   * `mock` for the `local` env (wrangler.jsonc), so no real email is sent and
   * the `/api/test/last-delete-link` hook is mounted.
   */
  webServer: DEPLOYED_TARGET
    ? undefined
    : {
        command: "npm run e2e:server",
        url: "http://localhost:5173",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
