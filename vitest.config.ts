import { defineConfig } from "vitest/config";

// Two suites, run together by `npm run test:unit`:
//   - unit    — plain Vitest for components and pure modules
//   - workers — Seam 1: the Worker's fetch handler driven inside workerd
//               with real bindings (see vitest.workers.config.ts)
export default defineConfig({
  test: {
    projects: ["./vitest.unit.config.ts", "./vitest.workers.config.ts"],
  },
});
