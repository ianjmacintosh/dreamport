import { env } from "cloudflare:workers";
import { http, HttpResponse } from "msw";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TEST_EMAILS } from "../../test/emails";
import { network } from "../../test/msw-network";
import { getMockSender } from "./email/sender";
import { createApp } from "./index";
import { STRIPE_API_VERSION } from "./stripe";
import { CONNECT_RETURN_PATH, STRIPE_WEBHOOK_PATH } from "./stripe-routes";

/**
 * Stripe Connect and the webhook endpoint (#230), through the Worker's
 * routes. Every call to Stripe is answered by MSW; a call no test expected
 * is answered 400 and fails the test, so nothing here reaches Stripe.
 */

const ORIGIN = "https://dreamport.test";
const STRIPE = "https://api.stripe.com";
const ACCOUNT_ID = "acct_test_guide";
const LINK_URL = `https://connect.stripe.com/setup/e/${ACCOUNT_ID}/link`;
const WEBHOOK_SECRET = "whsec_test_stub";

const app = createApp({ verifyTurnstile: async () => true });

function fetchWorker(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("host", new URL(ORIGIN).host);
  headers.set("cf-connecting-ip", "203.0.113.30");
  return app.fetch(new Request(`${ORIGIN}${path}`, { ...init, headers }), env);
}

function callApi(method: string, path: string, cookie?: string) {
  return fetchWorker(path, {
    method,
    redirect: "manual",
    headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) },
  });
}

async function signIn(email: string): Promise<string> {
  const json = { "content-type": "application/json" };
  await fetchWorker("/api/auth/email-otp/send-verification-otp", {
    method: "POST",
    headers: { ...json, "x-turnstile-token": "token" },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  const otp = getMockSender()
    .sent.filter((e) => e.to === email)
    .at(-1)?.otp;
  const res = await fetchWorker("/api/auth/sign-in/email-otp", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ email, otp }),
  });
  expect(res.status).toBe(200);
  const cookie = res.headers
    .getSetCookie()
    .find((c) => c.includes("better-auth.session_token="));
  if (!cookie) throw new Error("no session cookie");
  return cookie.split(";")[0];
}

async function userId(email: string): Promise<string> {
  const row = await env.DB.prepare('SELECT "id" FROM "user" WHERE email = ?')
    .bind(email)
    .first<{ id: string }>();
  if (!row) throw new Error(`no user ${email}`);
  return row.id;
}

function storedAccounts() {
  return env.DB.prepare(
    'SELECT "userId", "accountId" FROM "stripe_accounts"',
  ).all<{ userId: string; accountId: string }>();
}

/** Every request made to Stripe, as the stub saw it. */
interface StripeCall {
  method: string;
  path: string;
  headers: Headers;
  body: string;
}

let calls: StripeCall[];
let unexpected: string[];

/**
 * Stub Stripe's Connect endpoints. `capabilities` is what a later
 * retrieve of the account says about `stripe_transfers` and payouts.
 */
function stubStripe(
  capabilities: { stripe_transfers: string; payouts: string } = {
    stripe_transfers: "pending",
    payouts: "pending",
  },
) {
  const record = async (
    request: Pick<Request, "method" | "url" | "headers" | "text">,
  ) => {
    calls.push({
      method: request.method,
      path: new URL(request.url).pathname,
      headers: request.headers,
      body: await request.text(),
    });
  };
  network.use(
    http.post(`${STRIPE}/v2/core/accounts`, async ({ request }) => {
      await record(request);
      return HttpResponse.json({ id: ACCOUNT_ID, object: "v2.core.account" });
    }),
    http.get(`${STRIPE}/v2/core/accounts/:id`, async ({ request, params }) => {
      await record(request);
      return HttpResponse.json({
        id: params.id,
        object: "v2.core.account",
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: {
                stripe_transfers: {
                  status: capabilities.stripe_transfers,
                  status_details: [],
                },
                payouts: { status: capabilities.payouts, status_details: [] },
              },
            },
          },
        },
      });
    }),
    http.post(`${STRIPE}/v1/accounts/:id`, async ({ request, params }) => {
      await record(request);
      return HttpResponse.json({ id: params.id, object: "account" });
    }),
    http.post(`${STRIPE}/v2/core/account_links`, async ({ request }) => {
      await record(request);
      return HttpResponse.json({
        object: "v2.core.account_link",
        account: ACCOUNT_ID,
        url: LINK_URL,
        expires_at: new Date(Date.now() + 300_000).toISOString(),
      });
    }),
  );
}

const callsTo = (method: string, path: string) =>
  calls.filter((call) => call.method === method && call.path === path);

beforeEach(async () => {
  getMockSender().clear();
  await env.DB.prepare('DELETE FROM "rateLimit"').run();
  await env.DB.prepare('DELETE FROM "otpSendThrottle"').run();
  await env.DB.prepare('DELETE FROM "otpSendDaily"').run();
  // Storage is isolated per file, not per test.
  await env.DB.prepare('DELETE FROM "stripe_accounts"').run();
  env.STRIPE_SECRET_KEY = "sk_test_stub";
  calls = [];
  unexpected = [];
  // Registered first, so every specific stub takes priority over it.
  network.use(
    http.all(`${STRIPE}/*`, ({ request }) => {
      unexpected.push(`${request.method} ${new URL(request.url).pathname}`);
      return HttpResponse.json(
        { error: { type: "invalid_request_error" } },
        {
          status: 400,
        },
      );
    }),
  );
});

afterEach(() => {
  delete env.STRIPE_SECRET_KEY;
  delete env.STRIPE_WEBHOOK_SECRET;
  expect(unexpected).toEqual([]);
});

describe("Stripe Connect for a Guide", () => {
  it("makes one Express recipient account on manual payouts and sends the Guide to onboarding", async () => {
    stubStripe();
    const cookie = await signIn(TEST_EMAILS.guide);

    const res = await callApi("POST", "/api/stripe/connect", cookie);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: LINK_URL });

    const [create] = callsTo("POST", "/v2/core/accounts");
    expect(create.headers.get("stripe-version")).toBe(STRIPE_API_VERSION);
    expect(JSON.parse(create.body)).toEqual({
      contact_email: TEST_EMAILS.guide,
      dashboard: "express",
      identity: { country: "us" },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: { stripe_transfers: { requested: true } },
          },
        },
      },
      defaults: {
        currency: "usd",
        responsibilities: {
          fees_collector: "application",
          losses_collector: "application",
        },
      },
    });

    const [payouts] = callsTo("POST", `/v1/accounts/${ACCOUNT_ID}`);
    expect(
      new URLSearchParams(payouts.body).get(
        "settings[payouts][schedule][interval]",
      ),
    ).toBe("manual");

    const [link] = callsTo("POST", "/v2/core/account_links");
    expect(JSON.parse(link.body)).toEqual({
      account: ACCOUNT_ID,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          refresh_url: `${ORIGIN}/api/stripe/connect/refresh`,
          return_url: `${ORIGIN}${CONNECT_RETURN_PATH}`,
        },
      },
    });

    expect((await storedAccounts()).results).toEqual([
      { userId: await userId(TEST_EMAILS.guide), accountId: ACCOUNT_ID },
    ]);
  });

  it("continues the same account on a second click, with a fresh link and nothing else", async () => {
    stubStripe();
    const cookie = await signIn(TEST_EMAILS.guide);

    await callApi("POST", "/api/stripe/connect", cookie);
    const again = await callApi("POST", "/api/stripe/connect", cookie);

    expect(again.status).toBe(200);
    expect(callsTo("POST", "/v2/core/accounts")).toHaveLength(1);
    expect(callsTo("POST", `/v1/accounts/${ACCOUNT_ID}`)).toHaveLength(1);
    expect(callsTo("POST", "/v2/core/account_links")).toHaveLength(2);
    expect((await storedAccounts()).results).toHaveLength(1);
  });

  it("says the account is gone when Stripe deleted it, and makes a new one on the next click", async () => {
    stubStripe();
    const cookie = await signIn(TEST_EMAILS.guide);
    await callApi("POST", "/api/stripe/connect", cookie);
    const gone = { error: { type: "invalid_request_error" } };
    const NEW_ACCOUNT_ID = "acct_test_replacement";
    network.use(
      http.get(`${STRIPE}/v2/core/accounts/${ACCOUNT_ID}`, () =>
        HttpResponse.json(gone, { status: 404 }),
      ),
      http.post(`${STRIPE}/v2/core/account_links`, async ({ request }) => {
        const { account } = (await request.clone().json()) as {
          account: string;
        };
        return account === ACCOUNT_ID
          ? HttpResponse.json(gone, { status: 404 })
          : undefined;
      }),
      http.post(`${STRIPE}/v2/core/accounts`, async ({ request }) => {
        calls.push({
          method: "POST",
          path: "/v2/core/accounts",
          headers: request.headers,
          body: await request.text(),
        });
        return HttpResponse.json({
          id: NEW_ACCOUNT_ID,
          object: "v2.core.account",
        });
      }),
    );

    const status = await callApi("GET", "/api/stripe/connect", cookie);
    expect(await status.json()).toEqual({ status: "gone" });

    const connect = await callApi("POST", "/api/stripe/connect", cookie);
    expect(connect.status).toBe(200);
    const [first, replacement] = callsTo("POST", "/v2/core/accounts");
    expect(replacement.headers.get("idempotency-key")).not.toBe(
      first.headers.get("idempotency-key"),
    );
    expect(callsTo("POST", `/v1/accounts/${NEW_ACCOUNT_ID}`)).toHaveLength(1);
    expect((await storedAccounts()).results).toEqual([
      { userId: await userId(TEST_EMAILS.guide), accountId: NEW_ACCOUNT_ID },
    ]);
  });

  it("sends the same idempotency key on every attempt to make the account", async () => {
    stubStripe();
    const cookie = await signIn(TEST_EMAILS.guide);
    await callApi("POST", "/api/stripe/connect", cookie);
    // As if the first attempt had made the account but not recorded it.
    await env.DB.prepare('DELETE FROM "stripe_accounts"').run();
    await callApi("POST", "/api/stripe/connect", cookie);

    const keys = callsTo("POST", "/v2/core/accounts").map((call) =>
      call.headers.get("idempotency-key"),
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });

  it("says the account isn't started, then incomplete, then ready, reading Stripe each time", async () => {
    const cookie = await signIn(TEST_EMAILS.guide);
    const status = async () =>
      (await (await callApi("GET", "/api/stripe/connect", cookie)).json()) as {
        status: string;
      };

    expect(await status()).toEqual({ status: "not-started" });

    stubStripe({ stripe_transfers: "active", payouts: "pending" });
    await callApi("POST", "/api/stripe/connect", cookie);
    expect(await status()).toEqual({ status: "incomplete" });

    stubStripe({ stripe_transfers: "active", payouts: "active" });
    expect(await status()).toEqual({ status: "ready" });
    expect(callsTo("GET", `/v2/core/accounts/${ACCOUNT_ID}`)).toHaveLength(2);
  });

  it("answers Stripe's refresh_url with a fresh link for the same account, changing nothing", async () => {
    stubStripe();
    const cookie = await signIn(TEST_EMAILS.guide);
    await callApi("POST", "/api/stripe/connect", cookie);
    calls = [];

    const res = await callApi("GET", "/api/stripe/connect/refresh", cookie);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(LINK_URL);
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "POST /v2/core/account_links",
    ]);
  });

  it("sends the Guide back to the app from refresh_url when Stripe fails", async () => {
    stubStripe();
    const cookie = await signIn(TEST_EMAILS.guide);
    await callApi("POST", "/api/stripe/connect", cookie);
    network.use(
      http.post(`${STRIPE}/v2/core/account_links`, () =>
        HttpResponse.json({ error: { type: "api_error" } }, { status: 500 }),
      ),
    );

    const res = await callApi("GET", "/api/stripe/connect/refresh", cookie);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(CONNECT_RETURN_PATH);
  });

  it("sends a Guide with no account back to the app from refresh_url, making none", async () => {
    stubStripe();
    const cookie = await signIn(TEST_EMAILS.guide);

    const res = await callApi("GET", "/api/stripe/connect/refresh", cookie);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(CONNECT_RETURN_PATH);
    expect(calls).toEqual([]);
  });

  it("answers 502 when Stripe refuses, recording no account", async () => {
    // No stub: the catch-all answers 400.
    const cookie = await signIn(TEST_EMAILS.guide);

    const res = await callApi("POST", "/api/stripe/connect", cookie);

    expect(res.status).toBe(502);
    expect((await storedAccounts()).results).toEqual([]);
    unexpected = [];
  });

  it("drops the Guide's account row when their User is deleted", async () => {
    stubStripe();
    const cookie = await signIn(TEST_EMAILS.guide);
    await callApi("POST", "/api/stripe/connect", cookie);

    await env.DB.prepare('DELETE FROM "user" WHERE id = ?')
      .bind(await userId(TEST_EMAILS.guide))
      .run();

    expect((await storedAccounts()).results).toEqual([]);
  });
});

describe("Stripe Connect for anyone else", () => {
  it("refuses a plain User with 403, sends them back to the app from refresh_url, and calls Stripe for none", async () => {
    stubStripe();
    const cookie = await signIn(TEST_EMAILS.stripeNotGuide);

    for (const method of ["GET", "POST"]) {
      const res = await callApi(method, "/api/stripe/connect", cookie);
      expect(res.status, method).toBe(403);
      expect(await res.json()).toEqual({ error: "Only a Guide can do that." });
    }
    const refresh = await callApi("GET", "/api/stripe/connect/refresh", cookie);
    expect(refresh.headers.get("location")).toBe(CONNECT_RETURN_PATH);
    expect(calls).toEqual([]);
  });

  it("answers 401 with no session, and sends the browser back to the app from refresh_url", async () => {
    const res = await callApi("GET", "/api/stripe/connect");
    expect(res.status).toBe(401);

    const refresh = await callApi("GET", "/api/stripe/connect/refresh");
    expect(refresh.status).toBe(302);
    expect(refresh.headers.get("location")).toBe(CONNECT_RETURN_PATH);
  });
});

describe("with no STRIPE_SECRET_KEY", () => {
  it("tells a Guide selling is unavailable, and calls Stripe for nothing", async () => {
    delete env.STRIPE_SECRET_KEY;
    const cookie = await signIn(TEST_EMAILS.guide);

    const status = await callApi("GET", "/api/stripe/connect", cookie);
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ status: "unavailable" });

    const connect = await callApi("POST", "/api/stripe/connect", cookie);
    expect(connect.status).toBe(503);

    const refresh = await callApi("GET", "/api/stripe/connect/refresh", cookie);
    expect(refresh.headers.get("location")).toBe(CONNECT_RETURN_PATH);

    expect(calls).toEqual([]);
  });
});

describe("Stripe's webhook", () => {
  const payload = JSON.stringify({
    id: "evt_test_1",
    object: "event",
    type: "account.updated",
    data: { object: {} },
  });

  function sign(body: string, secret: string) {
    return Stripe.webhooks.generateTestHeaderStringAsync({
      payload: body,
      secret,
      cryptoProvider: Stripe.createSubtleCryptoProvider(),
    });
  }

  /** As Stripe sends it: no Origin, no cookie. */
  function deliver(body: string, signature?: string) {
    return fetchWorker(STRIPE_WEBHOOK_PATH, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(signature ? { "stripe-signature": signature } : {}),
      },
      body,
    });
  }

  it("accepts an event signed with the endpoint's secret", async () => {
    env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

    const res = await deliver(payload, await sign(payload, WEBHOOK_SECRET));

    expect(res.status).toBe(200);
  });

  it("rejects an event signed with another secret, a changed body, or no signature", async () => {
    env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    const good = await sign(payload, WEBHOOK_SECRET);

    const wrongSecret = await deliver(
      payload,
      await sign(payload, "whsec_someone_else"),
    );
    const changedBody = await deliver(
      payload.replace("account.updated", "checkout.session.completed"),
      good,
    );
    const unsigned = await deliver(payload);

    expect(wrongSecret.status).toBe(400);
    expect(changedBody.status).toBe(400);
    expect(unsigned.status).toBe(400);
  });

  it("refuses every event when no webhook secret is set", async () => {
    const res = await deliver(payload, await sign(payload, WEBHOOK_SECRET));
    expect(res.status).toBe(503);
  });
});
