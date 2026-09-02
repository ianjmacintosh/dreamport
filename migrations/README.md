# Migrations

Numbered SQL migration files applied to each Cloudflare D1 database with
`wrangler d1 migrations apply`.

`0001_better_auth_core_schema.sql` is Better Auth's generated core schema
(`user`, `session`, `account`, `verification`). It is produced by
`scripts/generate-auth-schema.mjs` (which drives Better Auth's own migration
builder from the `createAuth` config) — regenerate it, don't hand-edit it,
whenever `better-auth` is upgraded or the auth config changes shape.

The `rateLimit` table arrives with a later migration, when database-backed
rate limiting is turned on.

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
