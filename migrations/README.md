# Migrations

Numbered SQL migration files applied to each Cloudflare D1 database with
`wrangler d1 migrations apply`.

`0001_better_auth_core_schema.sql` is Better Auth's core schema (`user`,
`session`, `account`, `verification`), produced once by Better Auth's own
schema generator for `better-auth@1.7.2` and committed. It is frozen: don't
hand-edit it, and don't regenerate it in place. When a `better-auth` upgrade
or an auth-config change alters the schema, add a new numbered migration with
the delta (get the new shape from `npx @better-auth/cli generate` once that
CLI supports the pinned version, or from the upstream changelog).

The `emailOTP` plugin (send & verify sign-in codes) needs no migration of its
own: it stores codes in the existing `verification` table.

Account deletion (`user.deleteUser`, issue #26) needs no migration either: the
confirmation token is a row in the same `verification` table (identifier
`delete-account-<token>`), and completing the deletion only removes rows from
`user` / `session` / `account` — all already in `0001`.

`0002_send_otp_rate_limiting.sql` adds the send-OTP rate limiting (issue #24,
[ADR-0007](../docs/adr/0007-send-otp-rate-limiting.md)): Better Auth's own
`rateLimit` table (the shape its generator emits for `rateLimit.storage:
"database"` — treat it as frozen like `0001`), plus two small dreamport-owned
tables — `otpSendThrottle` (per-email limit) and `otpSendDaily` (global
per-UTC-day send cap) — for the dimensions Better Auth's limiter can't see.

`0003_products.sql` adds the `products` table (issue #88, Products v1 slice
1): a flat list of Products per User, `userId` cascading on delete the same
way `session`/`account` do.

`0004_ideas.sql` adds the `ideas` table (issue #99, Ideas v1 slice 1): a flat
list of Ideas per Product, `productId` cascading on delete the same way
`products.userId` does.

`0005_product_description.sql` adds a nullable `description` column to
`products` (issue #112). Existing rows get `NULL`, the "no description yet"
state.

`0006_idea_tags.sql` adds the Tag catalog (issue #113): a `tags` table keyed
by the Tag's own name, seeded with the six starter Tags, plus an `idea_tags`
join table cascading off `ideas` on delete.

`0007_journeys.sql` adds Journeys (issue #137): the `paths` and
`milestones` catalog, seeded with the one starter Path and its seven
Milestones, plus a `journeys` table (one row per Product per Path, holding
its current Milestone) cascading off `products` on delete.

`0008_dream_sequence.sql` renames that Path from "Starter Path" to "Dream
Sequence" (issue #137).

`0009_milestone_outcome.sql` adds each Milestone's `outcome` column (issue
#137), and `0010_milestone_outcome_seed.sql` seeds it for the seven Dream
Sequence Milestones — split so the seed half is re-runnable on its own.

`0011_drop_path_methodology.sql` drops `paths.methodology` (issue #137):
nothing reads it now the Journey page doesn't show it.

`0012_journey_finished_at.sql` adds `journeys.finishedAt` (issue #138), set
when a Journey advances past its last Milestone.

`0013_worksheets.sql` adds Worksheets (issue #139): the `worksheets`,
`worksheet_fields` and `milestone_worksheets` catalog, plus
`worksheet_instances` (one filled-in copy per Product per Path, at most one
for a singleton Worksheet) and `worksheet_answers`, cascading off
`products` on delete. `0014_product_summary_seed.sql` seeds the Product
Summary on Milestones 1-4 — split so the seed half is re-runnable.

`0015_milestone_done_when_copy.sql` edits the Milestones' "done when"
lines (issue #139): the Rough One-Pager's is reworded, and every line ends
with a full stop. `0016_milestone_copy_edits.sql` swaps "one-pager" for
"Product Summary" in the three "done when" lines that named it, and fixes
grammar and punctuation in the descriptions.

## Conventions

- Files are named `NNNN_short_description.sql`, zero-padded, applied in order
  (`0001_...`, `0002_...`).
- Migrations are committed and reviewed like any other schema change. Every
  environment's database converges to the same shape by replaying the same
  files.
- D1 has no transactions (see `docs/adr/0002-better-auth-over-homegrown.md`).
  A migration that does multi-statement data changes can partially apply —
  keep each migration small and, where possible, individually re-runnable.

## Applying them

See [`docs/deployment.md`](../docs/deployment.md) for the per-environment
procedure and its ordering relative to a deploy. In short: `npm run
migrate:staging`, verify, then `npm run migrate:production`.
