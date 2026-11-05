import Stripe from "stripe";

/**
 * Where a Guide's Stripe account stands (#230). `not-started`: they've
 * never clicked Connect. `incomplete`: they have an account but left
 * onboarding before Stripe could pay it. `ready`: Stripe can send money to
 * the account and pay it out. `gone`: the account Dreamport recorded was
 * closed or deleted on Stripe's side, so the Guide needs a new one.
 */
export type ConnectStatus = "not-started" | "incomplete" | "ready" | "gone";

/** The Guide a Connect call is for. */
export interface ConnectingGuide {
  userId: string;
  email: string;
}

/** Where Stripe sends the Guide back to, as absolute URLs. */
export interface OnboardingUrls {
  /** When the link has expired or been used: should make a fresh one. */
  refreshUrl: string;
  /** When the Guide leaves onboarding, finished or not. */
  returnUrl: string;
}

async function findAccountId(
  db: D1Database,
  userId: string,
): Promise<string | null> {
  const row = await db
    .prepare('SELECT "accountId" FROM "stripe_accounts" WHERE "userId" = ?')
    .bind(userId)
    .first<{ accountId: string }>();
  return row?.accountId ?? null;
}

/** The account, or null when Stripe has deleted or closed it. */
async function liveAccount(
  stripe: Stripe,
  accountId: string,
): Promise<Stripe.V2.Core.Account | null> {
  try {
    const account = await stripe.v2.core.accounts.retrieve(accountId, {
      include: ["configuration.recipient"],
    });
    return account.closed ? null : account;
  } catch (error) {
    if (
      error instanceof Stripe.errors.StripeError &&
      error.statusCode === 404
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * Read from Stripe on every call, not cached: `ready` means the
 * `stripe_transfers` and payouts capabilities are both active.
 */
export async function connectStatus(
  stripe: Stripe,
  db: D1Database,
  userId: string,
): Promise<ConnectStatus> {
  const accountId = await findAccountId(db, userId);
  if (!accountId) return "not-started";

  const account = await liveAccount(stripe, accountId);
  if (!account) return "gone";

  const balance =
    account.configuration?.recipient?.capabilities?.stripe_balance;
  return balance?.stripe_transfers?.status === "active" &&
    balance.payouts?.status === "active"
    ? "ready"
    : "incomplete";
}

/**
 * A fresh link into Stripe's hosted onboarding for the Guide's account.
 * The first call makes the account, and so does the first call after
 * Stripe closed or deleted it; every other call continues it.
 */
export async function onboardingLink(
  stripe: Stripe,
  db: D1Database,
  guide: ConnectingGuide,
  urls: OnboardingUrls,
): Promise<string> {
  const accountId = await findAccountId(db, guide.userId);
  if (!accountId) {
    return linkFor(stripe, await createAccount(stripe, db, guide), urls);
  }

  try {
    return await linkFor(stripe, accountId, urls);
  } catch (error) {
    if (await liveAccount(stripe, accountId)) throw error;
  }
  await db
    .prepare(
      'DELETE FROM "stripe_accounts" WHERE "userId" = ? AND "accountId" = ?',
    )
    .bind(guide.userId, accountId)
    .run();
  return linkFor(
    stripe,
    await createAccount(stripe, db, guide, accountId),
    urls,
  );
}

/**
 * The link for an account the Guide already has, or null if they have
 * none. For Stripe's `refresh_url`, which must not make an account.
 */
export async function continueOnboardingLink(
  stripe: Stripe,
  db: D1Database,
  userId: string,
  urls: OnboardingUrls,
): Promise<string | null> {
  const accountId = await findAccountId(db, userId);
  return accountId && linkFor(stripe, accountId, urls);
}

/** Links expire within minutes, so every call makes a new one. */
async function linkFor(
  stripe: Stripe,
  accountId: string,
  urls: OnboardingUrls,
): Promise<string> {
  const link = await stripe.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        refresh_url: urls.refreshUrl,
        return_url: urls.returnUrl,
      },
    },
  });
  return link.url;
}

/**
 * Make the Guide's Accounts v2 account, put it on manual payouts, and
 * record it. The account is recorded last, so a failure partway leaves no
 * row and the next click runs all three steps again. The idempotency key
 * covers everything the request sends, so that retry gets the same account
 * back from Stripe, not a second one. `replacing` is the closed or deleted
 * account this one stands in for, which gives the new account its own key.
 */
async function createAccount(
  stripe: Stripe,
  db: D1Database,
  guide: ConnectingGuide,
  replacing?: string,
): Promise<string> {
  const account = await stripe.v2.core.accounts.create(
    {
      contact_email: guide.email,
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
    },
    {
      idempotencyKey: [
        "stripe-account",
        guide.userId,
        guide.email,
        replacing ?? "first",
      ].join(":"),
    },
  );

  // The money waits in the Guide's account until they Withdraw (#232).
  await stripe.accounts.update(account.id, {
    settings: { payouts: { schedule: { interval: "manual" } } },
  });

  await db
    .prepare(
      'INSERT INTO "stripe_accounts" ("userId", "accountId", "createdAt") VALUES (?, ?, ?) ON CONFLICT ("userId") DO NOTHING',
    )
    .bind(guide.userId, account.id, new Date().toISOString())
    .run();
  return account.id;
}
