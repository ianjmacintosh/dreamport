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
own: it stores codes in the existing `verification` table. The `rateLimit`
table arrives with a later migration, when database-backed rate limiting is
turned on.

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
migrate:stage`, verify, then `npm run migrate:prod`.
