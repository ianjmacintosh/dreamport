import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./e2e",
  /* Apply the local D1 migrations before anything runs (also covers the
   * reuse-existing-server case, which skips `e2e:server`). */
  globalSetup: "./e2e/global-setup.ts",
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
    baseURL: "http://localhost:5173",

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
   * the `/api/test/last-otp` hook is mounted.
   */
  webServer: {
    command: "npm run e2e:server",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
