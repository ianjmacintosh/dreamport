import Stripe from "stripe";

/**
 * The Stripe API version every request is pinned to (#229's spike): v2
 * requests are refused without one, and older versions answer v2 with
 * "preview feature".
 */
export const STRIPE_API_VERSION = "2026-10-28.endive";

/** A Stripe client for the Worker: `fetch` for HTTP, no Node built-ins. */
export function createStripe(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });
}

const cryptoProvider = Stripe.createSubtleCryptoProvider();

/**
 * The event in a webhook request, if its `Stripe-Signature` is good for
 * `body` and `secret` and recent; null otherwise. `body` must be the raw
 * text exactly as Stripe sent it.
 */
export async function verifyWebhookEvent(
  body: string,
  signature: string | null,
  secret: string,
): Promise<Stripe.Event | null> {
  if (!signature) return null;
  try {
    return await Stripe.webhooks.constructEventAsync(
      body,
      signature,
      secret,
      undefined,
      cryptoProvider,
    );
  } catch (error) {
    if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
      return null;
    }
    throw error;
  }
}
