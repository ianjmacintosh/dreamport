import { createMiddleware } from "hono/factory";

import type { WorkerEnv } from "./env";

/**
 * Whether the User with this email address is a Guide: their address is on
 * the environment's `GUIDE_EMAILS` list. Temporary until #148's Admin panel
 * replaces the list with a column on the User.
 */
export function isGuide(
  env: Pick<WorkerEnv, "GUIDE_EMAILS">,
  email: string,
): boolean {
  const guides = (env.GUIDE_EMAILS ?? "")
    .split(",")
    .map(normalise)
    .filter(Boolean);
  return guides.includes(normalise(email));
}

function normalise(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * 403 for anyone but a Guide (#191). Runs after a middleware that has set
 * `c.var.guide` from {@link isGuide}.
 */
export const guidesOnly = createMiddleware<{ Variables: { guide: boolean } }>(
  async (c, next) => {
    if (!c.var.guide) {
      return c.json({ error: "Only a Guide can do that." }, 403);
    }
    await next();
  },
);
