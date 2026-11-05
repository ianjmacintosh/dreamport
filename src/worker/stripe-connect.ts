import type Stripe from "stripe";

/**
 * Where a Guide's Stripe account stands (#230). `not-started`: they've
 * never clicked Connect. `incomplete`: they have an account but left
 * onboarding before Stripe could pay it. `ready`: Stripe can send money to
 * the account and pay it out.
 */
export type ConnectStatus = "not-started" | "incomplete" | "ready";

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

  const account = await stripe.v2.core.accounts.retrieve(accountId, {
    include: ["configuration.recipient"],
  });
  const balance =
    account.configuration?.recipient?.capabilities?.stripe_balance;
  return balance?.stripe_transfers?.status === "active" &&
    balance.payouts?.status === "active"
    ? "ready"
    : "incomplete";
}

/**
 * A fresh link into Stripe's hosted onboarding for the Guide's account.
 * The first call makes the account; every later one continues it. Links
 * expire within minutes, so each call makes a new one.
 */
export async function onboardingLink(
  stripe: Stripe,
  db: D1Database,
  guide: ConnectingGuide,
  urls: OnboardingUrls,
): Promise<string> {
  const accountId =
    (await findAccountId(db, guide.userId)) ??
    (await createAccount(stripe, db, guide));

  // The money waits in the Guide's account until they Withdraw (#232).
  // Set on every call, so an account whose first call failed after it was
  // made still ends up on manual payouts.
  await stripe.accounts.update(accountId, {
    settings: { payouts: { schedule: { interval: "manual" } } },
  });

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
 * The link for an account the Guide already has, or null if they have
 * none. For Stripe's `refresh_url`, which must not make an account.
 */
export async function continueOnboardingLink(
  stripe: Stripe,
  db: D1Database,
  guide: ConnectingGuide,
  urls: OnboardingUrls,
): Promise<string | null> {
  if (!(await findAccountId(db, guide.userId))) return null;
  return onboardingLink(stripe, db, guide, urls);
}

/**
 * Make the Guide's Accounts v2 account and record it. The idempotency key
 * is the User's, so two clicks at once get the same account from Stripe,
 * not two.
 */
async function createAccount(
  stripe: Stripe,
  db: D1Database,
  guide: ConnectingGuide,
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
    { idempotencyKey: `stripe-account-${guide.userId}` },
  );

  await db
    .prepare(
      'INSERT INTO "stripe_accounts" ("userId", "accountId", "createdAt") VALUES (?, ?, ?) ON CONFLICT ("userId") DO NOTHING',
    )
    .bind(guide.userId, account.id, new Date().toISOString())
    .run();
  return account.id;
}
