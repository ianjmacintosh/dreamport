# Research: What does Cloudflare's own documentation require/restrict on a Turnstile widget's "Domains" field?

**Date:** 2026-09-17
**Sources used:** developers.cloudflare.com/turnstile/\* only (primary source only — no third-party blogs, Stack Overflow, or secondary write-ups used as evidence)

## Question

This bears directly on an architecture decision: dreamport's staging environment is deployed only to a `*.workers.dev` host (`dreamport-staging.bananasquad.workers.dev`). `docs/adr/0011-per-environment-host-allowlists.md` and `docs/deployment.md` both assert, uncited, that "a widget can't be created without" a real custom domain and that a real Turnstile widget "simply won't render on staging or a preview URL." This research checks that claim against Cloudflare's own docs rather than assuming it.

1. Does Cloudflare require the domain(s) listed in a widget's Domains field to be a zone the account owns/manages in Cloudflare DNS, or is it a looser, declarative list of expected hostnames with no DNS/zone-ownership verification?
2. Is `localhost` documented as valid for local development testing, and where exactly?
3. Is there any documented restriction against listing a `*.workers.dev` subdomain (a subdomain of a domain Cloudflare itself owns, not the registrant) as a widget domain?
4. What does the `hostname` field in the `siteverify` response represent, and does Cloudflare enforce it against the widget's Domains list server-side, or is that check left to the caller?
5. Are there any documented limitations specific to using a Turnstile widget on a `*.workers.dev` subdomain?

## Bottom line

**Cloudflare's Domains field is a declarative FQDN list with no DNS/zone-ownership check, and nothing in Cloudflare's documentation prohibits, or even mentions, `*.workers.dev` subdomains.** `dreamport-staging.bananasquad.workers.dev` is a syntactically valid hostname entry (FQDN, no scheme/port/path/wildcard) and could be added to a widget's Hostname Management list like any other hostname — Cloudflare's own dashboard docs describe adding hostnames that are **not** Cloudflare-registered zones as the default path ("if you have zones registered with Cloudflare, you can select from existing zones" is offered as a convenience, not a requirement), and the API reference example lists a bare IP address (`203.0.113.1`) as a valid `domains` entry. **The word "workers.dev" does not appear anywhere in Cloudflare's Turnstile documentation** — there is no documented special case, restriction, or caveat for it in either direction.

This directly contradicts the un-cited claim in ADR-0011 / `docs/deployment.md` that "a widget can't be created without" a real custom domain and "won't render... on a preview URL." Nothing found supports that a widget requires a Cloudflare-zone domain, or that `workers.dev` hosts are special-cased or excluded. **A real Turnstile widget scoped to `dreamport-staging.bananasquad.workers.dev` appears to be creatable and usable for real challenge verification there**, subject only to the documented generic constraints (FQDN format, 10-hostname limit on the free plan) — not to any workers.dev-specific restriction, because none is documented.

## Finding 1: Domains field is a declarative FQDN list, not a Cloudflare-zone-ownership check

- **Hostname Management** — <https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/>

  > "Hostnames must be fully qualified domain names (FQDNs)... Wildcard characters (such as `*`) are not supported."

  Invalid formats are schemes (`http://example.com`), ports (`example.com:443`), and paths (`example.com/path`) — that is the entire documented format restriction. There is no statement requiring the FQDN to correspond to a zone registered in the account's Cloudflare DNS.

  The same page, describing the "Add hostnames" step when creating a widget:

  > "If you have zones registered with Cloudflare, you can select from existing zones"

  This is phrased as an optional convenience (autofill from your zones, if any) — not as the only way to add a hostname, and not as a gate requiring the hostname to be one of your zones.

  > "Adding a hostname automatically authorizes all of its subdomains" — e.g. adding `example.com` covers `www.example.com` and `shop.example.com`; adding `www.example.com` covers it and its own children but not `example.com` or sibling subdomains.

  > "Free users are entitled to a maximum of 10 hostnames per widget. Enterprise customers can have up to 200 hostnames per widget."

- **Widget Management (API)** — <https://developers.cloudflare.com/turnstile/get-started/widget-management/api/>

  The create-widget example uses `"domains": ["example.com"]`; the update example uses `"domains": ["203.0.113.1", "cloudflare.com", "blog.example.com"]`. `203.0.113.1` is a bare IP address (RFC 5737 documentation IP), not a domain at all, and `cloudflare.com` is used as a plain example hostname. Cloudflare's own reference examples for this field are not scoped to "domains you have registered as a Cloudflare zone."

- **Widget Management (Dashboard)** — <https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/>

  The widget-creation walkthrough's only description of this field: "Hostname management: Domains where the widget will be used." No ownership/verification language appears here either.

**Conclusion:** Cloudflare documents the Domains/Hostname Management field as a plain, declarative list of FQDNs the widget is authorized to run on — format-checked (FQDN, no scheme/port/path/wildcard) and count-limited by plan, but with no documented requirement that the entries be zones the account owns or manages in Cloudflare DNS.

## Finding 2: `localhost` is documented as valid, but only for Cloudflare's dummy test keys — with an explicit recommendation against it for real (production) keys

- **Testing** — <https://developers.cloudflare.com/turnstile/troubleshooting/testing/>

  > "Test keys work on any domain, including: `localhost`, `127.0.0.1`, `0.0.0.0`, Any development domain."

  > "Dummy sitekeys can be used from any domain, including on `localhost`."

  But, for real (non-dummy) sitekeys:

  > "Cloudflare recommends that sitekeys used in production do not allow local domains (`localhost` or `127.0.0.1`)."

  This is phrased as a recommendation, not a hard platform restriction — the same page implies a real widget's Hostname Management list *can* be configured to include `localhost` if you choose to, it's just advised against for a production key. Cloudflare's dummy keys (`1x00000000000000000000AA` etc.) exist specifically so real widgets don't need `localhost` in their Domains list at all.

**Conclusion:** `localhost` is explicitly documented as working with Cloudflare's dummy test sitekeys on any domain (exactly what dreamport already does for `staging`/`local` per `docs/deployment.md`). For a real widget, Cloudflare's documented position is a recommendation against including local domains, not a stated inability to do so.

## Finding 3 & 5: No documented restriction, or even mention, of `*.workers.dev` subdomains

Across every Turnstile documentation page fetched for this research — Hostname Management, its "Any Hostname" sub-page, both widget-management pages (dashboard and API), the testing/troubleshooting page, the client-side error-codes page, the server-side-validation page, and the widget concepts page — **the string "workers.dev" does not appear anywhere**. There is no documented special case for Cloudflare Workers' own `*.workers.dev` subdomains, positive or negative: no statement that such a hostname is disallowed, and no statement that it requires anything extra.

The only documented constraint that could bear on `dreamport-staging.bananasquad.workers.dev` is the generic FQDN format rule from Finding 1 (which it satisfies — it is a plain FQDN, no scheme/port/path/wildcard) and the plan's hostname-count limit (10 for free tier, irrelevant here since only one hostname is being added).

**Conclusion:** No documented restriction against listing a `*.workers.dev` subdomain as a Turnstile widget domain was found, because Cloudflare's Turnstile documentation does not address `workers.dev` at all. The claim in ADR-0011 / `docs/deployment.md` that a widget "can't be created without" a real custom domain, or that it "won't render... on staging," is not supported by anything in Cloudflare's own documentation — it appears to be an unverified assumption, as the project owner suspected.

## Finding 4: `hostname` in `siteverify` is informational; the Domains list is enforced client-side (at widget render), not by `siteverify` itself

- **Server-Side Validation** — <https://developers.cloudflare.com/turnstile/get-started/server-side-validation/>

  The `siteverify` response schema documents `hostname` as: "Hostname where the challenge was served." The documented `error-codes` enum for `siteverify` is exactly: `missing-input-secret`, `invalid-input-secret`, `missing-input-response`, `invalid-input-response`, `bad-request`, `timeout-or-duplicate`, `internal-error`. **There is no `hostname-mismatch` (or equivalent) error code documented for `siteverify`** — Cloudflare's server-side verification endpoint does not appear to reject a token based on whether its reported `hostname` matches the widget's configured Domains list; it simply reports the hostname and leaves comparison to the caller. The page's own example validation code implements this caller-side check itself:

  > `if (expectedHostname && validation.hostname !== expectedHostname) { return { valid: false, reason: "hostname_mismatch", ... } }`

  — i.e., that hostname check is application code the docs show you how to write, not something `siteverify` already does for you.

- **Any Hostname** — <https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/any-hostname/>

  > "By default, hostname validation is a security feature that prevents unauthorized use of your widgets." "The Any Hostname feature removes the requirement to specify hostnames during widget creation, allowing widgets to function on any domain."

  With Any Hostname enabled, Cloudflare's guidance is to "implement additional validation in your server-side code to maintain security controls" and "Always validate the `hostname` field in Siteverify responses" — again placing hostname enforcement on the integrator's own server code, not on `siteverify` itself.

- **Client-Side Errors / Error Codes** — <https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/>

  Error `110200`: **"Domain not authorized"** — triggered when the current page's domain isn't in the widget's Hostname Management list. This is a **client-side** error (the widget itself fails at render/initialization time on the browser's actual page origin); remediation is "Add current domain in Hostname Management." This is where "By default, hostname validation is a security feature" (from the Any Hostname page) is actually enforced — in the widget's own client-side script, checked against the page it's loaded on, not against DNS/zone data.

**Conclusion:** The `hostname` field returned by `siteverify` is purely informational ("hostname where the challenge was served") — Cloudflare's documented `siteverify` error codes contain nothing that checks it against the widget's configured Domains list, and Cloudflare's own docs instruct developers to do that comparison themselves if they need it. The real, documented enforcement point for the Domains list is client-side, at widget load (error `110200`, "Domain not authorized") — the widget script itself refuses to run/render on a page whose origin isn't in the list. So: the Domains list is not purely advisory/dashboard-only (it does gate whether the widget renders at all, client-side), but it is also not something `siteverify` cross-checks server-side — that half is left entirely to the integrator.

## Summary table

| Question | Answer | Status |
|---|---|---|
| Must Domains be a Cloudflare-owned/managed DNS zone? | **No** — plain FQDN list, format-checked only; "select from existing zones" is an optional convenience, not a requirement | Explicit (docs describe the format rule and the zone-picker as optional; API example uses a bare IP and an arbitrary domain) |
| Is `localhost` documented as valid? | **Yes, for dummy/test keys**, on any domain; for real keys Cloudflare *recommends against* it (not "prohibits") | Explicit quote, both directions |
| Restriction against `*.workers.dev` subdomains? | **None found; term never appears in the docs** | Absence confirmed across every relevant page |
| Does `siteverify` enforce hostname against the Domains list server-side? | **No** — `hostname` is informational; no matching error code exists in the documented `siteverify` error-codes enum; docs show the caller writing that check themselves | Explicit (response schema + error-codes enum + example code) |
| Is Domains-list enforcement purely advisory (dashboard-only)? | **No** — it's enforced client-side, at widget render (error `110200`, "Domain not authorized") | Explicit (error-codes page) |
| Documented limitation specific to `workers.dev`? | **None found** | Absence confirmed |

## Confidence level

**High** for Findings 1, 2, and 4 — each rests on direct quotes from Cloudflare's own Hostname Management, Testing, Server-Side Validation, Any Hostname, and Error Codes pages, cross-corroborated (e.g., the FQDN-only format rule plus the API's IP-address example both point the same direction; the missing `hostname-mismatch` error code plus the Any Hostname page's "implement additional validation yourself" guidance both point the same direction).

**High, but an absence-based finding** for Findings 3 and 5 — every Turnstile documentation page fetched for this research was checked for the string "workers.dev" and it appears nowhere. This is strong evidence there is no documented special case, but it is an absence of a prohibition rather than an explicit "yes, workers.dev subdomains are supported" statement. Nothing found contradicts using one; nothing found explicitly blesses it either — the practical read is that Cloudflare's Domains field treats it like any other FQDN, because the documented rules never single out `workers.dev` (or any other third-party-owned domain) for different treatment.

## Sources consulted

- <https://developers.cloudflare.com/turnstile/get-started/>
- <https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/>
- <https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/any-hostname/>
- <https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/>
- <https://developers.cloudflare.com/turnstile/get-started/widget-management/api/>
- <https://developers.cloudflare.com/turnstile/get-started/server-side-validation/>
- <https://developers.cloudflare.com/turnstile/troubleshooting/testing/>
- <https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/>
- <https://developers.cloudflare.com/turnstile/concepts/widget/>
- <https://developers.cloudflare.com/turnstile/llms.txt> (used only to enumerate the documentation's own page index, not as evidence)
