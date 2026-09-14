# Host allowlists split per environment, amending ADR-0003 (#63)

`TRUSTED_ORIGINS` and `ALLOWED_HOSTS` (`src/worker/trusted-origins.ts`) have
been one shared constant array since ADR-0003, composed of every known host
across every environment — `PRODUCTION_HOSTS`, `STAGING_HOSTS`, plus
`"localhost:*"` in `ALLOWED_HOSTS`. Every deployed build ships the identical
array: staging's bundle recognizes production's hostname as legitimate, and
production's own bundle currently accepts a request whose `Host` claims to
be `localhost:1234` as an allowed host for `baseURL` resolution — confirmed
directly against the code, not assumed. Designing #63's facsimile-of-production
fix surfaced this as an unintentional gap, not a deliberate property: nothing
requires production's build to carry staging's or localhost's host patterns
at all.

A separate, same-shaped duplication existed in `TURNSTILE_HOSTNAMES`
(`src/worker/index.ts` / `turnstile.ts`) — its own hostname allowlist,
maintained independently of `ALLOWED_HOSTS`/`TRUSTED_ORIGINS` despite
expressing the same underlying concept ("which hostnames may legitimately
reach this Worker").

## Decision

**Each environment gets its own explicit host list, not one shared array.**
Production's list carries only its own host — no staging hosts, no
`localhost`. Staging's carries its own persistent host plus the per-branch
preview wildcard. Local carries `localhost`. Still plain constant arrays,
each still just data with no per-request computation — this amends
ADR-0003's holding about *scope* (one list vs. one list per environment), not
its holding about *shape* (constant array vs. function), which stands
unchanged. ADR-0003 itself already carries a running "Amended" note for
`ALLOWED_HOSTS` (#22) and the `PRODUCTION_HOSTS`/`STAGING_HOSTS` groups (#41);
this decision is recorded there too, the same way.

**The production-only fail-closed guard's exact-match host string stays a
hardcoded literal**, deliberately not sourced from any of the above lists or
from a var. Its whole job is surviving misconfiguration; making it
var-driven would let a bad or missing var silently disable the backstop
meant to catch bad config.

**`TURNSTILE_HOSTNAMES` collapses into this same per-environment host-list
concept** rather than remaining a separately maintained value. Its checker
(`verifyTurnstileToken` in `turnstile.ts`) currently does exact-string
matching (`Array.prototype.includes`), while the host lists rely on
wildcard/suffix patterns for preview hosts — closing that gap means either
teaching the Turnstile check to understand the same wildcard patterns, or
comparing the token's reported hostname against the current request's own
`Host` header instead of a precomputed list. Either resolves the
duplication. **This choice must be made explicitly when the implementing
ticket is scoped, not discovered mid-PR** — it changes `turnstile.ts`'s
public contract either way, so it belongs in the ticket's plan, not its
diff.

## Considered Options

- **Move the lists into `wrangler.jsonc` vars instead of code constants.**
  Rejected once the actual requirement was clarified: the value already
  *does* need to differ per environment (that's the point of this whole
  decision), and per-environment vars are the natural way to express
  environment-specific config — but the specific list content is still most
  usefully expressed as typed, documented, unit-tested source (matching how
  `PRODUCTION_HOSTS`/`STAGING_HOSTS` are already documented today), not a
  parsed comma-separated string with no attached rationale. No environment
  var is introduced by this decision; the constant-array shape from
  ADR-0003 is kept, split per environment instead of shared.
- **Leave `TURNSTILE_HOSTNAMES` as its own separate value.** Rejected — same
  concept (legitimate hostnames for this Worker) expressed twice invites the
  two lists drifting apart, the exact failure category this decision closes
  for `ALLOWED_HOSTS`/`TRUSTED_ORIGINS` themselves.
- **`.bananasquad.workers.dev` as the staging suffix pattern.** Rejected as
  too broad — it would accept any Worker on the account, not just this
  project's staging previews. Kept scoped to the existing
  `*-dreamport-staging.bananasquad.workers.dev` pattern.

## Consequences

- Production no longer trusts staging's hostname or `localhost` for CSRF /
  `baseURL` purposes — closes the gap this ADR opened with.
- The Turnstile hostname check gains real enforcement value it lacked before
  (see the "unset ⇒ lenient" staging behavior in `docs/deployment.md`) once
  it shares the properly-scoped per-environment list instead of its own
  separately-unset value.
- `docs/deployment.md`'s environment matrix and `TURNSTILE_HOSTNAMES` section
  need updating alongside the code change to describe the new per-environment
  shape.

## Related

- [#63](https://github.com/ianjmacintosh/dreamport/issues/63) — the issue
  that surfaced this
- `docs/adr/0003-trusted-origins-constant-array.md` — the decision this
  amends (constant-array shape kept; shared-across-environments scope
  changed)
- `docs/adr/0006-dynamic-base-url.md` — `ALLOWED_HOSTS`' original purpose
- `docs/adr/0010-email-delivery-keyed-on-resend-api-key-presence.md` — the
  sibling decision from the same #63 design session
