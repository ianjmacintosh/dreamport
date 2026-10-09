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
