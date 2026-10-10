import { Hono } from "hono";

import { createAuth, currentSession } from "./auth";
import { getMockSender } from "./email/sender";
import type { WorkerEnv } from "./env";
import {
  peekDailySendCap,
  peekOtpSendBudget,
  recordDailySend,
  recordOtpSend,
  resolveDailyCap,
} from "./otp-send-throttle";
import {
  CURRENT_ENVIRONMENT_HOSTS,
  IS_PRODUCTION_ENVIRONMENT,
  isTrustedRequestOrigin,
  matchesHostPattern,
  PRODUCTION_HOST,
} from "./trusted-origins";
import {
  createProduct,
  listProducts,
  PRODUCT_NAME_MAX_LENGTH,
} from "./products";
import { productRoutes } from "./product-routes";
import { pathRoutes } from "./path-routes";
import {
  createPath,
  listPaths,
  parsePathFields,
  PATHS_PER_USER,
} from "./paths";
import { listTags } from "./tags";
import { isRateLimitExempt } from "./rate-limit-exemption";
import { verifyTurnstile, type TurnstileVerifier } from "./turnstile";

/**
 * The `action` the `/login` Turnstile widget is rendered with (see
 * `data-action` / `options.action` in `src/routes/_withFooter/login.tsx`). The
 * gate checks the verified token was minted for this action — but only in
 * environments running the real widget (`IS_PRODUCTION_ENVIRONMENT`); test
 * keys don't echo a stable action.
 */
const TURNSTILE_ACTION = "send-otp";

/**
 * Overrides for {@link createApp}. `verifyTurnstile` lets the Seam 1 tests
 * drive the send-OTP gate with a stub instead of a live call to Cloudflare's
 * `siteverify` endpoint (mirrors `AuthDeps.emailSender`). `turnstileHosts`
 * and `isProductionEnvironment` default to `CURRENT_ENVIRONMENT_HOSTS` and
 * `IS_PRODUCTION_ENVIRONMENT` (this build's own resolved shape) — overriding
 * them lets a test exercise another environment's shape (e.g. production's
 * strict hostname match, or staging's non-empty-but-lenient one, #69) without
 * a separate build per environment. The Worker itself never passes any of
 * these.
 */
export interface AppDeps {
  verifyTurnstile?: TurnstileVerifier;
  turnstileHosts?: readonly string[];
  isProductionEnvironment?: boolean;
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
  const turnstileHosts = deps.turnstileHosts ?? CURRENT_ENVIRONMENT_HOSTS;
  const turnstileStrict =
    deps.isProductionEnvironment ?? IS_PRODUCTION_ENVIRONMENT;
  const app = new Hono<{ Bindings: WorkerEnv }>();

  /**
   * Origin check on every request that changes data (#154). Routes under
   * `/api/auth/*` are Better Auth's, which checks origin itself; everything
   * else under `/api/*` is Dreamport's own and gets none of that for free,
   * so it gets the same self-trust-or-TRUSTED_ORIGINS check here — see
   * `isTrustedRequestOrigin`. GET and HEAD pass: browsers leave `Origin`
   * off same-origin reads, and they change nothing.
   */
  app.use("/api/*", async (c, next) => {
    if (
      c.req.method !== "GET" &&
      c.req.method !== "HEAD" &&
      !c.req.path.startsWith("/api/auth/") &&
      !isTrustedRequestOrigin(
        c.req.header("origin") ?? null,
        c.req.header("host") ?? "",
      )
    ) {
      return c.json({ error: "Invalid origin" }, 403);
    }
    await next();
  });

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
   * In production, the token's `action` and `hostname` are checked too
   * (`hostname` against this build's own `CURRENT_ENVIRONMENT_HOSTS`,
   * wildcard-aware and case-insensitive — #68/#69); elsewhere (staging,
   * local — Cloudflare's test-key pair) only `success` is.
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

    const ok = await verifyTurnstileToken({
      secret,
      token: c.req.header("x-turnstile-token") ?? null,
      remoteIp: c.req.header("cf-connecting-ip") ?? null,
      expectedAction: turnstileStrict ? TURNSTILE_ACTION : undefined,
      allowedHostnames: turnstileStrict ? turnstileHosts : [],
    });
    if (!ok) {
      return c.json(
        { error: "Bot check failed. Reload the page and try again." },
        403,
      );
    }

    // Fail closed on the production host unless real email delivery is wired
    // up (issue #41). The mock sender records the code and sends nothing, so a
    // production deploy with no `RESEND_API_KEY` — not yet set for #38, or a
    // dashboard override removing it — would take the sign-in and silently
    // swallow every code. Making the send path unavailable keeps that
    // misconfiguration visible (login stays broken) rather than handing out
    // codes nobody receives. Placed after the bot check so a dummy-token
    // probe still gets the gate's verdict (see `scripts/verify-deployment.sh`).
    // Keyed on the request `Host` — the signal `ALLOWED_HOSTS` already
    // resolves the auth `baseURL` from — by case-insensitive exact match
    // (host names are case-insensitive per RFC 9110, #60): staging and
    // `*-dreamport-staging` preview URLs run this same code with no
    // `RESEND_API_KEY` and must keep working.
    if (
      matchesHostPattern(c.req.header("host") ?? "", PRODUCTION_HOST) &&
      !c.env.RESEND_API_KEY
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
      resolveDailyCap(c.env.SEND_OTP_DAILY_CAP, c.env.RESEND_API_KEY),
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

    // The e2e-exempt IP skips this limit the same way it skips Better Auth's
    // per-IP one (see `isRateLimitExempt`).
    if (email && !isRateLimitExempt(c.req.raw.headers)) {
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
      resolveDailyCap(c.env.SEND_OTP_DAILY_CAP, c.env.RESEND_API_KEY),
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
    const session = await currentSession(c.env, c.req.raw);

    if (!session) {
      return c.json({ error: "Not signed in" }, 401);
    }

    return c.json({ email: session.user.email });
  });

  /**
   * Products v1 slice 1 (issue #88): a signed-in User's own flat list.
   * Session-gated the same way `/api/me` is — verified against the database
   * here, not trusted from the client — and every query is scoped to
   * `session.user.id`, so a User can only ever see or create their own rows.
   */
  app.get("/api/products", async (c) => {
    const session = await currentSession(c.env, c.req.raw);
    if (!session) {
      return c.json({ error: "Not signed in" }, 401);
    }

    const products = await listProducts(c.env.DB, session.user.id);
    return c.json({ products });
  });

  app.post("/api/products", async (c) => {
    const session = await currentSession(c.env, c.req.raw);
    if (!session) {
      return c.json({ error: "Not signed in" }, 401);
    }

    const body = await c.req.json().catch(() => null);
    const name =
      body && typeof body === "object" && typeof body.name === "string"
        ? body.name.trim()
        : "";
    if (!name) {
      return c.json({ error: "name is required" }, 400);
    }
    if (name.length > PRODUCT_NAME_MAX_LENGTH) {
      return c.json(
        {
          error: `name must be ${PRODUCT_NAME_MAX_LENGTH} characters or fewer`,
        },
        400,
      );
    }

    const product = await createProduct(c.env.DB, session.user.id, name);
    return c.json({ product }, 201);
  });

  // Every route about one Product: session and ownership checked once,
  // in front of them all — see `product-routes.ts`.
  app.route("/api/products/:productId", productRoutes);

  /** Trailblazer (#167): the signed-in User's own Paths, oldest first. */
  app.get("/api/paths", async (c) => {
    const session = await currentSession(c.env, c.req.raw);
    if (!session) {
      return c.json({ error: "Not signed in" }, 401);
    }

    return c.json({ paths: await listPaths(c.env.DB, session.user.id) });
  });

  /** Make a Path with an empty Draft. 409 once the User has the most. */
  app.post("/api/paths", async (c) => {
    const session = await currentSession(c.env, c.req.raw);
    if (!session) {
      return c.json({ error: "Not signed in" }, 401);
    }

    const fields = parsePathFields(await c.req.json().catch(() => null));
    if (!fields.ok) {
      return c.json({ error: fields.error }, 400);
    }

    const created = await createPath(c.env.DB, session.user.id, fields.value);
    if (!created.ok) {
      return c.json(
        { error: `You can have up to ${PATHS_PER_USER} Paths.` },
        409,
      );
    }

    return c.json({ path: created.path }, 201);
  });

  // Every route about one Path: session and ownership checked once, in
  // front of them all. See `path-routes.ts`.
  app.route("/api/paths/:pathId", pathRoutes);

  /**
   * Issue #113: the fixed Tag catalog. No session needed — it's the same
   * Dreamport-curated list for everyone, nothing private in it.
   */
  app.get("/api/tags", async (c) => {
    return c.json({ tags: await listTags(c.env.DB) });
  });

  /**
   * Test-only: hand back the full callback URL from the last account-
   * deletion link the mock sender was given for an email, so the Playwright
   * delete spec can `page.goto(url)` instead of reading a real inbox.
   *
   * The `/api/test/last-otp` route this used to sit beside is gone (#39):
   * every login spec now signs in through the `+e2e-test@` fixed-code
   * marker (see `auth.ts` `generateOTP`) instead of reading a code back
   * through a hook. This route has no such alternative — Better Auth 1.7.2
   * hardcodes the deletion callback token's generation (`update-user.mjs`),
   * with no `generateOTP`-equivalent hook to make it predictable for a
   * marker address, so there's nothing to swap it for (the same
   * "no matching hook" situation `docs/adr/0009` documents for session
   * tokens, which is also a fixed Better Auth internal with no exposed
   * override).
   *
   * Two independent gates, because leaking a valid deletion link for an
   * arbitrary address is account takeover:
   *
   * 1. `import.meta.env.DEV` is statically `true` only under `vite dev`
   *    (local `npm run dev`, the Playwright webServer) and the vitest pool.
   *    `vite build` replaces it with `false`, so this route is dropped from
   *    the staging and production bundles entirely and can never be served
   *    there — even though staging currently has no `RESEND_API_KEY` either.
   * 2. `RESEND_API_KEY` presence (absent ⇒ mock, matching `createEmailSender`)
   *    keeps it inert in a dev server wired to a real sender.
   */
  if (import.meta.env.DEV) {
    app.get("/api/test/last-delete-link", (c) => {
      if (c.env.RESEND_API_KEY) {
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
  }

  // Any other `/api/*` path is the Worker's to own and currently unhandled.
  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  // Everything else is the static SPA.
  app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

  return app;
}

export default createApp();
