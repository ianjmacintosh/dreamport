import Stripe from "stripe";

import { addVersion, purchasable, saleRecorded } from "./paths";
import { readyAccountId } from "./stripe-connect";

/**
 * Buying a version of a Paid Path (#231). The price is fixed: a User pays
 * $8.00 USD, Dreamport keeps 15%, and the Guide's share is sent to their
 * Stripe account with the charge (a destination charge). The money flow is
 * the wiki's Money Flow page.
 */
export const PRICE_CENTS = 800;
export const GUIDE_SHARE_CENTS = 680;
/** How long a sale waits in the Guide's balance before they can withdraw it. */
const HOLD_DAYS = 14;

export type CheckoutResult =
  | { readonly ok: true; readonly url: string }
  /**
   * `purchasable`'s refusals, plus `guide-not-ready`: the Guide's Stripe
   * account can't be paid right now.
   */
  | {
      readonly ok: false;
      readonly reason:
        | "not-found"
        | "unavailable"
        | "held"
        | "not-paid"
        | "guide-not-ready";
    };

/**
 * A Stripe Checkout Session for the User to buy version `number` of the
 * Path, and the URL to send them to. Stripe sends them back to `returnUrl`
 * with `{CHECKOUT_SESSION_ID}` filled in once they've paid, and to
 * `cancelUrl` if they leave. Dreamport stays merchant of record (no
 * `on_behalf_of`), so the buyer never sees the Guide's details, and the
 * Guide never sees the buyer's email address.
 */
export async function startCheckout(
  stripe: Stripe,
  db: D1Database,
  buyerId: string,
  pathId: string,
  number: number,
  urls: { returnUrl: string; cancelUrl: string },
): Promise<CheckoutResult> {
  const version = await purchasable(db, buyerId, pathId, number);
  if (!version.ok) {
    const { reason } = version;
    return {
      ok: false,
      reason:
        reason === "everyone" || reason === "request" || reason === "paid"
          ? "not-paid"
          : reason,
    };
  }

  const destination = await readyAccountId(stripe, db, version.guideId);
  if (!destination) {
    return { ok: false, reason: "guide-not-ready" };
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: PRICE_CENTS,
          product_data: { name: `${version.name} · Version ${number}` },
        },
      },
    ],
    payment_intent_data: {
      transfer_data: { destination, amount: GUIDE_SHARE_CENTS },
    },
    custom_text: { submit: { message: "All sales are final." } },
    metadata: { userId: buyerId, pathId, number: String(number) },
    success_url: urls.returnUrl,
    cancel_url: urls.cancelUrl,
  });
  if (!session.url) {
    throw new Error(`checkout session ${session.id} has no url`);
  }
  return { ok: true, url: session.url };
}

/**
 * What fulfilling a Checkout Session did. `sold`: the version was Added
 * and the sale recorded. `already`: an earlier call did that, or refunded
 * it. `refunded`: the version couldn't be Added, so the payment was
 * refunded in full and the Guide's share reversed. `unpaid`: not paid
 * yet, so nothing happened. `ignored`: not a Purchase, or not this
 * buyer's.
 */
export type Fulfillment =
  | "sold"
  | "already"
  | "refunded"
  | "unpaid"
  | "ignored";

/**
 * Fulfill a Checkout Session from `startCheckout`: Add its version for its
 * buyer and record the sale, in one batch, or refund it. Called by the
 * webhook and by the buyer's return to the app, in either order or at
 * once: the ledger is unique on the session, so one sale is recorded and
 * the version Added once. `buyerId`, when given, is who must have bought
 * it.
 *
 * A payment that can't be Added is refunded: the buyer already holds the
 * version (they bought it in two tabs), or the Path closed, the version
 * was unpublished or the Path stopped being Paid since Checkout opened.
 */
export async function fulfillCheckout(
  stripe: Stripe,
  db: D1Database,
  sessionId: string,
  buyerId?: string,
): Promise<Fulfillment> {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent.latest_charge"],
  });
  const purchase = purchaseOf(session);
  if (!purchase || (buyerId !== undefined && purchase.buyerId !== buyerId)) {
    return "ignored";
  }
  if (session.payment_status !== "paid") {
    return "unpaid";
  }
  const charge = chargeOf(session);
  if (charge.refunded || (await saleRecorded(db, session.id))) {
    return "already";
  }

  const paidAt = new Date(charge.created * 1000);
  const added = await addVersion(
    db,
    purchase.buyerId,
    purchase.pathId,
    purchase.number,
    {
      via: "purchase",
      sale: {
        checkoutSessionId: session.id,
        chargeId: charge.id,
        transferId:
          typeof charge.transfer === "string"
            ? charge.transfer
            : (charge.transfer?.id ?? null),
        amount: GUIDE_SHARE_CENTS,
        paidAt: paidAt.toISOString(),
        availableAt: new Date(
          paidAt.getTime() + HOLD_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
    },
  );
  if (added.ok && added.added) {
    return "sold";
  }
  if (added.ok && (await saleRecorded(db, session.id))) {
    return "already";
  }

  await refund(stripe, session.id, charge.id);
  return "refunded";
}

/** The buyer, Path and version `startCheckout` put in the metadata. */
function purchaseOf(session: Stripe.Checkout.Session) {
  const { userId, pathId, number } = session.metadata ?? {};
  const parsed = Number(number);
  return userId && pathId && Number.isSafeInteger(parsed) && parsed > 0
    ? { buyerId: userId, pathId, number: parsed }
    : null;
}

function chargeOf(session: Stripe.Checkout.Session): Stripe.Charge {
  const intent = session.payment_intent;
  const charge =
    intent && typeof intent !== "string" ? intent.latest_charge : null;
  if (!charge || typeof charge === "string") {
    throw new Error(`checkout session ${session.id} has no charge`);
  }
  return charge;
}

/**
 * Refund the charge in full, taking the Guide's share back from their
 * account (`reverse_transfer`). Keyed on the session, so a retry is the
 * same refund; one Stripe already refunded is done.
 */
async function refund(stripe: Stripe, sessionId: string, chargeId: string) {
  try {
    await stripe.refunds.create(
      { charge: chargeId, reverse_transfer: true },
      { idempotencyKey: `refund:${sessionId}` },
    );
  } catch (error) {
    if (
      error instanceof Stripe.errors.StripeError &&
      error.code === "charge_already_refunded"
    ) {
      return;
    }
    throw error;
  }
}
