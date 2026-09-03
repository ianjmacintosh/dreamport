import type { WorkerEnv } from "../src/worker/env";

// The bindings available inside the Workers pool. Mirrors the runtime
// `WorkerEnv` and adds the test-only migrations binding wired up in
// vitest.workers.config.ts.
declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      /** Consumed by test/apply-migrations.ts. */
      TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    }
  }
}
