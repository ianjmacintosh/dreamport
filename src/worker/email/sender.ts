/**
 * The email-sender interface the auth layer depends on, plus its two
 * implementations. `createAuth` picks one with {@link createEmailSender},
 * driven by `EMAIL_MODE`; Seam 1 tests inject one directly instead.
 *
 * Only the OTP sign-in email exists today. The interface is deliberately
 * narrow — one method — so a third implementation (a different provider, a
 * queue) is a small, self-contained addition.
 */

/** The OTP-email kinds Better Auth's `emailOTP` plugin can ask us to send. */
export type OtpEmailType =
  | "sign-in"
  | "email-verification"
  | "forget-password"
  | "change-email";

/** One outbound one-time-code email, as handed to us by the `emailOTP` plugin. */
export interface OtpEmail {
  /** Recipient address (already lower-cased by Better Auth). */
  to: string;
  /** The 6-digit code, in the clear — the same string the user must type. */
  otp: string;
  /** Which flow triggered it. Only `sign-in` is reachable in this release. */
  type: OtpEmailType;
}

export interface EmailSender {
  /** Deliver a one-time code. Resolves when handed off; rejects on failure. */
  sendOtp(email: OtpEmail): Promise<void>;
}

/** The subset of the Worker env the sender factory reads. */
export interface EmailSenderEnv {
  /** `mock` (or unset) uses {@link MockEmailSender}; `resend` uses Resend. */
  EMAIL_MODE?: "mock" | "resend";
  /** Required when `EMAIL_MODE=resend`. */
  RESEND_API_KEY?: string;
  /** `From:` address, required when `EMAIL_MODE=resend`. */
  EMAIL_FROM?: string;
}

/**
 * No-network sender: logs the code and keeps a short tail of recent sends in
 * {@link MockEmailSender.sent}.
 *
 * `createEmailSender` returns one shared instance per Worker isolate (see
 * {@link getMockSender}), so a Seam 1 test can drive the Worker over HTTP and
 * then read the code straight out of `sent`. That instance is also the sender
 * in every deployed environment until real Resend delivery is switched on, so
 * `sent` is capped and never grows without bound.
 */
export class MockEmailSender implements EmailSender {
  /** How many recent sends {@link MockEmailSender.sent} retains. */
  static readonly HISTORY = 50;

  /** The most recent sends, oldest first, at most {@link MockEmailSender.HISTORY}. */
  readonly sent: OtpEmail[] = [];

  async sendOtp(email: OtpEmail): Promise<void> {
    this.sent.push({ ...email });
    if (this.sent.length > MockEmailSender.HISTORY) this.sent.shift();
    // Matches spec user-story 28: the dev copies the code from the console
    // instead of querying the database.
    console.log(
      `[email:mock] ${email.type} code for ${email.to}: ${email.otp}`,
    );
  }

  /** Drop all recorded sends. For test setup between cases. */
  clear(): void {
    this.sent.length = 0;
  }
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Sends through the Resend HTTP API. Constructed only when `EMAIL_MODE=resend`
 * and both `RESEND_API_KEY` and `EMAIL_FROM` are present — the factory throws
 * otherwise, so this class can assume both are set.
 */
export class ResendEmailSender implements EmailSender {
  #apiKey: string;
  #from: string;

  constructor(config: { apiKey: string; from: string }) {
    this.#apiKey = config.apiKey;
    this.#from = config.from;
  }

  async sendOtp({ to, otp, type }: OtpEmail): Promise<void> {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.#from,
        to,
        subject: subjectFor(type),
        text: bodyFor(otp),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Resend rejected the ${type} email (${res.status})${detail ? `: ${detail}` : ""}`,
      );
    }
  }
}

function subjectFor(type: OtpEmailType): string {
  return type === "sign-in"
    ? "Your Dreamport sign-in code"
    : "Your Dreamport verification code";
}

function bodyFor(otp: string): string {
  return `Your Dreamport code is ${otp}. It expires in 60 minutes.`;
}

/**
 * One mock sender per isolate. Lets HTTP-level tests recover the code the
 * Worker generated without a back channel into the request. Only ever a
 * `MockEmailSender`, never Resend.
 */
let sharedMockSender: MockEmailSender | undefined;

/** The shared {@link MockEmailSender}, creating it on first use. */
export function getMockSender(): MockEmailSender {
  sharedMockSender ??= new MockEmailSender();
  return sharedMockSender;
}

/**
 * Choose an {@link EmailSender} from the environment.
 *
 * - `EMAIL_MODE` unset or `mock` → the shared {@link MockEmailSender}.
 * - `EMAIL_MODE=resend` → {@link ResendEmailSender}, but only if both
 *   `RESEND_API_KEY` and `EMAIL_FROM` are set; a missing one throws here
 *   rather than silently falling back to mock.
 */
export function createEmailSender(env: EmailSenderEnv): EmailSender {
  const mode = env.EMAIL_MODE ?? "mock";

  if (mode === "mock") {
    return getMockSender();
  }

  if (mode === "resend") {
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
      throw new Error(
        "EMAIL_MODE=resend requires RESEND_API_KEY and EMAIL_FROM to be set.",
      );
    }
    return new ResendEmailSender({
      apiKey: env.RESEND_API_KEY,
      from: env.EMAIL_FROM,
    });
  }

  throw new Error(`Unknown EMAIL_MODE: ${String(mode)}`);
}
