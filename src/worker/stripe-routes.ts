import { Hono, type Context } from "hono";
import Stripe from "stripe";

import { currentSession } from "./auth";
import type { WorkerEnv } from "./env";
import { isGuide } from "./guides";
import { createStripe, verifyWebhookEvent } from "./stripe";
import {
  connectStatus,
  type ConnectingGuide,
  continueOnboardingLink,
  onboardingLink,
  type OnboardingUrls,
} from "./stripe-connect";

/**
 * The app page a Guide comes back to from Stripe's onboarding. Where the
 * Connect button lives is for the PW12 prototype round (#230) to decide;
 * Settings until then.
 */
export const CONNECT_RETURN_PATH = "/app/settings";

type ConnectEnv = {
  Bindings: WorkerEnv;
  Variables: { guide: ConnectingGuide; stripe: Stripe | null };
};

/**
 * A Guide's Stripe connection (#230), mounted at `/api/stripe/connect`.
 * 401 with no session and 403 for anyone but a Guide, as #191's Guide
 * routes do. Past the middleware, `c.var.stripe` is null when this
 * environment has no `STRIPE_SECRET_KEY`: selling isn't available there.
 *
 * The origin check on requests that change data is `index.ts`'s.
 */
export const connectRoutes = new Hono<ConnectEnv>();

connectRoutes.use(async (c, next) => {
  const session = await currentSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: "Not signed in" }, 401);
  }
  if (!isGuide(c.env, session.user.email)) {
    return c.json({ error: "Only a Guide can do that." }, 403);
  }

  c.set("guide", { userId: session.user.id, email: session.user.email });
  const key = c.env.STRIPE_SECRET_KEY;
  c.set("stripe", key ? createStripe(key) : null);
  await next();
});

/** Where the Guide's account stands, or `unavailable` with no Stripe key. */
connectRoutes.get("/", async (c) => {
  const stripe = c.var.stripe;
  if (!stripe) {
    return c.json({ status: "unavailable" });
  }

  return withStripe(c, async () =>
    c.json({
      status: await connectStatus(stripe, c.env.DB, c.var.guide.userId),
    }),
  );
});

/**
 * A fresh link into Stripe's hosted onboarding, making the Guide's account
 * on the first call. The client sends the Guide to `url`.
 */
connectRoutes.post("/", async (c) => {
  const stripe = c.var.stripe;
  if (!stripe) {
    return unavailable(c);
  }

  return withStripe(c, async () =>
    c.json({
      url: await onboardingLink(
        stripe,
        c.env.DB,
        c.var.guide,
        onboardingUrls(c),
      ),
    }),
  );
});

/**
 * Stripe's `refresh_url`: a link expired or was used, so make a fresh one
 * and send the Guide straight on. A Guide with no account yet goes back to
 * the app instead, since a GET mustn't make one.
 */
connectRoutes.get("/refresh", async (c) => {
  const stripe = c.var.stripe;
  if (!stripe) {
    return c.redirect(CONNECT_RETURN_PATH);
  }

  return withStripe(c, async () => {
    const url = await continueOnboardingLink(
      stripe,
      c.env.DB,
      c.var.guide,
      onboardingUrls(c),
    );
    return c.redirect(url ?? CONNECT_RETURN_PATH);
  });
});

function onboardingUrls(c: Context): OnboardingUrls {
  const origin = new URL(c.req.url).origin;
  return {
    refreshUrl: `${origin}/api/stripe/connect/refresh`,
    returnUrl: `${origin}${CONNECT_RETURN_PATH}`,
  };
}

function unavailable(c: Context) {
  return c.json({ error: "Selling isn't available yet." }, 503);
}

/** 502 when Stripe refuses or can't be reached, logging only its type and code. */
async function withStripe(
  c: Context,
  run: () => Promise<Response>,
): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof Stripe.errors.StripeError)) throw error;
    console.error(
      `stripe connect: failed (${error.type}${error.code ? ` ${error.code}` : ""})`,
    );
    return c.json({ error: "Stripe didn't answer. Try again." }, 502);
  }
}

/**
 * Stripe's webhook endpoint (#230). Every event's `Stripe-Signature` is
 * checked against `STRIPE_WEBHOOK_SECRET` before anything else: 400 for a
 * bad one, 503 with no secret set. #231 handles the first event; until
 * then a good event is acknowledged and nothing more. Logs the event's id
 * and type, never its body or signature.
 */
export async function stripeWebhook(
  c: Context<{ Bindings: WorkerEnv }>,
): Promise<Response> {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return c.json({ error: "Webhooks aren't set up." }, 503);
  }

  const event = await verifyWebhookEvent(
    await c.req.text(),
    c.req.header("stripe-signature") ?? null,
    secret,
  );
  if (!event) {
    console.warn("stripe webhook: rejected (bad signature)");
    return c.json({ error: "Bad signature" }, 400);
  }

  console.log(`stripe webhook: received ${event.id} (${event.type})`);
  return c.json({ received: true });
}
