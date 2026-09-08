import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { Kysely } from "kysely";
import { D1Dialect } from "kysely-d1";

import { createEmailSender, type EmailSender } from "./email/sender";
import type { WorkerEnv } from "./env";
import { ALLOWED_HOSTS, TRUSTED_ORIGINS } from "./trusted-origins";

/** Seconds in a minute / day, for the time configs below. */
const MINUTE = 60;
const DAY = 24 * 60 * MINUTE;

/**
 * Overrides for {@link createAuth}. `emailSender` lets a test drive the auth
 * object with a spy sender directly, without going through `EMAIL_MODE` or the
 * shared mock (see `src/worker/index.worker.test.ts`, "uses an injected email
 * sender"). The Worker itself never passes this.
 */
export interface AuthDeps {
  emailSender?: EmailSender;
}

/**
 * Build the auth object (the bundle of functions `betterAuth()` returns) for
 * each request.
 *
 * We don't build it once at app startup and reach back into it later. To
 * build it we need the DB binding and the signing secret, and on Workers
 * those only arrive with a request, on `c.env`. No request, no `env` — so
 * we build the auth object fresh on every request instead.
 *
 * Better Auth is hand-wired to D1 through Kysely + the `kysely-d1` dialect
 * rather than the `better-auth-cloudflare` bundle, to keep the code we own
 * and audit small (see `docs/adr/0002-better-auth-over-homegrown.md`).
 *
 * Note: D1 has no transactions and Better Auth assumes them, so a
 * multi-statement write can partially apply. Accepted risk, same ADR.
 */
export function createAuth(env: WorkerEnv, deps: AuthDeps = {}) {
  // Fail loud, not quiet: without a secret Better Auth would fall back to a
  // shared default and sign real cookies with it. Locally that means copying
  // `.dev.vars.example` to `.dev.vars`; deployed it means the Cloudflare
  // secret is missing.
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error(
      "BETTER_AUTH_SECRET is not set — copy .dev.vars.example to .dev.vars " +
        "for local dev, or set the Cloudflare secret (see docs/deployment.md).",
    );
  }

  const db = new Kysely({
    dialect: new D1Dialect({ database: env.DB }),
  });

  // An injected sender wins (see AuthDeps); otherwise `EMAIL_MODE` picks the
  // implementation, and `createEmailSender` throws if `resend` is only
  // half-configured.
  const emailSender = deps.emailSender ?? createEmailSender(env);

  return betterAuth({
    database: { db, type: "sqlite" },
    secret: env.BETTER_AUTH_SECRET,
    basePath: "/api/auth",
    // A dynamic config, not a fixed string: `stage` has no one fixed host
    // (see ALLOWED_HOSTS) and `local`'s port floats. Without this Better
    // Auth resolves baseURL by trusting whatever Host the request itself
    // claims — allowedHosts makes that an explicit allowlist instead, and a
    // request whose Host matches nothing in it fails rather than
    // self-trusting.
    baseURL: { allowedHosts: ALLOWED_HOSTS },
    trustedOrigins: TRUSTED_ORIGINS,
    session: {
      // Rolling 30-day session, bumped at most once a day of activity.
      expiresIn: 30 * DAY,
      updateAge: 1 * DAY,
    },
    advanced: {
      // The session cookie is always `Secure` (spec #18). Without this,
      // Better Auth only marks it `Secure` when it can prove the request
      // origin is HTTPS, which it can't do reliably behind Cloudflare or in
      // the Workers test pool. No `crossSubDomainCookies`, so it stays
      // host-only (no `Domain`) — every preview origin gets its own login.
      // Local dev must be reached over `http://localhost` (a secure context,
      // so browsers still store the cookie), not a bare LAN IP.
      useSecureCookies: true,
      ipAddress: {
        // Rate limiting (below) keys on the client IP. Cloudflare sets
        // `cf-connecting-ip` to the real client address on every request;
        // Better Auth defaults to `x-forwarded-for`, which is not what the
        // edge populates here. When the header is absent (local dev, the
        // test pool) Better Auth falls back to a single shared bucket.
        ipAddressHeaders: ["cf-connecting-ip"],
      },
    },
    // Availability control on the send-OTP path (issue #24, ADR-0007). This
    // is the per-IP dimension; the per-email dimension is owned code in the
    // Hono send route (`otp-send-throttle.ts`), since this limiter never sees
    // the request body.
    rateLimit: {
      // `enabled` defaults to production-only via `NODE_ENV`, which Workers
      // does not set — so without this the limiter is off everywhere.
      enabled: true,
      // Persist counters in D1 (the `rateLimit` table, migration 0002) so the
      // limit holds across isolates and requests, not just within one.
      storage: "database",
      // The global default (10s / 100) stays generous — only the send path is
      // deliberately tightened. 3 / 60s matches Better Auth's own built-in
      // rule for this endpoint; pinning it here makes the intent explicit and
      // survives an upstream default change.
      customRules: {
        "/email-otp/send-verification-otp": { window: 60, max: 3 },
        // #24 is scoped to the send path. Turning the limiter on globally
        // would otherwise pull Better Auth's default 3 / 10s `/sign-in*` rule
        // onto the verify endpoint as a side effect; `false` opts that path
        // out so verify-path behaviour is unchanged (the verify-path
        // griefing mitigation is issue #46).
        "/sign-in/email-otp": false,
      },
    },
    plugins: [
      // `better-auth` is pinned exactly in package.json: 1.7.2 verifies a
      // submitted code before looking the User up (PR #10605), so `verify`
      // can't be used to probe which emails exist. Any bump must keep that.
      // Full reasoning in docs/adr/0002-better-auth-over-homegrown.md.
      emailOTP({
        // 6-digit numeric code, 60-minute life, 3 guesses then it is dead.
        otpLength: 6,
        expiresIn: 60 * MINUTE,
        allowedAttempts: 3,
        // Sending to an unknown address does not reveal that it is unknown;
        // the address becomes a User when a code is verified, not before
        // (see docs/adr/0004-email-otp-no-pending-user.md).
        disableSignUp: false,
        async sendVerificationOTP({ email, otp, type }) {
          await emailSender.sendOtp({ to: email, otp, type });
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
