import { env } from "cloudflare:workers";
import { http, HttpResponse } from "msw";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TEST_EMAILS } from "../../test/emails";
import { network } from "../../test/msw-network";
import { getMockSender } from "./email/sender";
import { createApp } from "./index";
import { STRIPE_WEBHOOK_PATH } from "./stripe-routes";

/**
 * Paid Paths (#231), through the Worker's routes: Paid as an Access, Buy,
 * and the Checkout webhook with its refund path. Every call to Stripe is
 * answered by MSW; a call no test expected is answered 400 and fails the
 * test, so nothing here reaches Stripe. Webhooks are signed with the SDK's
 * `generateTestHeaderStringAsync`.
 */

const ORIGIN = "https://dreamport.test";
const STRIPE = "https://api.stripe.com";
const GUIDE_ACCOUNT = "acct_test_paid_guide";
const WEBHOOK_SECRET = "whsec_test_paid";
const CHECKOUT_URL = "https://checkout.stripe.com/c/pay/cs_test_stub";
/** When the stubbed charges were paid: 2027-01-15T08:00:00Z. */
const PAID_AT = 1_800_000_000;

const app = createApp({ verifyTurnstile: async () => true });

function fetchWorker(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("host", new URL(ORIGIN).host);
  headers.set("cf-connecting-ip", "203.0.113.31");
  return app.fetch(new Request(`${ORIGIN}${path}`, { ...init, headers }), env);
}

function callApi(method: string, path: string, cookie: string, body?: unknown) {
  return fetchWorker(path, {
    method,
    headers: {
      origin: ORIGIN,
      cookie,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
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

/** Save the Guide's Draft as a new version, publish it, and answer its number. */
async function publishNewVersion(cookie: string, pathId: string) {
  const saved = await callApi("POST", `/api/paths/${pathId}/versions`, cookie);
  expect(saved.status).toBe(201);
  const { version } = (await saved.json()) as { version: { number: number } };
  await callApi(
    "PUT",
    `/api/paths/${pathId}/versions/${version.number}/published`,
    cookie,
  );
  return version.number;
}

/**
 * The Guide's Path with one Milestone, version 1 published and open, and
 * the Guide's Stripe account on record. `access` is set last, so Paid
 * needs `stubStripe` first.
 */
async function guidesPath(access: "everyone" | "request" | "paid" = "paid") {
  const cookie = await signIn(TEST_EMAILS.guide);
  const created = await callApi("POST", "/api/paths", cookie, {
    name: "Pop-Up Shop Launch",
    description: "Kitchen table to market stall.",
  });
  const { path } = (await created.json()) as { path: { id: string } };
  const update = await callApi("PATCH", `/api/paths/${path.id}`, cookie, {
    name: "Pop-Up Shop Launch",
    description: "Kitchen table to market stall.",
    milestones: [
      {
        name: "Pick Your Market",
        description: "Find a market.",
        doneWhen: "A stall is booked.",
        outcome: "",
      },
    ],
  });
  expect(update.status).toBe(200);
  await publishNewVersion(cookie, path.id);
  expect(
    (await callApi("PUT", `/api/paths/${path.id}/open`, cookie)).status,
  ).toBe(200);
  await env.DB.prepare(
    'INSERT INTO "stripe_accounts" ("userId", "accountId", "createdAt") VALUES (?, ?, ?)',
  )
    .bind(
      await userId(TEST_EMAILS.guide),
      GUIDE_ACCOUNT,
      new Date().toISOString(),
    )
    .run();
  if (access !== "everyone") {
    const set = await callApi("PUT", `/api/paths/${path.id}/access`, cookie, {
      access,
    });
    expect(set.status).toBe(200);
  }
  return { cookie, pathId: path.id };
}

interface StripeCall {
  method: string;
  path: string;
  headers: Headers;
  body: string;
}

let calls: StripeCall[];
let unexpected: string[];
/** The Checkout Sessions the stub has made, by id, as a retrieve answers them. */
let sessions: Map<string, Record<string, unknown>>;
let refunded: Set<string>;

const callsTo = (method: string, path: string) =>
  calls.filter((call) => call.method === method && call.path === path);

/**
 * Stub the Stripe calls a Purchase makes. `ready` is whether the Guide's
 * account can be paid. Each Checkout Session made is paid at once, with
 * its own charge and transfer, as if the buyer had finished Checkout.
 */
function stubStripe({ ready = true }: { ready?: boolean } = {}) {
  /** Record the call, and answer its body. */
  const record = async (
    request: Pick<Request, "method" | "url" | "headers" | "text">,
  ) => {
    const body = await request.text();
    calls.push({
      method: request.method,
      path: new URL(request.url).pathname,
      headers: request.headers,
      body,
    });
    return body;
  };
  const status = ready ? "active" : "pending";
  network.use(
    http.get(`${STRIPE}/v2/core/accounts/:id`, async ({ request, params }) => {
      await record(request);
      return HttpResponse.json({
        id: params.id,
        object: "v2.core.account",
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: {
                stripe_transfers: { status, status_details: [] },
                payouts: { status, status_details: [] },
              },
            },
          },
        },
      });
    }),
    http.post(`${STRIPE}/v1/checkout/sessions`, async ({ request }) => {
      const form = new URLSearchParams(await record(request));
      const n = sessions.size + 1;
      const id = `cs_test_${n}`;
      const session = {
        id,
        object: "checkout.session",
        url: `${CHECKOUT_URL}${n}`,
        payment_status: "paid",
        metadata: {
          userId: form.get("metadata[userId]"),
          pathId: form.get("metadata[pathId]"),
          number: form.get("metadata[number]"),
        },
        payment_intent: {
          id: `pi_test_${n}`,
          object: "payment_intent",
          latest_charge: {
            id: `ch_test_${n}`,
            object: "charge",
            created: PAID_AT,
            transfer: `tr_test_${n}`,
            refunded: false,
          },
        },
      };
      sessions.set(id, session);
      return HttpResponse.json(session);
    }),
    http.get(
      `${STRIPE}/v1/checkout/sessions/:id`,
      async ({ request, params }) => {
        await record(request);
        const session = sessions.get(String(params.id));
        if (!session) {
          return HttpResponse.json(
            { error: { type: "invalid_request_error" } },
            { status: 404 },
          );
        }
        const intent = session.payment_intent as {
          latest_charge: { id: string };
        };
        return HttpResponse.json({
          ...session,
          payment_intent: {
            ...intent,
            latest_charge: {
              ...intent.latest_charge,
              refunded: refunded.has(intent.latest_charge.id),
            },
          },
        });
      },
    ),
    http.post(`${STRIPE}/v1/refunds`, async ({ request }) => {
      const charge = new URLSearchParams(await record(request)).get("charge");
      if (charge) refunded.add(charge);
      return HttpResponse.json({ id: "re_test", object: "refund", charge });
    }),
  );
}

function buy(cookie: string, pathId: string, number: number | string) {
  return callApi("POST", `/api/paths/${pathId}/versions/${number}/buy`, cookie);
}

/** Buy version `number` and answer the Checkout Session the stub made. */
async function checkout(cookie: string, pathId: string, number = 1) {
  const res = await buy(cookie, pathId, number);
  expect(res.status).toBe(200);
  return `cs_test_${sessions.size}`;
}

function signedEvent(sessionId: string, type = "checkout.session.completed") {
  const payload = JSON.stringify({
    id: `evt_${sessionId}`,
    object: "event",
    type,
    data: { object: { id: sessionId, object: "checkout.session" } },
  });
  return Stripe.webhooks
    .generateTestHeaderStringAsync({
      payload,
      secret: WEBHOOK_SECRET,
      cryptoProvider: Stripe.createSubtleCryptoProvider(),
    })
    .then((signature) => ({ payload, signature }));
}

/** Deliver the webhook for a completed Checkout, as Stripe sends it. */
async function deliver(sessionId: string) {
  const { payload, signature } = await signedEvent(sessionId);
  return fetchWorker(STRIPE_WEBHOOK_PATH, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
    body: payload,
  });
}

function sales() {
  return env.DB.prepare(
    `SELECT "kind", "guideId", "buyerId", "pathId", "number", "amount", "occurredAt",
       "availableAt", "stripeChargeId", "stripeTransferId", "stripeCheckoutSessionId"
     FROM "ledger_entries" ORDER BY "createdAt"`,
  ).all();
}

/** The version numbers the User holds a copy of, oldest first. */
async function heldVersions(email: string, pathId: string) {
  const { results } = await env.DB.prepare(
    `SELECT "path_versions"."number" FROM "paths"
     JOIN "path_versions" ON "path_versions"."pathId" = "paths"."id"
     WHERE "paths"."userId" = ? AND "paths"."addedFrom" = ?
     ORDER BY "path_versions"."number"`,
  )
    .bind(await userId(email), pathId)
    .all<{ number: number }>();
  return results.map((r) => r.number);
}

async function trailhead(cookie: string, pathId: string, version?: number) {
  const query = version === undefined ? "" : `?version=${version}`;
  const res = await callApi(
    "GET",
    `/api/paths/${pathId}/trailhead${query}`,
    cookie,
  );
  return (await res.json()) as Record<string, unknown> & {
    status: string;
    version: { id: string; number: number };
  };
}

beforeEach(async () => {
  getMockSender().clear();
  await env.DB.prepare('DELETE FROM "rateLimit"').run();
  await env.DB.prepare('DELETE FROM "otpSendThrottle"').run();
  await env.DB.prepare('DELETE FROM "otpSendDaily"').run();
  // Storage is isolated per file, not per test.
  await env.DB.prepare('DELETE FROM "stripe_accounts"').run();
  await env.DB.prepare('DELETE FROM "ledger_entries"').run();
  env.STRIPE_SECRET_KEY = "sk_test_stub";
  env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  calls = [];
  unexpected = [];
  sessions = new Map();
  refunded = new Set();
  network.use(
    http.all(`${STRIPE}/*`, ({ request }) => {
      unexpected.push(`${request.method} ${new URL(request.url).pathname}`);
      return HttpResponse.json(
        { error: { type: "invalid_request_error" } },
        { status: 400 },
      );
    }),
  );
});

afterEach(() => {
  delete env.STRIPE_SECRET_KEY;
  delete env.STRIPE_WEBHOOK_SECRET;
  expect(unexpected).toEqual([]);
});

describe("Paid as an Access", () => {
  it("lets a Guide whose Stripe account is ready set Paid, and refuses one whose isn't", async () => {
    stubStripe({ ready: false });
    const guide = await guidesPath("everyone");
    const setPaid = () =>
      callApi("PUT", `/api/paths/${guide.pathId}/access`, guide.cookie, {
        access: "paid",
      });

    const refused = await setPaid();
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({
      error: "Your Stripe account isn't ready to be paid yet.",
    });

    stubStripe({ ready: true });
    const set = await setPaid();
    expect(set.status).toBe(200);
    expect(await set.json()).toEqual({
      access: "paid",
      approved: 0,
      denied: 0,
    });
  });

  it("refuses Paid with 503 when this environment has no Stripe key", async () => {
    const guide = await guidesPath("everyone");
    delete env.STRIPE_SECRET_KEY;
    const res = await callApi(
      "PUT",
      `/api/paths/${guide.pathId}/access`,
      guide.cookie,
      {
        access: "paid",
      },
    );
    expect(res.status).toBe(503);
  });

  it("Denies a By Request Path's pending Requests when it becomes Paid, and says how many", async () => {
    stubStripe();
    const guide = await guidesPath("request");
    const user = await signIn(TEST_EMAILS.purchaseOther);
    expect(
      (
        await callApi(
          "POST",
          `/api/paths/${guide.pathId}/versions/1/request`,
          user,
        )
      ).status,
    ).toBe(201);

    const set = await callApi(
      "PUT",
      `/api/paths/${guide.pathId}/access`,
      guide.cookie,
      {
        access: "paid",
      },
    );
    expect(await set.json()).toEqual({
      access: "paid",
      approved: 0,
      denied: 1,
    });
    expect(await trailhead(user, guide.pathId)).toMatchObject({
      status: "offered",
      access: "paid",
      requested: false,
    });
  });

  it("gives a Paid Path's Trailhead its price, and refuses Add and Request through the API", async () => {
    stubStripe();
    const guide = await guidesPath();
    const user = await signIn(TEST_EMAILS.purchaseBuyer);

    expect(await trailhead(user, guide.pathId)).toMatchObject({
      status: "offered",
      access: "paid",
      priceCents: 800,
      held: [],
    });

    const add = await callApi(
      "POST",
      `/api/paths/${guide.pathId}/versions/1/add`,
      user,
    );
    expect(add.status).toBe(409);
    expect(await add.json()).toEqual({
      error: `Could not add path Pop-Up Shop Launch (version 1) because it must be purchased before adding`,
    });
    const request = await callApi(
      "POST",
      `/api/paths/${guide.pathId}/versions/1/request`,
      user,
    );
    expect(request.status).toBe(409);
    expect(await request.json()).toEqual({
      error: "This Path is Paid. Buy it instead.",
    });
    expect(await heldVersions(TEST_EMAILS.purchaseBuyer, guide.pathId)).toEqual(
      [],
    );
  });
});

describe("Buy", () => {
  it("makes a Checkout Session for $8.00 with the Guide's $6.80 as a destination charge", async () => {
    stubStripe();
    const guide = await guidesPath();
    const user = await signIn(TEST_EMAILS.purchaseBuyer);

    const res = await buy(user, guide.pathId, 1);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: `${CHECKOUT_URL}1` });
    const [create] = callsTo("POST", "/v1/checkout/sessions");
    const form = Object.fromEntries(new URLSearchParams(create.body));
    const trailheadUrl = `${ORIGIN}/app/paths/${guide.pathId}?version=1`;
    expect(form).toEqual({
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": "800",
      "line_items[0][price_data][product_data][name]":
        "Pop-Up Shop Launch · Version 1",
      "payment_intent_data[transfer_data][destination]": GUIDE_ACCOUNT,
      "payment_intent_data[transfer_data][amount]": "680",
      "custom_text[submit][message]": "All sales are final.",
      "metadata[userId]": await userId(TEST_EMAILS.purchaseBuyer),
      "metadata[pathId]": guide.pathId,
      "metadata[number]": "1",
      success_url: `${trailheadUrl}&checkout={CHECKOUT_SESSION_ID}`,
      cancel_url: trailheadUrl,
    });
  });

  it("refuses with 409 a Guide whose account isn't ready, a closed Path, a Path that isn't Paid and a version held; 404 as Add", async () => {
    stubStripe();
    const guide = await guidesPath();
    const user = await signIn(TEST_EMAILS.purchaseBuyer);

    expect((await buy(user, guide.pathId, 2)).status).toBe(404);
    expect((await buy(user, guide.pathId, "one")).status).toBe(404);
    expect((await buy(guide.cookie, guide.pathId, 1)).status).toBe(404);
    expect((await buy(user, "dream-sequence", 1)).status).toBe(404);

    stubStripe({ ready: false });
    expect((await buy(user, guide.pathId, 1)).status).toBe(409);

    stubStripe();
    await deliver(await checkout(user, guide.pathId));
    const held = await buy(user, guide.pathId, 1);
    expect(held.status).toBe(409);
    expect(await held.json()).toEqual({
      error: "You already have this version.",
    });

    const other = await signIn(TEST_EMAILS.purchaseOther);
    await callApi("PUT", `/api/paths/${guide.pathId}/access`, guide.cookie, {
      access: "everyone",
    });
    expect((await buy(other, guide.pathId, 1)).status).toBe(409);
    await callApi("PUT", `/api/paths/${guide.pathId}/access`, guide.cookie, {
      access: "paid",
    });
    await callApi("DELETE", `/api/paths/${guide.pathId}/open`, guide.cookie);
    expect((await buy(other, guide.pathId, 1)).status).toBe(409);
    expect(callsTo("POST", "/v1/checkout/sessions")).toHaveLength(1);
  });
});

describe("the Checkout webhook", () => {
  it("Adds the version for the buyer, who can start a Journey on it, and records the Guide's $6.80 available 14 days later", async () => {
    stubStripe();
    const guide = await guidesPath();
    const user = await signIn(TEST_EMAILS.purchaseBuyer);
    const sessionId = await checkout(user, guide.pathId);

    const res = await deliver(sessionId);

    expect(res.status).toBe(200);
    const shown = await trailhead(user, guide.pathId);
    expect(shown).toMatchObject({ status: "followable", access: "paid" });
    expect((await sales()).results).toEqual([
      {
        kind: "sale",
        guideId: await userId(TEST_EMAILS.guide),
        buyerId: await userId(TEST_EMAILS.purchaseBuyer),
        pathId: guide.pathId,
        number: 1,
        amount: 680,
        occurredAt: "2027-01-15T08:00:00.000Z",
        availableAt: "2027-01-29T08:00:00.000Z",
        stripeChargeId: "ch_test_1",
        stripeTransferId: "tr_test_1",
        stripeCheckoutSessionId: sessionId,
      },
    ]);

    const created = await callApi("POST", "/api/products", user, {
      name: "Tote Bags",
    });
    const { product } = (await created.json()) as { product: { id: string } };
    const started = await callApi(
      "POST",
      `/api/products/${product.id}/journeys`,
      user,
      {
        versionId: shown.version.id,
      },
    );
    expect(started.status).toBe(201);
  });

  it("records one sale and Adds once for the same webhook delivered twice, and for the buyer's return landing too", async () => {
    stubStripe();
    const guide = await guidesPath();
    const user = await signIn(TEST_EMAILS.purchaseBuyer);
    const sessionId = await checkout(user, guide.pathId);

    const results = await Promise.all([
      deliver(sessionId),
      deliver(sessionId),
      callApi("POST", `/api/checkout-sessions/${sessionId}/fulfill`, user),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect((await deliver(sessionId)).status).toBe(200);

    expect((await sales()).results).toHaveLength(1);
    expect(await heldVersions(TEST_EMAILS.purchaseBuyer, guide.pathId)).toEqual(
      [1],
    );
    expect(callsTo("POST", "/v1/refunds")).toEqual([]);
  });

  it("refunds in full, reversing the transfer, a payment for a version the buyer already holds, and records no sale", async () => {
    stubStripe();
    const guide = await guidesPath();
    const user = await signIn(TEST_EMAILS.purchaseBuyer);
    // Buy in two tabs: both Checkouts open before either is paid.
    const first = await checkout(user, guide.pathId);
    const second = await checkout(user, guide.pathId);

    expect((await deliver(first)).status).toBe(200);
    expect((await deliver(second)).status).toBe(200);
    expect((await deliver(second)).status).toBe(200);

    const refunds = callsTo("POST", "/v1/refunds");
    expect(refunds).toHaveLength(1);
    expect(Object.fromEntries(new URLSearchParams(refunds[0].body))).toEqual({
      charge: "ch_test_2",
      reverse_transfer: "true",
    });
    expect(refunds[0].headers.get("idempotency-key")).toBe(`refund:${second}`);
    expect(
      ((await sales()).results as { stripeCheckoutSessionId: string }[]).map(
        (s) => s.stripeCheckoutSessionId,
      ),
    ).toEqual([first]);
    expect(await heldVersions(TEST_EMAILS.purchaseBuyer, guide.pathId)).toEqual(
      [1],
    );
  });

  it("refunds a payment that lands after the Path was closed, and Adds nothing", async () => {
    stubStripe();
    const guide = await guidesPath();
    const user = await signIn(TEST_EMAILS.purchaseBuyer);
    const sessionId = await checkout(user, guide.pathId);
    await callApi("DELETE", `/api/paths/${guide.pathId}/open`, guide.cookie);

    expect((await deliver(sessionId)).status).toBe(200);

    expect(callsTo("POST", "/v1/refunds")).toHaveLength(1);
    expect((await sales()).results).toEqual([]);
    expect(await heldVersions(TEST_EMAILS.purchaseBuyer, guide.pathId)).toEqual(
      [],
    );

    // Reopened, a retry of the same event still Adds nothing for free.
    await callApi("PUT", `/api/paths/${guide.pathId}/open`, guide.cookie);
    expect((await deliver(sessionId)).status).toBe(200);
    expect(await heldVersions(TEST_EMAILS.purchaseBuyer, guide.pathId)).toEqual(
      [],
    );
  });

  it("refunds a payment that lands after the Path stopped being Paid", async () => {
    stubStripe();
    const guide = await guidesPath();
    const user = await signIn(TEST_EMAILS.purchaseBuyer);
    const sessionId = await checkout(user, guide.pathId);
    await callApi("PUT", `/api/paths/${guide.pathId}/access`, guide.cookie, {
      access: "everyone",
    });

    expect((await deliver(sessionId)).status).toBe(200);

    expect(callsTo("POST", "/v1/refunds")).toHaveLength(1);
    expect((await sales()).results).toEqual([]);
  });

  it("charges again for Version 2 while the buyer holds Version 1, and keeps Version 1", async () => {
    stubStripe();
    const guide = await guidesPath();
    const user = await signIn(TEST_EMAILS.purchaseBuyer);
    await deliver(await checkout(user, guide.pathId, 1));
    await publishNewVersion(guide.cookie, guide.pathId);

    expect(await trailhead(user, guide.pathId)).toMatchObject({
      status: "offered",
      version: { number: 2 },
      held: [1],
    });
    await deliver(await checkout(user, guide.pathId, 2));

    expect(callsTo("POST", "/v1/checkout/sessions")).toHaveLength(2);
    expect(await heldVersions(TEST_EMAILS.purchaseBuyer, guide.pathId)).toEqual(
      [1, 2],
    );
    expect(
      ((await sales()).results as { number: number }[]).map((s) => s.number),
    ).toEqual([1, 2]);
  });

  it("keeps the sale when the buyer's account is deleted, dropping the link to them", async () => {
    stubStripe();
    const guide = await guidesPath();
    const user = await signIn(TEST_EMAILS.purchaseBuyer);
    await deliver(await checkout(user, guide.pathId));

    await env.DB.prepare('DELETE FROM "user" WHERE "id" = ?')
      .bind(await userId(TEST_EMAILS.purchaseBuyer))
      .run();

    expect((await sales()).results).toMatchObject([
      { buyerId: null, amount: 680, guideId: await userId(TEST_EMAILS.guide) },
    ]);
  });

  it("answers 500 when Stripe fails, so Stripe retries", async () => {
    stubStripe();
    // No Checkout Session by this id: the retrieve answers 404.
    const res = await deliver("cs_test_missing");
    expect(res.status).toBe(500);
    expect((await sales()).results).toEqual([]);
  });
});

describe("the buyer's return from Checkout", () => {
  it("fulfills the buyer's own session, and ignores another User's", async () => {
    stubStripe();
    const guide = await guidesPath();
    const user = await signIn(TEST_EMAILS.purchaseBuyer);
    const other = await signIn(TEST_EMAILS.purchaseOther);
    const sessionId = await checkout(user, guide.pathId);
    const fulfill = (cookie: string) =>
      callApi("POST", `/api/checkout-sessions/${sessionId}/fulfill`, cookie);

    expect(await (await fulfill(other)).json()).toEqual({ outcome: "ignored" });
    expect((await sales()).results).toEqual([]);

    expect(await (await fulfill(user)).json()).toEqual({ outcome: "sold" });
    expect(await (await fulfill(user)).json()).toEqual({ outcome: "already" });
    expect(await heldVersions(TEST_EMAILS.purchaseBuyer, guide.pathId)).toEqual(
      [1],
    );
  });
});

describe("migrations 0032 and 0033", () => {
  it("lets a Path's Access be Paid and nothing unknown, keeping its default", async () => {
    const guide = await guidesPath("everyone");
    const set = (access: string) =>
      env.DB.prepare('UPDATE "paths" SET "access" = ? WHERE "id" = ?')
        .bind(access, guide.pathId)
        .run();

    await set("paid");
    await expect(set("free")).rejects.toThrow(/CHECK/);
    const columns = await env.DB.prepare('PRAGMA table_info("paths")').all<{
      name: string;
      dflt_value: string;
      notnull: number;
    }>();
    expect(columns.results.find((c) => c.name === "access")).toMatchObject({
      dflt_value: "'everyone'",
      notnull: 1,
    });
  });
});
