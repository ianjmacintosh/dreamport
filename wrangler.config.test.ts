import { describe, expect, test } from "vitest";
import { unstable_readConfig } from "wrangler";

// Issue #19: the deployment skeleton. Every later auth binding and migration
// has to land in a known shape, so this asserts the shape wrangler itself
// resolves for each environment — not the raw JSON text.
const ENVIRONMENTS = ["prod", "stage", "dev"] as const;

/** The `DB` D1 binding wrangler resolves for a named environment, if any. */
function dbBinding(env: string) {
  return unstable_readConfig({ env }).d1_databases.find(
    (binding) => binding.binding === "DB",
  );
}

describe("wrangler.jsonc deployment environments", () => {
  test.each(ENVIRONMENTS)("%s binds its own D1 database as DB", (env) => {
    const db = dbBinding(env);

    expect(db, `env.${env} has a D1 binding named DB`).toBeDefined();
    expect(db?.database_name).toBe(`dreamport-${env}`);
    // A real ID is written by scripts/setup-d1.sh; here we only require that
    // the slot is filled so a deploy can't silently fall back to another env.
    expect(db?.database_id, `env.${env} records a database_id`).toBeTruthy();
  });

  test.each(ENVIRONMENTS)("%s runs the mock email sender", (env) => {
    expect(unstable_readConfig({ env }).vars.EMAIL_MODE).toBe("mock");
  });

  test("the three environments bind three distinct databases", () => {
    const names = ENVIRONMENTS.map((env) => dbBinding(env)?.database_name);

    expect(new Set(names).size).toBe(ENVIRONMENTS.length);
  });
});
