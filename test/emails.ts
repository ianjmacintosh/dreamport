/**
 * Every email address the test suite sends to, in one place.
 *
 * **Rule: a test may only send mail to an address defined here.** Do not
 * write a recipient literal into a test. Ticket #21 requires every recipient
 * in test data to sit on a domain that cannot deliver to a real inbox, and
 * keeping them in one object is how that stays enforceable.
 *
 * Every address is one of Resend's documented test addresses
 * (https://resend.com/docs/dashboard/emails/send-test-emails):
 * `delivered@resend.dev` always accepts and never forwards, and the
 * `+label` suffix tags a scenario without changing routing. Using the
 * documented form means these behave predictably if a test is ever pointed
 * at the real Resend API instead of the mock sender. `bounced@resend.dev`
 * and `complained@resend.dev` are there if a test ever needs those
 * outcomes.
 *
 * Keys name the scenario, not the address, so a test reads as
 * `sendCode(TEST_EMAILS.expired)` rather than carrying a bare string.
 */
export const TEST_EMAILS = {
  // --- Seam 1: send endpoint ---
  /** A plain send with nothing else going on. */
  sendBasic: "delivered+send-basic@resend.dev",
  /** Already a User; used to check a known address looks like an unknown one. */
  knownSender: "delivered+known-sender@resend.dev",
  /** Never seen before, paired with `knownSender`. */
  strangerSender: "delivered+stranger@resend.dev",

  // --- Seam 1: verify endpoint ---
  /** Happy-path verify: right code, cookie issued. */
  verifyOk: "delivered+verify-ok@resend.dev",
  /** Unknown at verify time; asserts the User row is created on first verify. */
  freshUser: "delivered+fresh-user@resend.dev",
  /** Burns the 3-attempt budget, then checks the 4th try is refused. */
  attempts: "delivered+attempts@resend.dev",
  /** Its code is force-expired before verify. */
  expired: "delivered+expired@resend.dev",
  /** Gets a fresh code after the previous one expired. */
  reissueAfterExpiry: "delivered+reissue-expiry@resend.dev",
  /** Gets a fresh code after the attempt budget was exhausted. */
  reissueAfterExhaustion: "delivered+reissue-exhausted@resend.dev",
  /** Already a User; paired with `unknownVerify` for the wrong-code parity check. */
  knownVerify: "delivered+known-verify@resend.dev",
  /** Never seen before, paired with `knownVerify`. */
  unknownVerify: "delivered+unknown-verify@resend.dev",
  /** Drives `createAuth` with an injected spy sender, bypassing EMAIL_MODE. */
  injectedSender: "delivered+injected@resend.dev",

  // --- Seam 1: Turnstile gate on the send endpoint (#23) ---
  /** Send whose Turnstile token passes verification; a code is issued. */
  turnstilePass: "delivered+turnstile-pass@resend.dev",
  /** Send with no Turnstile token; rejected before a code is issued. */
  turnstileNoToken: "delivered+turnstile-no-token@resend.dev",
  /** Send whose Turnstile token fails verification; rejected before a code is issued. */
  turnstileBadToken: "delivered+turnstile-bad-token@resend.dev",
  /** Send while the Turnstile secret is unset; the gate fails closed (503). */
  turnstileUnconfigured: "delivered+turnstile-unconfigured@resend.dev",

  // --- Seam 1: production-host mock-email guard (#41) ---
  /** Send from the production Host while on `mock`; refused (503) before a code. */
  prodHostGuard: "delivered+prod-host-guard@resend.dev",
  /** Same code and mode but a staging Host; the guard must not fire. */
  prodHostStagingOk: "delivered+prod-host-staging-ok@resend.dev",

  // --- Seam 1: rate limiting on the send endpoint (#24) ---
  /**
   * Four interchangeable fillers for the per-IP / header tests: send to a
   * different one each request so the per-email limiter is never what trips,
   * leaving the per-IP rule as the only cause. Storage is cleared between
   * tests, so they are safe to reuse across cases.
   */
  rlFillerA: "delivered+rl-filler-a@resend.dev",
  rlFillerB: "delivered+rl-filler-b@resend.dev",
  rlFillerC: "delivered+rl-filler-c@resend.dev",
  rlFillerD: "delivered+rl-filler-d@resend.dev",
  /** One target address, hit from many IPs, to exercise the per-email rule. */
  rlPerEmail: "delivered+rl-per-email@resend.dev",
  /** Sent to in case/space variants to prove both limiters normalise alike. */
  rlNormalise: "delivered+rl-normalise@resend.dev",
  /** A normal send + verify while the limiter is on; must be unaffected. */
  rlHappyPath: "delivered+rl-happy-path@resend.dev",

  // --- Seam 1: sign out (#26) ---
  /** Signs in, signs out, then checks the old session cookie is dead. */
  signOut: "delivered+sign-out@resend.dev",

  // --- Seam 1: delete account (#26) ---
  /** `/delete-user` with a valid session: 200, link recorded, User still present. */
  deleteSendOk: "delivered+delete-send-ok@resend.dev",
  /** Full happy path: request a link, follow the callback, User + session gone. */
  deleteCallbackOk: "delivered+delete-callback-ok@resend.dev",
  /** Deletes, then signs up again with the same address as a brand-new User. */
  deleteThenReregister: "delivered+delete-then-reregister@resend.dev",
  /** Callback with an unknown token (valid session): 404, User still present. */
  deleteBadToken: "delivered+delete-bad-token@resend.dev",
  /** Callback with a valid token but no session cookie: 404, User still present. */
  deleteCallbackNoSession: "delivered+delete-callback-no-session@resend.dev",
  /** After a completed deletion, the old cookie is refused by `/api/me`. */
  deleteThenMe: "delivered+delete-then-me@resend.dev",
  /** Daily send cap already spent: `/delete-user` 429s, no link recorded. */
  deleteDailyCap: "delivered+delete-daily-cap@resend.dev",
  /** 4th `/delete-user` inside 60s trips Better Auth's per-IP `customRules`. */
  deleteRateLimit: "delivered+delete-rate-limit@resend.dev",

  // --- Seam 1: /api/test/last-delete-link (mock-only test hook) ---
  /** A link is sent, then read back through the test hook. */
  lastDeleteLinkHook: "delivered+last-delete-link-hook@resend.dev",
  /** Never had anything sent to it; asserts the hook 404s rather than inventing one. */
  neverSent: "delivered+never-sent@resend.dev",

  // --- Seam 1: /api/me ---
  /** Signs in, then reads its own email back from the session endpoint. */
  meOk: "delivered+me-ok@resend.dev",

  // --- e2e: the /login + /app Playwright flow (all via the mock sender) ---
  // Every address below carries the `+e2e-test@` marker (issue #39): the
  // `+<scenario>` label sits ahead of it, so e.g. "e2e-happy" tags the
  // scenario and Better Auth still sees the trailing "+e2e-test@" that
  // `generateOTP` matches on. Playwright types the fixed code "000000"
  // straight in — no `/api/test/last-otp` hook to read it back from.
  /** Happy path: email step -> code step -> lands on /app. */
  e2eHappyPath: "delivered+e2e-happy+e2e-test@resend.dev",
  /** Persistent session: sign in, navigate away and back, still signed in. */
  e2ePersistentSession: "delivered+e2e-persistent+e2e-test@resend.dev",
  /** Sign out from `/app`: lands on `/`, a later `/app` visit bounces to `/login`. */
  e2eSignOut: "delivered+e2e-sign-out+e2e-test@resend.dev",
  /** Delete account happy path: request link, follow it, `/app` then bounces to `/login`. */
  e2eDeleteAccount: "delivered+e2e-delete-account+e2e-test@resend.dev",
  /**
   * Opt-in post-deploy smoke (`deployment-smoke.spec.ts`) — code send only,
   * against a real deployed environment. Deliberately NOT a `+e2e-test@`
   * marker address: that spec's whole point is proving mock email delivery
   * is fenced out of a deployed environment (`EMAIL_MODE` there is never
   * `mock`), so the fixed code must stay unreachable there too.
   */
  deploySmoke: "delivered+deploy-smoke@resend.dev",

  // --- Seam 2: sender unit tests ---
  /** Default recipient for the `OtpEmail` fixture in `sender.test.ts`. */
  recruit: "delivered+recruit@resend.dev",
  /** Second recipient, for the "records each send" assertion. */
  second: "delivered+second@resend.dev",
  /** Recipient for the `DeleteAccountEmail` fixture in `sender.test.ts`. */
  deleteLinkRecipient: "delivered+delete-link-recipient@resend.dev",

  // --- Seam 1: fixed E2E-test OTP code (#39) ---
  /** `+e2e-test@` marker, `EMAIL_MODE=mock`: the fixed code `000000` verifies. */
  e2eTestFixedCode: "delivered+e2e-test@resend.dev",
  /** No `+e2e-test@` marker: gets a real random code, not the fixed one. */
  e2eTestNoMarker: "delivered+not-e2e-test@resend.dev",

  // --- Live (opt-in, never CI) ---
  /** Resend's sink: always accepts, never forwards. Only `sender.live.test.ts`. */
  liveSink: "delivered@resend.dev",
} as const;

export type TestEmail = (typeof TEST_EMAILS)[keyof typeof TEST_EMAILS];

/**
 * The `From:` identity the sender tests use. Resend's shared onboarding
 * sender — works without domain verification. Not a recipient; kept here so
 * no address literal lives in a test file.
 */
export const TEST_FROM = "onboarding@resend.dev";
