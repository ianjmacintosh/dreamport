import type { WorkerEnv } from "./env";

/**
 * dreamport's per-target-email limiter for the send-OTP path (issue #24).
 *
 * Better Auth's own rate limiter (see `rateLimit` in `auth.ts`) covers the
 * per-IP dimension, but it keys on IP + path and never reads the request
 * body, so it cannot see the target address. This is the other half: a fixed
 * window per normalised email, so one address can't be flooded with sign-in
 * codes from a spread of IPs. Full rationale in
 * `docs/adr/0007-send-otp-rate-limiting.md`.
 *
 * Split into a read ({@link peekOtpSendBudget}) and a write
 * ({@link recordOtpSend}) so the caller only spends an address's budget once
 * a code has actually gone out — a send that Better Auth's per-IP limiter or
 * a transient failure rejects must not count against the address.
 */

/** Fixed window for the per-email limiter. Exported for the Seam 1 tests. */
export const WINDOW_MS = 10 * 60 * 1000;

/** Sends counted for one email within a window before it is throttled. */
const MAX_PER_WINDOW = 5;

export interface ThrottleStatus {
  allowed: boolean;
  /**
   * Whole seconds until the current window resets. Only meaningful when
   * `allowed` is `false`; `0` otherwise.
   */
  retryAfter: number;
}

interface ThrottleRow {
  count: number;
  windowStart: number;
}

/**
 * Report whether `email` still has send budget in the current window,
 * **without** spending any. Call this before handing off to Better Auth; a
 * `false` result should short-circuit with a 429.
 *
 * `email` must already be normalised (trimmed, lower-cased) by the caller —
 * the same normalisation Better Auth applies — so both limiters key on the
 * same string. `now` is injectable for tests; production uses the default.
 */
export async function peekOtpSendBudget(
  db: WorkerEnv["DB"],
  email: string,
  now: number = Date.now(),
): Promise<ThrottleStatus> {
  const row = await db
    .prepare(
      `SELECT "count", "windowStart" FROM "otpSendThrottle" WHERE "email" = ?1`,
    )
    .bind(email)
    .first<ThrottleRow>();

  if (!row) return { allowed: true, retryAfter: 0 };

  const windowActive = now - row.windowStart < WINDOW_MS;
  if (windowActive && row.count >= MAX_PER_WINDOW) {
    const secondsLeft = Math.ceil((row.windowStart + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter: Math.max(secondsLeft, 1) };
  }
  return { allowed: true, retryAfter: 0 };
}

/**
 * Count one *successful* send for `email` against the fixed window.
 *
 * The upsert is a single `INSERT … ON CONFLICT DO UPDATE`, atomic on D1
 * despite the no-transactions constraint (ADR-0002). Every reference in the
 * `DO UPDATE` clause is to the pre-update row, so the window check and the
 * reset see the same `windowStart`. Concurrent successful sends for one
 * address can still overshoot the limit by a request or two before the row
 * locks — acceptable for an availability control.
 *
 * Also opportunistically drops rows whose window has fully elapsed, so the
 * table stays bounded. Better Auth's own `rateLimit` table self-prunes; this
 * one has no background job, and the send path is low-traffic (it is rate
 * limited), so an extra `DELETE` per send is cheap next to the Turnstile
 * round trip that precedes it.
 */
export async function recordOtpSend(
  db: WorkerEnv["DB"],
  email: string,
  now: number = Date.now(),
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO "otpSendThrottle" ("email", "count", "windowStart")
       VALUES (?1, 1, ?2)
       ON CONFLICT ("email") DO UPDATE SET
         "count" = CASE
           WHEN ?2 - "windowStart" >= ?3 THEN 1
           ELSE "count" + 1
         END,
         "windowStart" = CASE
           WHEN ?2 - "windowStart" >= ?3 THEN ?2
           ELSE "windowStart"
         END`,
    )
    .bind(email, now, WINDOW_MS)
    .run();

  await db
    .prepare(`DELETE FROM "otpSendThrottle" WHERE "windowStart" < ?1`)
    .bind(now - WINDOW_MS)
    .run();
}
