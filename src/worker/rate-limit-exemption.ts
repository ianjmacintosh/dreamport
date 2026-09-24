/**
 * The client IP Playwright presents (as `cf-connecting-ip`) on every send-OTP
 * and account-deletion request, so e2e runs never trip the send path's
 * per-IP (3 / 60s) or per-email (5 / 10min) limits, or `/delete-user`'s
 * per-IP one (3 / 60s) (issue #102). Without it, e2e specs had to
 * spread their sends across hand-assigned IPs, and adding specs made them
 * collide into flaky 429s.
 *
 * An IPv6 documentation address (RFC 3849, `2001:db8::/32`): valid anywhere
 * an IP is parsed downstream (Better Auth, Turnstile's `remoteip`) but never
 * assigned to a real client. Kept in this dependency-free module so the e2e
 * helper can import it without pulling in the Worker.
 */
export const E2E_RATE_LIMIT_EXEMPT_IP = "2001:db8::e2e";

/**
 * Whether this request skips the send path's per-IP and per-email limits and
 * `/delete-user`'s per-IP limit:
 * only when `cf-connecting-ip` is exactly {@link E2E_RATE_LIMIT_EXEMPT_IP}.
 * No environment gate is needed: on any deployed environment Cloudflare's
 * edge sets `cf-connecting-ip` to the real caller's address, overwriting
 * anything the client sent, and a documentation address is never a real
 * caller — so the exemption is only claimable against a local Worker
 * (Playwright, `npm run dev`). That rests on the edge owning this header: if
 * the Worker ever sits behind something that passes a client-sent
 * `cf-connecting-ip` through, this becomes a public bypass. The global daily
 * cap is not exempted.
 */
export function isRateLimitExempt(headers: Headers): boolean {
  return headers.get("cf-connecting-ip") === E2E_RATE_LIMIT_EXEMPT_IP;
}
