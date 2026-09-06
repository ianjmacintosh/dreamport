import { Hono } from "hono";

import { createAuth } from "./auth";
import { getMockSender } from "./email/sender";
import type { WorkerEnv } from "./env";
import { verifyTurnstile, type TurnstileVerifier } from "./turnstile";

/**
 * Overrides for {@link createApp}. `verifyTurnstile` lets the Seam 1 tests
 * drive the send-OTP gate with a stub instead of a live call to Cloudflare's
 * `siteverify` endpoint (mirrors `AuthDeps.emailSender`). The Worker itself
 * never passes this.
 */
export interface AppDeps {
  verifyTurnstile?: TurnstileVerifier;
}

/**
 * Build the Dreamport Worker.
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
export function createApp(deps: AppDeps = {}) {
  const verifyTurnstileToken = deps.verifyTurnstile ?? verifyTurnstile;
  const app = new Hono<{ Bindings: WorkerEnv }>();

  /**
   * Bot deterrence on the code-send path (issue #23). Registered before the
   * `/api/auth/*` catch-all so Hono matches it first for this exact POST; the
   * catch-all still owns GET on this path and every other auth route.
   *
   * A Cloudflare Turnstile token rides in the `x-turnstile-token` header —
   * not the JSON body, which is a single-use stream left untouched here so
   * Better Auth can read it. A missing or invalid token is rejected now,
   * before `createAuth().handler` runs, so no code is issued and the email
   * sender is never called. The gate fails closed: with no
   * `TURNSTILE_SECRET_KEY` the send path is unavailable rather than
   * unguarded.
   *
   * This is half of ADR-0005's mitigation (Turnstile on send); the per-IP
   * and per-identifier rate rule on the verify path is #24.
   */
  app.post("/api/auth/email-otp/send-verification-otp", async (c) => {
    const secret = c.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      return c.json(
        { error: "Bot check is unavailable. Try again later." },
        503,
      );
    }

    const ok = await verifyTurnstileToken({
      secret,
      token: c.req.header("x-turnstile-token") ?? null,
      remoteIp: c.req.header("cf-connecting-ip") ?? null,
    });
    if (!ok) {
      return c.json(
        { error: "Bot check failed. Reload the page and try again." },
        403,
      );
    }

    return createAuth(c.env).handler(c.req.raw);
  });

  app.all("/api/auth/*", (c) => {
    const auth = createAuth(c.env);
    return auth.handler(c.req.raw);
  });

  /**
   * Session check for the `/app` page. Verifies the caller's session against
   * the database on its own — the client-side route guard is a UX
   * affordance, never the security boundary — and echoes just the signed-in
   * email. 401 with no valid session.
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
   * Test-only: hand back the last code the mock sender was given for an
   * email — the browser's equivalent of reading it off the dev console, so
   * the Playwright specs never touch a real inbox.
   *
   * Two independent gates, because leaking a valid sign-in code for an
   * arbitrary address is account takeover:
   *
   * 1. `import.meta.env.DEV` is statically `true` only under `vite dev`
   *    (local `npm run dev`, the Playwright webServer) and the vitest pool.
   *    `vite build` replaces it with `false`, so this route is dropped from
   *    the staging and production bundles entirely and can never be served
   *    there — even though every deployed environment currently runs
   *    `EMAIL_MODE=mock`.
   * 2. `EMAIL_MODE` (unset ⇒ mock, matching `createEmailSender`) keeps it
   *    inert in a dev server wired to a real sender.
   *
   * The mock sender is one shared instance per isolate, so this reads
   * exactly what `/api/auth/*` just generated.
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

  return app;
}

export default createApp();
