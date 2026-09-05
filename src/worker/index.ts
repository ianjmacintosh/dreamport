import { Hono } from "hono";

import { createAuth } from "./auth";
import { getMockSender } from "./email/sender";
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

/**
 * Test-only: hand back the last code the mock sender was given for an email —
 * the browser's equivalent of reading it off the dev console, so the
 * Playwright specs never touch a real inbox.
 *
 * Two independent gates, because leaking a valid sign-in code for an
 * arbitrary address is account takeover:
 *
 * 1. `import.meta.env.DEV` is statically `true` only under `vite dev` (local
 *    `npm run dev`, the Playwright webServer) and the vitest pool. `vite
 *    build` replaces it with `false`, so this route is dropped from the
 *    staging and production bundles entirely and can never be served there —
 *    even though every deployed environment currently runs `EMAIL_MODE=mock`.
 * 2. `EMAIL_MODE` (unset ⇒ mock, matching `createEmailSender`) keeps it inert
 *    in a dev server wired to a real sender.
 *
 * The mock sender is one shared instance per isolate, so this reads exactly
 * what `/api/auth/*` just generated.
 */
if (import.meta.env.DEV) {
  app.get("/api/test/last-otp", (c) => {
    if ((c.env.EMAIL_MODE ?? "mock") !== "mock") {
      return c.json({ error: "Not found" }, 404);
    }

    const email = c.req.query("email");
    if (!email) {
      return c.json({ error: "email query param is required" }, 400);
    }

    const last = getMockSender()
      .sent.filter((e) => e.to === email)
      .at(-1);
    if (!last) {
      return c.json({ error: "no code has been sent to that address" }, 404);
    }

    return c.json({ otp: last.otp });
  });
}

// Any other `/api/*` path is the Worker's to own and currently unhandled.
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

// Everything else is the static SPA.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
