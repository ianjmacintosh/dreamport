import { Hono, type Context } from "hono";
import Stripe from "stripe";

import { currentSession } from "./auth";
import type { WorkerEnv } from "./env";
import { guidesOnly, isGuide } from "./guides";
import { fulfillCheckout } from "./purchases";
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
  Variables: { user: ConnectingGuide; guide: boolean; stripe: Stripe | null };
};

/**
 * A Guide's Stripe connection (#230), mounted at `/api/stripe/connect`.
 * The app's own calls answer JSON: 401 with no session and 403 for anyone
 * but a Guide. Past the middleware, `c.var.stripe` is null when this
 * environment has no `STRIPE_SECRET_KEY`: selling isn't available there.
 * `/refresh` is a page the browser lands on from Stripe, so it only ever
 * redirects.
 *
 * The origin check on requests that change data is `index.ts`'s.
 */
export const connectRoutes = new Hono<ConnectEnv>();

connectRoutes.use("/", async (c, next) => {
  const session = await currentSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: "Not signed in" }, 401);
  }

  c.set("user", { userId: session.user.id, email: session.user.email });
  c.set("guide", isGuide(c.env, session.user.email));
  const key = c.env.STRIPE_SECRET_KEY;
  c.set("stripe", key ? createStripe(key) : null);
  await next();
});
connectRoutes.use("/", guidesOnly);

/** Where the Guide's account stands, or `unavailable` with no Stripe key. */
connectRoutes.get("/", async (c) => {
  const stripe = c.var.stripe;
  if (!stripe) {
    return c.json({ status: "unavailable" });
  }

  return withStripe(c, async () =>
    c.json({
      status: await connectStatus(stripe, c.env.DB, c.var.user.userId),
    }),
  );
});

/**
 * A fresh link into Stripe's hosted onboarding, making the Guide's account
 * when they have none or Stripe closed theirs. The client sends the Guide
 * to `url`.
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
        c.var.user,
        onboardingUrls(c),
      ),
    }),
  );
});

/**
 * Stripe's `refresh_url`: the browser arrives here when an onboarding link
 * expired or was used. A Guide with an account goes straight on to a fresh
 * link. Everyone else, and everyone when Stripe fails, goes back to the
 * app page, which reads the account's status itself. Changes nothing.
 */
connectRoutes.get("/refresh", async (c) => {
  const session = await currentSession(c.env, c.req.raw);
  const key = c.env.STRIPE_SECRET_KEY;
  if (!session || !key || !isGuide(c.env, session.user.email)) {
    return c.redirect(CONNECT_RETURN_PATH);
  }

  try {
    const url = await continueOnboardingLink(
      createStripe(key),
      c.env.DB,
      session.user.id,
      onboardingUrls(c),
    );
    return c.redirect(url ?? CONNECT_RETURN_PATH);
  } catch (error) {
    logStripeError(error);
    return c.redirect(CONNECT_RETURN_PATH);
  }
});

function onboardingUrls(c: Context): OnboardingUrls {
  const origin = new URL(c.req.url).origin;
  return {
    refreshUrl: `${origin}/api/stripe/connect/refresh`,
    returnUrl: `${origin}${CONNECT_RETURN_PATH}`,
  };
}

export function unavailable(c: Context) {
  return c.json({ error: "Selling isn't available yet." }, 503);
}

/**
 * 502 when Stripe refuses or can't be reached, logging only its type and
 * code under `what`: the feature that called.
 */
export async function withStripe(
  c: Context,
  run: () => Promise<Response>,
  what = "connect",
): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    logStripeError(error, what);
    return c.json({ error: "Stripe didn't answer. Try again." }, 502);
  }
}

/** Logs only a Stripe error's type and code; rethrows anything else. */
function logStripeError(error: unknown, what = "connect") {
  if (!(error instanceof Stripe.errors.StripeError)) throw error;
  console.error(
    `stripe ${what}: failed (${error.type}${error.code ? ` ${error.code}` : ""})`,
  );
}

/**
 * Where Stripe sends events. It sits outside `/api/*`, the routes the
 * app's own pages call, so `index.ts`'s Origin check never applies: Stripe
 * sends no `Origin`, and the signature check below takes its place.
 */
export const STRIPE_WEBHOOK_PATH = "/webhooks/stripe";

/**
 * Stripe's webhook endpoint (#230). Every event's `Stripe-Signature` is
 * checked against `STRIPE_WEBHOOK_SECRET` before anything else: 400 for a
 * bad one, 503 with no secret set. A completed, paid Checkout is fulfilled
 * (#231): the version Added and the sale recorded, or the payment
 * refunded. An async payment method (a bank debit) is paid later, in
 * `async_payment_succeeded`. Every other event is acknowledged and nothing
 * more. 200 once an event is handled or was already handled, so Stripe
 * stops retrying; 500 when Stripe or the database fails, so it retries.
 * Logs the event's id and type and the outcome, never its body or
 * signature.
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
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const key = c.env.STRIPE_SECRET_KEY;
    if (!key) {
      return unavailable(c);
    }
    const sessionId = event.data.object.id;
    try {
      const outcome = await fulfillCheckout(
        createStripe(key),
        c.env.DB,
        sessionId,
      );
      console.log(`stripe webhook: ${event.id} ${sessionId} ${outcome}`);
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError) {
        logStripeError(error, "webhook");
      } else {
        console.error(`stripe webhook: ${event.id} failed`);
      }
      return c.json({ error: "Not handled. Retry." }, 500);
    }
  }
  return c.json({ received: true });
}
