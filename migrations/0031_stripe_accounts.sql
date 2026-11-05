-- A Guide's Stripe account (issue #230, parent #229): one row per Guide
-- who has started Stripe's hosted onboarding, holding the id of the
-- Accounts v2 account Dreamport made for them. Whether the account is
-- ready to be paid is read from Stripe each time, not kept here.
--
-- `userId` cascades, as `products.userId` does: deleting the User takes
-- the row. The account itself stays on Stripe.
--
-- Re-runnable: nothing here changes an existing table.

create table if not exists "stripe_accounts" (
  "userId" text not null primary key references "user" ("id") on delete cascade,
  "accountId" text not null unique,
  "createdAt" text not null
);
