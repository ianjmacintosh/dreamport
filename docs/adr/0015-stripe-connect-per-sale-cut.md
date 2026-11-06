# Users pay for Paths through Dreamport (Stripe Connect), and Dreamport takes a cut per sale

Guides need to paywall their Paths, so a Purchase is processed by Dreamport
through Stripe Connect, not paid to the Guide off-platform. Dreamport earns a
percentage of each sale and charges a Guide nothing otherwise: no subscription.
A Guide is paid out only after the buyer's refund window has elapsed, so a
refund never has to be clawed back from a Guide.

## Considered Options

- **Off-platform payment plus a Guide subscription.** Simpler to build and
  keeps Dreamport out of payments compliance, but a Guide can't paywall a Path
  inside the product, which was the point of the pivot.
- **Per-sale cut plus a subscription.** A second billing system, and a reason
  for a new Guide to say no before they've earned anything.

## Consequences

Dreamport now carries payments compliance, refunds and disputes. Refund
policy belongs to Dreamport, not to each Guide. Disputes are charged to the
Guide's payout. Changing models later means migrating live Guides' billing.

## Amended for PW12 (#229)

The per-sale cut stands. PW12 changes how the money moves, adds a fee, and
drops refunds. The decisions are in #229 and the wiki page
[Money Flow](https://github.com/ianjmacintosh/dreamport/wiki/Money-Flow).

> **Open:** the name of Dreamport's record of each Guide's money events is
> not decided. The candidates are Ledger, Balance and Earnings. This
> section writes it as **[LEDGER TERM]**. Replace every **[LEDGER TERM]**
> once Ian picks one, and add the term to `CONTEXT.md` then.

### Destination charges

A sale is a destination charge, not a separate charge and transfer. The
User's $8.00 Checkout payment sends the Guide's 85% ($6.80) to the Guide's
own Stripe account at the moment of sale. `on_behalf_of` stays unset, so
Dreamport is still merchant of record and the buyer never sees the Guide.
The Guide's account is on manual payouts, so the money waits there until
the Guide makes a Withdrawal in Dreamport.

Dreamport's Stripe account holds only Dreamport's money. It pays out to
Ian's bank on Stripe's automatic daily schedule, so Ian can't withdraw a
Guide's money by mistake.

Dreamport records each sale and each Withdrawal in the **[LEDGER TERM]**,
one row per money event. A Guide's available money is the sum of the
rows that are available, and it mirrors what is in their Stripe account.

### A $3.00 payout fee

This amends "charges a Guide nothing otherwise". Each Withdrawal costs the
Guide a flat $3.00, taken from the amount paid out. It covers the Connect
fees that Stripe charges Dreamport for the payout ($2.00 per Guide in a
month they are paid out, plus 0.25% and 25¢ per payout). There is still no
subscription: a Guide who makes no Withdrawal in a month pays nothing.
Stripe's processing fee on a sale still comes out of Dreamport's 15%.

### All sales are final

There are no change-of-mind refunds. The Buy button and the Checkout page
both say "All sales are final" before the User pays. The 14 days are now a
**holding period**, not a refund window: a sale's money can be withdrawn
14 days after the purchase. The holding period guards against early
disputes and purchases made with stolen cards. The money is in the Guide's
Stripe account at once, and Dreamport enforces the holding period: a
Withdrawal pays out only what the **[LEDGER TERM]** says is available.

A payment that can't be Added is refunded automatically, in full, with the
transfer reversed. For example: a second payment for a version the User
already holds, or a payment that lands after the Path was closed or the
version unpublished. All sales final means no change-of-mind refunds. It
does not mean Dreamport keeps a payment taken by mistake. Dreamport loses
Stripe's fee on these refunds.

### Disputes

This amends "Disputes are charged to the Guide's payout". Dreamport is
merchant of record, so a card dispute is Dreamport's exposure. While the
Guide's money is still in their Stripe account, Dreamport can recover it by
reversing the transfer. After the Guide has withdrawn it, recovery is best
effort, and Dreamport may absorb the loss. This sprint, disputes are
handled by hand and are not recorded in the **[LEDGER TERM]**. Recording
them as a negative row against the Guide is on the live-readiness
checklist (`docs/going-live.md`).

### Considered and not taken

- **Separate charges and transfers**, the plan until Nov 5. Dreamport's
  account would hold every Guide's money until a Withdrawal, and transfer
  it then. Guides' money and Dreamport's would sit in one balance, so Ian
  could withdraw a Guide's money by mistake.
- **Automatic monthly payouts from Stripe**, with no Withdraw in Dreamport.
  Stripe can't take the $3.00 fee or enforce the holding period, and
  Dreamport would lose money on Guides with few sales.
- **Direct charges.** The Guide would be merchant of record, which changes
  this ADR and the rule that buyers never see the Guide.

### Consequences of the amendment

A Guide must finish Stripe onboarding before their Path can be bought,
because their share needs somewhere to go at the moment of sale. Guides
must not be able to pay themselves out from Stripe's Express Dashboard,
which would skip the fee and the holding period, so that feature is turned
off. A Withdrawal must be idempotent, so a retry can't pay out twice. A
goodwill refund made from Stripe's dashboard is not seen by the
**[LEDGER TERM]** and has to be adjusted by hand.
