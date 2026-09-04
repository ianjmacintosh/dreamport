import { Hono } from "hono";

import { createAuth } from "./auth";
import type { WorkerEnv } from "./env";

/**
 * The Dreamport Worker.
 *
 * `wrangler.jsonc` sets `assets.run_worker_first: true`, so every request
 * arrives here. The Worker owns `/api/*`; everything else it forwards to the
 * static asset layer (`env.ASSETS`) untouched, so the SPA and its
 * `not_found_handling: single-page-application` behaviour are exactly as
 * they were before this Worker existed.
 *
 * Better Auth is mounted at `/api/auth/*`, rebuilt per request by
 * {@link createAuth}.
 */
const app = new Hono<{ Bindings: WorkerEnv }>();

app.all("/api/auth/*", (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

/**
 * Session check for the `/app` page. Verifies the caller's session against
 * the database on its own — the client-side route guard is a UX affordance,
 * never the security boundary — and echoes just the signed-in email.
 * 401 with no valid session.
 */
app.get("/api/me", async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    return c.json({ error: "Not signed in" }, 401);
  }

  return c.json({ email: session.user.email });
});

// Any other `/api/*` path is the Worker's to own and currently unhandled.
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

// Everything else is the static SPA.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
