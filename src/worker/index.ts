import { Hono } from "hono";

import { createAuth } from "./auth";
import { getMockSender } from "./email/sender";
import type { WorkerEnv } from "./env";
import {
  peekDailySendCap,
  peekOtpSendBudget,
  recordDailySend,
  recordOtpSend,
  resolveDailyCap,
} from "./otp-send-throttle";
import { PRODUCTION_HOST } from "./trusted-origins";
import { verifyTurnstile, type TurnstileVerifier } from "./turnstile";

/**
 * The `action` the `/login` Turnstile widget is rendered with (see
 * `data-action` / `options.action` in `src/routes/_layout/login.tsx`). The
 * gate checks the verified token was minted for this action — but only in
 * environments that also pin `TURNSTILE_HOSTNAMES` (real widget, real
 * domain); test keys don't echo a stable action.
 */
const TURNSTILE_ACTION = "send-otp";

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
   * Where `TURNSTILE_HOSTNAMES` is pinned (production), the token's `action`
   * and `hostname` are checked too; elsewhere (test keys on floating hosts)
   * only `success` is.
   *
   * Once the token passes, three rate limits guard availability on this path
   * (issue #24, ADR-0007): the per-IP limit is Better Auth's own DB-backed
   * limiter (configured in `auth.ts`); the per-email limit and the global
   * daily send cap (the guard for the shared Resend quota) are the
   * `peek`/`record` pairs below, since that limiter never sees the body.
   * None of them closes ADR-0005's verify-path griefing vector — that is
   * issue #46.
   */
  app.post("/api/auth/email-otp/send-verification-otp", async (c) => {
    const secret = c.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      return c.json(
        { error: "Bot check is unavailable. Try again later." },
        503,
      );
    }

    const allowedHostnames = (c.env.TURNSTILE_HOSTNAMES ?? "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    const strict = allowedHostnames.length > 0;

    const ok = await verifyTurnstileToken({
      secret,
      token: c.req.header("x-turnstile-token") ?? null,
      remoteIp: c.req.header("cf-connecting-ip") ?? null,
      expectedAction: strict ? TURNSTILE_ACTION : undefined,
      allowedHostnames,
    });
    if (!ok) {
      return c.json(
        { error: "Bot check failed. Reload the page and try again." },
        403,
      );
    }

    // Fail closed on the production host unless real email delivery is wired
    // up (issue #41). The mock sender records the code and sends nothing, so a
    // production deploy still on `EMAIL_MODE=mock` — the var not yet flipped
    // for #38, or a dashboard override — would take the sign-in and silently
    // swallow every code. Making the send path unavailable keeps that
    // misconfiguration visible (login stays broken) rather than handing out
    // codes nobody receives. Placed after the bot check so a dummy-token
    // probe still gets the gate's verdict (see `scripts/verify-deployment.sh`).
    // Keyed on the request `Host` — the signal `ALLOWED_HOSTS` already
    // resolves the auth `baseURL` from — by exact match: staging and
    // `*-dreamport-staging` preview URLs run this same code on `mock` and must
    // keep working.
    if (
      c.req.header("host") === PRODUCTION_HOST &&
      (c.env.EMAIL_MODE ?? "mock") !== "resend"
    ) {
      return c.json(
        { error: "Sign-in email is temporarily unavailable. Try again later." },
        503,
      );
    }

    const tooManyRequests = (retryAfter: number) =>
      c.json({ error: "Too many requests. Please try again later." }, 429, {
        "Retry-After": String(retryAfter),
      });

    // Global daily cap first — the cheapest check, and the one protecting the
    // shared Resend quota that neither the per-IP nor the per-email limit
    // covers.
    const daily = await peekDailySendCap(
      c.env.DB,
      resolveDailyCap(c.env.SEND_OTP_DAILY_CAP),
    );
    if (!daily.allowed) return tooManyRequests(daily.retryAfter);

    // Per-email throttle (issue #24). Read the address from a *clone* of the
    // request so the original body stream stays intact for Better Auth's
    // handler. Normalise it the way Better Auth does (trim + lowercase) so
    // both limiters key on the same string. A missing or unparseable email is
    // left for the handler to reject (400) — there is nothing to key on.
    let email = "";
    try {
      const body = (await c.req.raw.clone().json()) as { email?: unknown };
      if (typeof body.email === "string") {
        email = body.email.trim().toLowerCase();
      }
    } catch {
      // Malformed JSON — fall through with no email; the handler 400s.
    }

    if (email) {
      const budget = await peekOtpSendBudget(c.env.DB, email);
      if (!budget.allowed) return tooManyRequests(budget.retryAfter);
    }

    const res = await createAuth(c.env).handler(c.req.raw);

    // Count a send only once a code actually went out. A request rejected
    // downstream — Better Auth's per-IP limiter (429), a malformed body
    // (400), a transient 5xx — must not spend the daily quota or the
    // address's budget (a shared NAT could otherwise lock a real user out of
    // the email dimension without ever receiving a code).
    if (res.status === 200) {
      await recordDailySend(c.env.DB);
      if (email) await recordOtpSend(c.env.DB, email);
    }

    return res;
  });

  /**
   * Account-deletion request path (issue #26). Registered before the
   * `/api/auth/*` catch-all so this exact POST is metered against the global
   * daily send cap — the guard for the shared Resend quota — the same way the
   * send-OTP route is. The GET callback that completes the deletion stays on
   * the catch-all: it sends no email.
   *
   * Only the daily cap is checked here, not the per-email budget: the delete
   * target is always the authenticated caller, so there is no third-party
   * address to flood. The per-IP/session dimension is Better Auth's own
   * limiter (`rateLimit.customRules["/delete-user"]` in `auth.ts`).
   *
   * `sendDeleteAccountVerification` runs via Better Auth's
   * `runInBackgroundOrAwait` — the same mechanism as `sendVerificationOTP`,
   * which the Seam 1 suite already proves works in the workers pool.
   */
  app.post("/api/auth/delete-user", async (c) => {
    const daily = await peekDailySendCap(
      c.env.DB,
      resolveDailyCap(c.env.SEND_OTP_DAILY_CAP),
    );
    if (!daily.allowed) {
      return c.json(
        { error: "Too many requests. Please try again later." },
        429,
        { "Retry-After": String(daily.retryAfter) },
      );
    }

    const res = await createAuth(c.env).handler(c.req.raw);

    // Count a send only once Better Auth returns 200 — the same rule the
    // send-OTP route uses. A 401 (no session), 403 (origin/limiter), or 5xx
    // must not spend the day's quota.
    if (res.status === 200) {
      await recordDailySend(c.env.DB);
    }

    return res;
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

    /**
     * Test-only sibling of `/api/test/last-otp`: hand back the full callback
     * URL from the last account-deletion link the mock sender was given for
     * an email, so the Playwright delete spec can `page.goto(url)` instead of
     * reading a real inbox. Behind the same two gates — `import.meta.env.DEV`
     * (dropped from every deployed bundle by `vite build`) and
     * `EMAIL_MODE=mock`.
     */
    app.get("/api/test/last-delete-link", (c) => {
      if ((c.env.EMAIL_MODE ?? "mock") !== "mock") {
        return c.json({ error: "Not found" }, 404);
      }

      const email = c.req.query("email");
      if (!email) {
        return c.json({ error: "email query param is required" }, 400);
      }

      const last = getMockSender()
        .deleteLinksSent.filter((e) => e.to === email)
        .at(-1);
      if (!last) {
        return c.json(
          { error: "no delete link has been sent to that address" },
          404,
        );
      }

      return c.json({ url: last.url });
    });

    /**
     * Test-only: wipe the send-path rate-limit state. Locally there is no
     * `cf-connecting-ip`, so every send-OTP call in a Playwright run shares
     * one 3 / 60s bucket (see the note atop `login.spec.ts`), and that file
     * now issues more than three sign-ins across its specs. The e2e suite
     * calls this in `beforeEach`. Same two gates as the hooks above.
     */
    app.post("/api/test/reset-rate-limits", async (c) => {
      if ((c.env.EMAIL_MODE ?? "mock") !== "mock") {
        return c.json({ error: "Not found" }, 404);
      }

      await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM "rateLimit"'),
        c.env.DB.prepare('DELETE FROM "otpSendThrottle"'),
        c.env.DB.prepare('DELETE FROM "otpSendDaily"'),
      ]);

      return c.json({ ok: true });
    });
  }

  // Any other `/api/*` path is the Worker's to own and currently unhandled.
  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  // Everything else is the static SPA.
  app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

  return app;
}

export default createApp();
