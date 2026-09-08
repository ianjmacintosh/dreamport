import path from "node:path";

import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Seam 1 harness: `*.worker.test.ts` files run inside workerd via
// @cloudflare/vitest-pool-workers, with real bindings and per-test isolated
// storage, driving the Worker's `fetch` handler with `Request`s.
export default defineConfig(async () => {
  const migrations = await readD1Migrations(
    path.join(import.meta.dirname, "migrations"),
  );

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc", environment: "local" },
        miniflare: {
          bindings: {
            // Consumed by test/apply-migrations.ts.
            TEST_MIGRATIONS: migrations,
            // A Cloudflare secret in real environments; fixed here.
            BETTER_AUTH_SECRET: "test-secret-0000000000000000000000000000",
            // The send-OTP gate reads this to decide whether Turnstile is
            // configured (empty ⇒ 503). Seam 1 tests stub the verifier
            // itself, so the value only needs to be non-empty; the real
            // `verifyTurnstile` is covered in src/worker/turnstile.test.ts.
            TURNSTILE_SECRET_KEY: "test-turnstile-secret",
          },
          // `npm run dev` gets its assets directory from the Vite plugin; the
          // pool needs one spelled out. The fixture is a stand-in SPA shell —
          // enough to exercise `env.ASSETS` forwarding and the
          // single-page-application fallback (both from wrangler.jsonc).
          assets: {
            directory: path.join(import.meta.dirname, "test/fixtures/spa"),
          },
        },
      }),
    ],
    test: {
      name: "workers",
      include: ["src/**/*.worker.test.ts"],
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
