# Research: Does sending to `delivered@resend.dev` count against Resend's send quota?

**Date:** 2026-09-13
**Sources used:** resend.com/docs, resend.com/changelog, resend.com/pricing (primary sources only — no third-party blogs used as evidence)

## Question

1. Does sending an email via the Resend API to the documented test/sink address `delivered@resend.dev` count against a Resend account's free-tier send quota (100/day, 3,000/month)?
2. Does Resend have a documented "test mode" / sandbox mode that is distinct from just using a test recipient address, and that does NOT count against quota?
3. Are the `*.resend.dev` test addresses themselves rate-limited or given any special quota treatment?

## Finding 1: Test-address sends DO count against quota (explicitly stated)

Resend's own documentation states this directly, in two separate places:

- **"Send Test Emails" (dashboard docs)** — <https://resend.com/docs/dashboard/emails/send-test-emails>

  > "Test emails count against your account's sending quota."

  This sentence appears as a standalone note on the page that documents `delivered@resend.dev`, `bounced@resend.dev`, `complained@resend.dev`, and `suppressed@resend.dev` as the safe addresses to use "without affecting your domain reputation."

- **"How to set up E2E testing with Playwright"** (knowledge base) — <https://resend.com/docs/knowledge-base/end-to-end-testing-with-playwright>

  > "Calling the Resend API tests the entire API flow, including Resend's API responses, but counts towards your account's sending quota."

  The same page recommends using a test address such as `delivered@resend.dev` specifically "so your tests don't impact your deliverability" — i.e., the test addresses protect your **sender reputation / deliverability metrics**, not your **quota**. Those are explicitly two different things in Resend's own framing.

**Conclusion (stated, not inferred):** Resend explicitly documents that test emails — including ones sent to the `resend.dev` sink addresses — count against the account's sending quota (the same 100/day, 3,000/month free-tier limits). This is a directly quoted fact from two independent official pages, not an inference.

## Finding 2: No distinct "test mode" / sandbox mode exists that skips quota

- **"Does Resend require production approval?"** — <https://resend.com/docs/knowledge-base/does-resend-require-production-approval>
  > "There is no sandbox mode, no approval process, and no waiting period."
  > "All accounts, including free accounts, have immediate production access from the moment you sign up."
  > "Resend does not limit free accounts or require authorization to send production emails. All accounts have the same production capabilities from day one."

Resend positions the absence of a sandbox/approval step as a selling point: there is no separate "test" environment or mode that runs outside of, or exempt from, the production API and its quota accounting. The `*.resend.dev` test addresses are the entirety of Resend's "testing" story — they are a set of special **recipient** addresses that simulate delivery/bounce/complaint/suppression events on the real API, not a separate non-billed/non-quota-counted mode.

**Conclusion (stated, not inferred):** No sandbox/test mode distinct from "send a real API call to a resend.dev address" is documented anywhere in Resend's docs or changelog. The `resend.dev` addresses are the mechanism, and per Finding 1, sending to them still runs through — and counts against — the normal API/quota path.

## Finding 3: Are the test addresses themselves rate-limited or given special quota treatment?

- **"Usage Limits" / rate-limit reference** — <https://resend.com/docs/api-reference/rate-limit>
  This page documents:
  - A default API rate limit of "10 requests per second per team" (returns `429` if exceeded; can be raised on request for trusted senders).
  - Email quota tracked via `x-resend-daily-quota` and `x-resend-monthly-quota` response headers, with `daily_quota_exceeded` / `monthly_quota_exceeded` error types.
  - "The daily quota applies only to the Free plan" and resets at midnight UTC; paid plans have no daily quota, only the monthly limit.

  **This page does not mention `delivered@resend.dev` or any other test address, and gives no indication of any special-cased rate limit or quota treatment for sends to those addresses.**

**Conclusion:** Resend's documentation does not explicitly state one way or the other whether the `resend.dev` test addresses have their own separate rate-limit bucket. The absence of any mention, combined with Finding 1's explicit statement that test emails count against the account's normal sending quota, is consistent with test-address sends being treated as ordinary API calls subject to the same per-team rate limit (10 req/s) and the same quota headers/errors as any other send. This last point (that they share the _same rate-limit bucket_, specifically) is not explicitly stated anywhere found — flagging as a gap, not a confirmed fact.

## Free-tier quota numbers (for reference)

From **Pricing** — <https://resend.com/pricing>:

- Transactional email (Free plan): "3,000" emails per month
- Daily limit: "100 emails a day"
- 3 domains, 30-day data retention, ticket support, etc. (unrelated to this question)

## Summary table

| Question                                                         | Answer                                 | Status                                                                                                                                  |
| ---------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Does sending to `delivered@resend.dev` count against send quota? | **Yes**                                | Explicitly stated in docs (two sources)                                                                                                 |
| Is there a separate sandbox/test mode exempt from quota?         | **No** — no sandbox mode exists at all | Explicitly stated in docs                                                                                                               |
| Are test addresses rate-limited separately from normal sends?    | Not stated                             | Documentation is silent; reasonable inference (not confirmed) is that they share the same quota/rate-limit accounting as any other send |

## Confidence level

**High**, for Findings 1 and 2 — both are direct, exact quotes from two independent official Resend documentation pages (`send-test-emails` and `end-to-end-testing-with-playwright`), corroborated by a third page (`does-resend-require-production-approval`) explicitly denying the existence of any sandbox mode.

**Low / not stated**, for the narrower question of whether test addresses share the _same_ rate-limit bucket as production sends specifically — the rate-limit reference page is silent on test addresses altogether, so this is circumstantial inference, not a documented fact.

## Sources consulted

- <https://resend.com/docs/dashboard/emails/send-test-emails>
- <https://resend.com/docs/knowledge-base/end-to-end-testing-with-playwright>
- <https://resend.com/docs/knowledge-base/what-email-addresses-to-use-for-testing>
- <https://resend.com/docs/knowledge-base/does-resend-require-production-approval>
- <https://resend.com/docs/api-reference/rate-limit>
- <https://resend.com/pricing>
- <https://resend.com/changelog/sending-test-emails>
