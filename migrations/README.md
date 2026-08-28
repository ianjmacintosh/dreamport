# Migrations

Numbered SQL migration files applied to each Cloudflare D1 database with
`wrangler d1 migrations apply`.

This directory is intentionally empty for now. Issue #19 only establishes the
environment and D1 skeleton; the first migration — Better Auth's generated
schema (`user`, `session`, `account`, `verification`, `rateLimit`) — is added
in issue #20.

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
