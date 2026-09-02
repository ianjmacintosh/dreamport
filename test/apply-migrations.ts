import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Setup files run outside per-test-file storage isolation and may run more
// than once. `applyD1Migrations()` skips migrations already recorded in the
// database's migrations table, so calling it here is safe.
//
// Every Seam 1 test therefore runs against the real, migrated Better Auth
// schema — which is also what exercises `migrations/0001_*.sql` on a fresh
// database on every run.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
