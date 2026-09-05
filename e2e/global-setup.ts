import { execSync } from "node:child_process";

/**
 * Apply the D1 migrations to the local Miniflare database before the e2e run.
 *
 * This runs whether or not Playwright reused an already-running dev server
 * (see `webServer.reuseExistingServer` in `playwright.config.ts`), so a
 * `npm run dev` started before the migrations existed still ends up with a
 * migrated database. `wrangler d1 migrations apply` skips migrations already
 * recorded, so repeating it is a no-op. Miniflare picks up the schema change
 * against its live database file, so ordering relative to `webServer` boot
 * does not matter.
 */
export default function globalSetup(): void {
  execSync("npm run migrate:local", { stdio: "inherit" });
}
