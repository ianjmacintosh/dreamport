import { configDefaults, defineConfig } from "vitest/config";

// Plain Vitest: component smoke tests and pure modules (e.g. the
// trusted-origins policy, the vite.config Turnstile-key resolver). Seam 1
// Worker tests are `*.worker.test.ts` and run in the separate `workers`
// project instead.
export default defineConfig({
  test: {
    name: "unit",
    include: ["src/**/*.test.{ts,tsx}", "vite.config.test.ts"],
    exclude: [...configDefaults.exclude, "e2e/**", "src/**/*.worker.test.ts"],
  },
});
