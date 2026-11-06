# Going live with payments

How to move Dreamport's payments from Stripe test mode to live mode.

**The switch needs no code change.** The code reads its Stripe keys from
Worker secrets, and it pins every request to API version
`2026-10-28.endive` (`src/worker/stripe.ts`), so test and live mode run the
same code. Going live is three things: set up live mode in Stripe, put the
live secrets on the `dreamport` Worker, and finish the live-readiness
checklist below. Do the checklist first. Production keeps selling turned
off until `STRIPE_SECRET_KEY` is set, so nothing is live until the last
step.

The decisions behind this are in #229, the wiki page
[Money Flow](https://github.com/ianjmacintosh/dreamport/wiki/Money-Flow),
and [ADR 0015](adr/0015-stripe-connect-per-sale-cut.md). How the secrets
work in each environment is in [Deployment](deployment.md#stripe-guides-payout-accounts).

## 1. Finish the live-readiness checklist

Live charges wait until every item is done (#229, PW12-Planning wiki page).

- [ ] **Stripe pre-approval** for restricted businesses. Ian requested it
      during PW12.
- [ ] **Terms**, in plain English. Ian writes them.
  - Guide terms: the $3.00 payout fee and the 14-day holding period.
  - Purchase terms: all sales are final, and how disputes are handled.
- [ ] **1099s.** Dreamport files them under platform pricing. Check the
      IRS thresholds before the first live payout.
- [ ] **Money-transmission check.** Guides' money sits in their own Stripe
      accounts, not Dreamport's, which probably helps. Confirm that
      Dreamport doesn't need a money-transmission licence before the first
      live payout.
- [ ] **Disputes in the ledger.** Record a dispute as a negative row
      against the Guide. While the Guide's money is still in their Stripe
      account, Dreamport can recover it by reversing the transfer; after
      that, recovery is best effort (ADR 0015). This is the one item that
      is a code change. It has to land before the switch, through its own
      ticket.
- [ ] **State disclosure law.** Check whether any US state requires more
      than "All sales are final" for no-refund digital sales.
- [ ] **Funds-routing fee.** Stripe's pricing lists "0.25% of payout
      volume" for funds routing and platform management. If it's on top of
      the 0.25% + 25¢ per payout, the $3.00 payout fee covers a Guide's
      first withdrawal of the month up to about $150, not $300. Ask Stripe
      with the pre-approval request, and check the fee on the first test
      payouts.

## 2. Set up live mode in Stripe

In the Stripe dashboard, switched to live mode:

1. **Turn on Connect** for the live account.
2. **Turn off payouts in the Express Dashboard** for connected accounts.
   Otherwise a Guide could pay themselves out from Stripe and skip the
   $3.00 fee and the holding period. The sandbox already has this off
   (`docs/deployment.md`). Check it: a live Guide's Express Dashboard shows
   no payout button.
3. **Leave Dreamport's own payouts on Stripe's automatic daily schedule.**
   Dreamport's balance holds only Dreamport's money, so it pays out to
   Ian's bank without touching anything owed to a Guide. Guides' accounts
   are put on manual payouts by the code, when the account is made.
4. **Add the production webhook endpoint**:
   `https://dreamport.ianjmacintosh.com/webhooks/stripe`.
   - Listen to events on your account, and set the endpoint's API version
     to `2026-10-28.endive`, so live events have the shape the code reads.
   - Select `checkout.session.completed`, the event the code handles
     (#231). If more events are handled by the time you go live, select
     those too: check `stripeWebhook` in `src/worker/stripe-routes.ts`.
   - Copy the endpoint's signing secret (`whsec_...`) for step 3.
   - The PW12-Planning checklist also names a Connect endpoint, for events
     on Guides' accounts. The code doesn't handle any today; it reads a
     Guide's account status from Stripe each time. The Worker reads one
     signing secret, so a second endpoint would be a code change.
5. **Make a restricted key** limited to the APIs the code calls. Give each
   resource below write access, which includes read. Leave everything else
   at none.

   | Resource           | Calls                                                                     | Used for                                                       |
   | ------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
   | Accounts (v2)      | `POST /v2/core/accounts`, `GET /v2/core/accounts/:id`                     | Making a Guide's account and reading whether it's ready (#230) |
   | Account Links (v2) | `POST /v2/core/account_links`                                             | The link into Stripe's hosted onboarding (#230)                |
   | Connected accounts | `POST /v1/accounts/:id`                                                   | Putting a Guide's account on manual payouts (#230)             |
   | Checkout Sessions  | `POST /v1/checkout/sessions`                                              | The $8.00 destination charge (#231)                            |
   | Refunds            | `POST /v1/refunds` with `reverse_transfer`                                | Refunding a payment that can't be Added (#231)                 |
   | Transfers          | `POST /v1/transfers/:id/reversals`                                        | Pulling the $3.00 payout fee back to Dreamport (#232)          |
   | Payouts            | `POST /v1/payouts`, sent as the Guide's account (`Stripe-Account` header) | The Withdrawal to the Guide's bank (#232)                      |

   #230 is merged. #231 and #232 were still open when this page was
   written, so before you make the key, check the calls against the code
   (`src/worker/stripe*.ts`) and add any read access it needs, such as
   reading a Checkout Session or a charge in the webhook. Stripe names
   these permissions in the restricted key form; match them by resource.
   The sandbox keeps its standard, full-access test key.

## 3. Put the live secrets on the `dreamport` Worker

Agents can't run `wrangler secret put`, so these are dashboard steps. On
`dreamport`: Settings → Variables and Secrets → Add, **Type: Secret
(encrypted)**, not a plaintext var:

| Secret                  | Value                                           |
| ----------------------- | ----------------------------------------------- |
| `STRIPE_WEBHOOK_SECRET` | The live endpoint's signing secret (2.4)        |
| `ADMIN_EMAILS`          | Ian's address, for the admin ledger page (#232) |
| `STRIPE_SECRET_KEY`     | The live restricted key (2.5)                   |

Set `STRIPE_SECRET_KEY` last. Its presence is what turns selling on: until
it's set, production offers no Connect or Buy, and Connect answers 503. The secrets take effect on the next deploy of `dreamport`.

## 4. Check it

1. Sign in as a Guide on production and connect a Stripe account through
   the hosted onboarding. Its status should reach ready.
2. Set a Path to Paid and buy it from another account with a real card.
   The version is Added, the ledger shows +$6.80 available in 14
   days, and Stripe shows $6.80 in the Guide's account.
3. Check the admin ledger page against Stripe's dashboard.
4. After the holding period, Withdraw. The Guide's bank receives the
   amount less $3.00, and Dreamport's balance gains $3.00.

To turn selling off again, delete `STRIPE_SECRET_KEY` from `dreamport`.
That is also a no-code change, but it turns off Withdraw too, so Guides
can't reach their money until the key is back.
