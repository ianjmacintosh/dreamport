-- The ledger (issue #231, parent #229): one row per money event in a
-- Guide's account. #231 writes sales; #232 writes withdrawals, so `kind`
-- allows both now and that ticket needs no rebuild.
--
-- A sale row is the Guide's share of one Purchase: +680 cents, the Path
-- and version bought, when it was paid, when it's available to withdraw
-- (paid plus 14 days), and the Stripe ids it came from. `amount` is signed
-- cents: a withdrawal will be negative.
--
-- Unique on the Checkout Session id, so a repeated webhook, or the webhook
-- and the buyer's return to the app at once, record one sale. SQLite counts
-- nulls as distinct, so withdrawals, which have no session, never collide.
--
-- Rows are money records, so neither user link cascades: deleting the
-- buyer's or the Guide's account keeps the row and drops the link. A Guide
-- can't be deleted while they have a balance (#232). `pathId` is no foreign
-- key, as `paths."addedFrom"` isn't (`0027`): the row outlives the Path.
--
-- Re-runnable: nothing here changes an existing table.

create table if not exists "ledger_entries" (
  "id" text not null primary key,
  "kind" text not null check ("kind" in ('sale', 'withdrawal')),
  "guideId" text references "user" ("id") on delete set null,
  "buyerId" text references "user" ("id") on delete set null,
  "pathId" text,
  "number" integer,
  "amount" integer not null,
  "occurredAt" text not null,
  "availableAt" text not null,
  "stripeChargeId" text,
  "stripeTransferId" text,
  "stripeCheckoutSessionId" text unique,
  "createdAt" text not null
);

create index if not exists "ledger_entries_guideId_idx" on "ledger_entries" ("guideId");
