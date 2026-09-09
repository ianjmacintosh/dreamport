-- Rate limiting on the send-OTP path (issue #24).
--
-- Three tables, one per dimension of the same control
-- (see docs/adr/0007-send-otp-rate-limiting.md):
--
--   "rateLimit"        Better Auth's own DB-backed limiter, keyed on client
--                      IP + path. Shape produced by better-auth@1.7.2 with
--                      `rateLimit.storage: "database"` (id, unique key, count,
--                      lastRequest-in-ms) — see migrations/README.md. Better
--                      Auth owns every row here; dreamport code never writes
--                      to it, so an upgrade that reshapes it stays isolated.
--
--   "otpSendThrottle"  dreamport's per-target-email limiter. Better Auth's
--                      limiter keys on IP + path only and never reads the
--                      request body, so the per-email dimension is owned code
--                      at the send-OTP choke point (src/worker/index.ts).
--                      Fixed window: one row per normalised address, reset
--                      when the window elapses.
--
--   "otpSendDaily"     dreamport's global daily send cap — the guard for the
--                      shared Resend quota, which neither a per-IP nor a
--                      per-email limit protects (an attacker sprays one code
--                      each across many addresses). One row per UTC day,
--                      counting every code actually sent app-wide.
--
-- One CREATE per statement; D1 has no transactions (ADR-0002), so a
-- multi-statement migration can partially apply. All three are plain CREATE
-- TABLE, individually re-runnable on a fresh database.

create table "rateLimit" ("id" text not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" integer not null);

create table "otpSendThrottle" ("email" text not null primary key, "count" integer not null, "windowStart" integer not null);

create table "otpSendDaily" ("day" text not null primary key, "count" integer not null);
