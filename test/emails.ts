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

  // --- Seam 1: /api/me ---
  /** Signs in, then reads its own email back from the session endpoint. */
  meOk: "delivered+me-ok@resend.dev",

  // --- Seam 1: /api/test/last-otp (mock-only test hook) ---
  /** A code is sent, then read back through the test hook. */
  lastOtpHook: "delivered+last-otp-hook@resend.dev",
  /** Never sent a code; asserts the hook 404s rather than inventing one. */
  neverSent: "delivered+never-sent@resend.dev",

  // --- e2e: the /login + /app Playwright flow (all via the mock sender) ---
  /** Happy path: email step -> code step -> lands on /app. */
  e2eHappyPath: "delivered+e2e-happy@resend.dev",
  /** Persistent session: sign in, navigate away and back, still signed in. */
  e2ePersistentSession: "delivered+e2e-persistent@resend.dev",

  // --- Seam 2: sender unit tests ---
  /** Default recipient for the `OtpEmail` fixture in `sender.test.ts`. */
  recruit: "delivered+recruit@resend.dev",
  /** Second recipient, for the "records each send" assertion. */
  second: "delivered+second@resend.dev",

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
