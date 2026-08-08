# Wynn Essentials ⇄ Hair Wellness Lab — CrownPrint Integration Contract

This is the authoritative Wynn-side contract for **Shop by CrownPrint™**. It
mirrors the approved Hair Wellness Lab (HWL) integration. Wynn Essentials owns the
shopping experience; HWL owns the CrownPrint assessment, CrownState/CrownHistory,
the CrownPrint Intelligence Report, the scientific/evidence architecture, and the
Wynn Essentials Match™ engine (all proprietary scoring stays server-side at HWL).

Implementation lives in `lib/crownprint.ts`, `lib/crownprint-state.mjs` (the
state machine), `app/shop-by-crownprint/`, and `db/schema.ts`
(`crownprint_sessions`) / `drizzle/0015_crownprint_sessions.sql`.

---

## 0. The connect state contract (read this first)

`/crownprint/connect` is a **resolver**, not a code minter. Being authenticated
is not a reason to mint a connect code. HWL must resolve the user's real state
and return exactly one of the statuses below on the redirect back to
`{wynn}/shop-by-crownprint/connect`:

| Status | When | Carries a code? |
| --- | --- | --- |
| `MATCH_READY` | Authenticated **and** entitlement active (not refunded/revoked) **and** assessment complete **and** results/report exist **and** CrownState fresh | **Yes** — `?code=…` (the `status` param is optional when a code is present) |
| `CROWNSTATE_STALE` | All of the above, but the latest CrownState is stale | Optional. Send a code to let Wynn show existing matches under the update prompt; send status alone to show the update prompt by itself |
| `NO_CROWNPRINT` | Authenticated, but no usable CrownPrint (never purchased, assessment incomplete, results missing, or entitlement refunded/revoked) | **No** |
| `AUTH_REQUIRED` | HWL could not identify the user | **No** |
| `TEMPORARILY_UNAVAILABLE` | HWL is up enough to redirect but cannot resolve the state right now | **No** |

Redirect examples:

```
{wynn}/shop-by-crownprint/connect?code=<opaque-one-time-code>   # MATCH_READY
{wynn}/shop-by-crownprint/connect?status=NO_CROWNPRINT
{wynn}/shop-by-crownprint/connect?status=AUTH_REQUIRED
{wynn}/shop-by-crownprint/connect?status=CROWNSTATE_STALE       # ± &code=…
{wynn}/shop-by-crownprint/connect?status=TEMPORARILY_UNAVAILABLE
```

Wynn accepts the status under `status`, `state`, or `result`, in any casing or
separator style (`no_crownprint`, `NO-CROWNPRINT`, `noCrownPrint`). An
unrecognized value is treated as "no claim was made", never guessed at. The
status enum is the **only** thing that crosses on the return hop — it says
nothing about answers, scores, or identity.

**A bare redirect with neither a code nor a status is the bug this contract
exists to prevent.** Wynn reads it as "the shopper backed out", which is the one
outcome that legitimately lands back on the intro page.

### Required HWL `/crownprint/connect` sequence

1. **Authenticate.** No session → send through HWL auth, then re-enter this
   sequence at step 1 (signing in proves identity, never entitlement). If auth
   cannot be offered, redirect back with `AUTH_REQUIRED`.
2. **Verify the return URL** against the Wynn allow-list. Reject anything else —
   never redirect to an unvalidated `return`.
3. **Query the CrownPrint entitlement.** Missing, refunded, revoked, charged
   back, or expired → `NO_CROWNPRINT`.
4. **Query the completed CrownPrint assessment.** Not completed → `NO_CROWNPRINT`.
   Confirm the results/report exist as required.
5. **Query the latest CrownState.** Stale → `CROWNSTATE_STALE`.
6. **Determine the state** from 1–5.
7. **Mint the one-time connect code ONLY for `MATCH_READY`** (and optionally for
   `CROWNSTATE_STALE`). Never mint for `NO_CROWNPRINT`, `AUTH_REQUIRED`, or an
   error.
8. **Redirect back** to the validated Wynn return URL with the code and/or the
   status.

The same sequence applies after the `/crownprint` purchase flow and after a
CrownState refresh: re-resolve, then mint a **new** one-time code. A CrownState
refresh must never require another $9.99 payment.

### Wynn's side of the state contract

Wynn re-checks the exchanged context rather than trusting that a code arrived,
because entitlement is the gate:

- `crownPrintPresent: true` is required for any match to render.
- `entitlementActive: false`, `assessmentComplete: false`, `resultsReady: false`,
  or an `entitlementStatus` of refunded / revoked / chargeback / expired /
  inactive / cancelled forces `NO_CROWNPRINT` and drops all matches, even if the
  payload also contains them.
- `crownState.fresh: false` forces `CROWNSTATE_STALE`. An **omitted** `crownState`
  is treated as fresh, so HWL never nags a shopper it didn't flag.

Resolution precedence (`resolveExperienceState`): an explicit non-match-ready
verdict from HWL outranks any Wynn session from an earlier visit (that is what
stops a revoked or signed-out shopper from still seeing old matches); a live
Wynn session is the **only** source of rendered matches, so a `?state=` marker
can never manufacture results.

---

## 1. Old contract vs. corrected contract

| Aspect | ❌ Old (removed) | ✅ Corrected (this contract) |
| --- | --- | --- |
| Auth to HWL | `Authorization: Bearer <HWL_SERVICE_TOKEN>` | **HMAC-SHA256** over `"<timestamp>.<rawBody>"`, headers `X-Wynn-Timestamp` / `X-Wynn-Signature`, secret `WYNN_INTEGRATION_HMAC_SECRET` |
| Endpoint | `{base}{HWL_MATCH_PATH}` (configurable) | Fixed `POST {base}/api/integrations/wynn-essentials/match` |
| Token from HWL | Opaque "handoff", stored 1h, **re-exchanged every page view** | Opaque **one-time connect code** (~256-bit, ~2-min TTL, audience-bound, atomically redeemed once, replay-rejected), **exchanged exactly once** |
| Request body | `{ handoff }` | `{ code, return }` |
| Wynn persistence | The HWL token in an httpOnly cookie, reused as a credential | Wynn-side **server-side session** (`crownprint_sessions`) holding only the safe context; opaque id in a signed httpOnly cookie |
| Cookie secret | `CROWNPRINT_HANDOFF_SECRET` used for the HWL token | `WYNN_SESSION_SECRET` (Wynn-local) for Wynn's own session/CSRF cookies only |
| Demo/fake data | `CROWNPRINT_DEMO` canned matches | **None.** Explicit unavailable states, never fabricated |

## 2. Environment variables removed

- `HWL_SERVICE_TOKEN` — no Bearer token in this contract.
- `HWL_MATCH_PATH` — the path is fixed by the contract.
- `CROWNPRINT_HANDOFF_SECRET` — replaced by `WYNN_SESSION_SECRET`.
- `CROWNPRINT_DEMO` — no fabricated data.

**Never set** `WYNN_CONNECT_TOKEN_SECRET` in Wynn — it is HWL-only. Wynn never
receives it and never mints or verifies connect codes.

## 3. Environment variables retained / added

| Var | Scope | Purpose |
| --- | --- | --- |
| `HWL_API_BASE_URL` | server | Base URL for the server-to-server exchange + `/crownprint/connect` |
| `WYNN_INTEGRATION_HMAC_SECRET` | server | Signs the exchange request (shared with HWL) |
| `HWL_ASSESSMENT_URL` | server | Create-CrownPrint flow (assessment) |
| `HWL_CROWNSTATE_UPDATE_URL` | server | CrownState refresh flow |
| `HWL_PRODUCT_HUB_URL` | server | Optional no-strong-match CTA (HWL may also return it as a safe link) |
| `WYNN_SESSION_SECRET` | server, Wynn-local | Signs Wynn's own session + CSRF cookies (falls back to `ADMIN_ORDERS_TOKEN`) |

None are `NEXT_PUBLIC_`. The HMAC secret is never exposed to the browser.

### Canonical Hair Wellness Lab production origin

```
https://hairwellnessslab.com
```

Spelling: **hair + wellness + s + lab** — three consecutive `s` characters
where "wellness" meets "slab". A two-`s` near-miss host (dropping the `s` that
begins "slab") is **not** production. Every HWL-facing value — the
server-to-server base, the outbound CTAs, and any Supabase/Google/Stripe
redirect allowlist entry on the HWL side — must use the three-`s` spelling.
Store origins with **no trailing slash**: `hwlFlowUrl()` concatenates the fixed
contract paths (`/crownprint`, `/crownprint/connect`, `/crownstate`) directly
onto `HWL_API_BASE_URL`, so a trailing slash yields a double-slashed URL.

Resolved production values:

| Flow | URL |
| --- | --- |
| Server-to-server exchange | `https://hairwellnessslab.com/api/integrations/wynn-essentials/match` |
| Connect (existing CrownPrint) | `https://hairwellnessslab.com/crownprint/connect` |
| Create (paid CrownPrint landing) | `https://hairwellnessslab.com/crownprint` |
| CrownState refresh | `https://hairwellnessslab.com/crownstate` |
| Product Hub (no-strong-match CTA) | `https://hairwellnessslab.com/product-hub` |

Wynn's own canonical origin is separate and unaffected —
`https://wynnessentialsllc.us` (`app/seo.ts`).

#### Enforcement

`HWL_CANONICAL_ORIGIN` in `lib/crownprint.ts` is the single host literal in the
codebase; every other HWL reference is composed from configuration. All five
HWL URL sinks are validated by `hwlUrl()`, which resolves a URL only if it sits
on the origin of `HWL_API_BASE_URL`:

| # | Sink | Source | If it is off-origin |
| --- | --- | --- | --- |
| 1 | Server-to-server exchange | `HWL_API_BASE_URL` + fixed path | n/a — defines the origin |
| 2 | Connect | `HWL_API_BASE_URL` + fixed path | n/a — contract-derived |
| 3 | Create | `HWL_ASSESSMENT_URL` override | rejected → falls back to `{base}/crownprint` |
| 4 | CrownState refresh | `HWL_CROWNSTATE_UPDATE_URL` override | rejected → falls back to `{base}/crownstate` |
| 5 | Product Hub | `safeLinks.productHub` response field, else `HWL_PRODUCT_HUB_URL` | rejected → CTA omitted |

Sink 5 matters most: it is the only HWL-controlled value rendered directly into
an `href`, so `normalizeMatchContext()` origin-checks it at the response
boundary. A foreign host, a near-miss host, or a non-HTTP scheme
(`javascript:`, `data:`) is dropped rather than linked.

The base URL is stored slash-trimmed, so a trailing slash in the env var can no
longer compose into `https://host//crownprint`.

`productionOriginOk()` returns false when `NODE_ENV=production` and the
configured base is not the canonical origin. The base intentionally remains
env-driven so a local or staging HWL can be pointed at during development;
production correctness is asserted by `tests/domain-canonical.test.mjs`.

> **Caveat:** validation is an exact origin match, so a `www.` variant is a
> *different* origin and would be rejected. If HWL ever serves any of these
> from `www.` or a subdomain, widen `hwlUrl()` deliberately rather than
> loosening the base URL.

## 4. Exact HMAC request

```
POST {HWL_API_BASE_URL}/api/integrations/wynn-essentials/match
Content-Type: application/json
X-Wynn-Timestamp: <unix SECONDS>
X-Wynn-Signature: base64url( HMAC_SHA256( WYNN_INTEGRATION_HMAC_SECRET, "<timestamp>.<rawBody>" ) )

<rawBody>   // the exact bytes signed and sent, e.g.:
{"code":"<opaque one-time code>","return":"https://<wynn-domain>/shop-by-crownprint/connect"}
```

The signature is computed over the concatenation `timestamp + "." + rawBody`, and
`rawBody` is the verbatim serialized body (`lib/crownprint.ts` builds it once and
both signs and sends the same string, so bytes cannot drift). No Bearer header.

**HWL's verifier is the authority on both encodings** (`lib/wynnMatch/integrationAuth.ts`
in the Hair Wellness Lab repo):

| Term | Value | Why it matters |
| --- | --- | --- |
| Timestamp unit | **unix seconds** | Freshness is `abs(nowSeconds - timestamp) > 300`. A millisecond timestamp reads as ~56,000 years in the future and is rejected as `stale_timestamp` **before the signature is computed** — a correct secret still yields 401 |
| Signature encoding | **base64url** | Compared with a length check then a constant-time compare. A hex signature is 64 chars against an expected 43 and fails as `signature_length_mismatch` |

Both of these were wrong on the Wynn side until the production 401s were traced;
`tests/crownprint-diagnostics.test.mjs` pins them, and the Hair Wellness Lab
suite pins the verifier's half.

### Diagnosing a 401 without exposing the secret

Neither site can see the other's secret, and a wrong secret and a wrong signing
convention produce the identical 401. Both sides therefore log a truncated,
one-way fingerprint — `SHA256(secret).hex().slice(0, 12)` — plus `SHA-256` of the
exact bytes signed:

```
Wynn:  [crownprint] HMAC secret fingerprint: abc123def456 · timestamp: … (unix seconds) · rawBody SHA-256: …
HWL:   [crownprint] Wynn exchange rejected: <reason> · Wynn HMAC secret fingerprint: abc123def456 · …
```

Fingerprints **differ** → configuration mismatch; fix the env var, change no
code. Fingerprints **match** → the signing contract differs; compare timestamp
unit, encoding, and the two body hashes.

The fingerprint is server-log only: never in a response, a URL, the database, or
the browser. HWL's granular rejection reasons (`missing_signature`,
`missing_timestamp`, `invalid_timestamp`, `stale_timestamp`,
`signature_length_mismatch`, `signature_mismatch`) are likewise log-only — the
HTTP response is a generic 401 that reveals nothing about which check tripped.

Responses:

- `200` → safe `WynnMatchContext` JSON (see §11).
- `404` / `409` / `410` → code unknown / already redeemed (replay) / expired → Wynn shows an "expired, reconnect" state.
- `503` → HWL temporarily unavailable → Wynn shows "temporarily unavailable" (never "no CrownPrint").
- other / network / timeout → temporarily unavailable.

## 5. One-time-code exchange lifecycle

1. HWL mints an opaque one-time code (~256-bit, ~2-min TTL, audience-bound to
   Wynn, stored HWL-side only as a keyed hash) and redirects to the Wynn return
   URL with `?code=…` only.
2. Wynn `/shop-by-crownprint/connect` verifies the CSRF `we_cp_pending` cookie,
   then calls `exchangeConnectCode(code, returnUrl)` **once**.
3. HWL atomically redeems the code and returns the safe context. The code is now
   dead; a second exchange would be rejected as replay.
4. Wynn discards the code entirely and stores only the safe context (§6). Wynn
   never re-exchanges and never treats the code as a reusable credential.

## 6. Wynn-side post-exchange session strategy

- The safe `WynnMatchContext` is written to `crownprint_sessions` (server-side,
  RLS-locked), keyed by an opaque ~256-bit `id`, with a 30-minute expiry.
- A signed, httpOnly, `SameSite=Lax` cookie (`we_crownprint_session`,
  `WYNN_SESSION_SECRET`) carries only that opaque id — never the HWL code, never
  match content.
- Page renders read the session (`readMatchSession`) with **no** HWL call. This
  gives continuity across views while the HWL code stays single-use.
- `?disconnect=1` deletes the session row and clears the cookie.

## 7. Create-CrownPrint flow

`?start=create` → redirect to `HWL_ASSESSMENT_URL?return=<wynn>` (falling back to
`{HWL_API_BASE_URL}/crownprint`, the paid landing page) → user purchases and
completes the assessment → HWL re-resolves per §0 → issues a **new** one-time
code → return → Wynn exchanges once → matches render. A shopper who abandons the
purchase comes back as `NO_CROWNPRINT`, not as an unexplained bounce.

## 8. Connect flow (the resolver)

`?start=connect` → redirect to `{HWL_API_BASE_URL}/crownprint/connect?return=<wynn>`
→ HWL runs the §0 sequence → returns `MATCH_READY` + a **new** one-time code, or
`NO_CROWNPRINT` / `AUTH_REQUIRED` / `CROWNSTATE_STALE` / `TEMPORARILY_UNAVAILABLE`
with no code → Wynn renders the matching state. This is the only path behind
"I already have my CrownPrint", and it is where the shopper's real state is
decided — never on the Wynn side, and never from the mere fact of a login.

## 9. CrownState refresh flow (stale)

`?start=refresh` → redirect to `HWL_CROWNSTATE_UPDATE_URL?return=<wynn>` (falling
back to `{HWL_API_BASE_URL}/crownstate`) → user saves new CrownState → HWL issues
a **new** one-time code → return → Wynn exchanges the **new** code once →
refreshed context, `MATCH_READY` again. The previous code is dead and is never
exchanged twice. **No additional $9.99 payment** — the CrownPrint entitlement is
untouched by a CrownState refresh.

## 10. Rendered states (all distinct; never fabricated)

Every state renders its own panel on `/shop-by-crownprint`, with its own message
and its own CTA. Nothing lands on the generic intro without an explanation.

| State | Shopper sees | CTA |
| --- | --- | --- |
| `MATCH_READY` | Their actual CrownPrint-powered matches | Shop / add to bag |
| `CROWNSTATE_STALE` | "Your CrownPrint is connected, but your current hair needs may have changed." (with matches when a session exists) | **Update My Hair Needs** → HWL CrownState refresh. No additional payment |
| `NO_CROWNPRINT` | "You don't have a CrownPrint yet." + the Premium explanation + **$9.99 one-time / No subscription** | **Create My CrownPrint™ — $9.99** → HWL `/crownprint` paid flow (plus "I already have my CrownPrint" for a different HWL account) |
| `AUTH_REQUIRED` | "Sign in to connect your CrownPrint." — and that HWL will re-check for a CrownPrint afterwards | **Sign In to Connect My CrownPrint™** → HWL `/crownprint/connect` |
| `TEMPORARILY_UNAVAILABLE` | "CrownPrint matching is temporarily unavailable." Explicitly not a CrownPrint verdict | Try Again |
| `INTEGRATION_UNAVAILABLE` | "CrownPrint matching isn't available just yet." (HWL not configured on this deployment) | Shop / Routine Finder |
| `CONNECT` | The educational intro — only when nothing has been resolved yet | Create My CrownPrint™ — $9.99 · I Already Have My CrownPrint™ |

Wynn-local markers (`EXPIRED`, `ERROR`, `SESSION_LOST`, `CANCELLED`,
`DISCONNECTED`) never assert anything about whether the shopper has a CrownPrint.

The three that mean *the handoff broke* — `EXPIRED`, `ERROR`, `SESSION_LOST` —
render a **reconnect panel**, not the create-and-pay intro. A shopper who
already owns a CrownPrint must never be shown a price again, asked to retake the
assessment, or pushed into the Routine Builder because a round trip failed. The
panel says so explicitly ("you will not be charged again, and you will not
retake the assessment"), and its primary CTA is `?start=connect`.
`isRecoveryMarker()` in `lib/crownprint-state.mjs` is the single definition of
that set. `CANCELLED` and `DISCONNECTED` keep the plain intro with a note.

### Diagnosing a failed connect

The CSRF check is unchanged — a connect code arriving without a valid
`we_cp_pending` cookie is **never** exchanged — but the two ways it can fail are
now distinguished, because they have different fixes and both used to surface as
the same unexplained "we couldn't verify that securely":

| `consumePending()` | Meaning | Landing | Usual cause |
| --- | --- | --- | --- |
| `ok` | This browser started the connect | proceeds to the exchange | — |
| `missing` | The cookie never came back | `SESSION_LOST` | The return hop landed on a **different host** than the outbound hop (bare vs `www.`, or a preview domain), third-party cookie blocking, or the HWL step was finished in another browser |
| `invalid` | Present but unsigned/expired | `EXPIRED` | Past the 15-minute window, or `WYNN_SESSION_SECRET` changed between hops |

Exchange failures are logged with their HTTP status. A `401`/`403` from
`/api/integrations/wynn-essentials/match` almost always means
`WYNN_INTEGRATION_HMAC_SECRET` differs from the secret HWL holds (or a clock
skew past their timestamp window) — that case is logged loudly, because it is
invisible to the shopper and fatal to **every** connect attempt. The exchange
timeout is 8s, so a cold HWL instance is not reported to a match-ready shopper as
"temporarily unavailable".

The state is resolved on the **server** from `?state=` + the Wynn session, so a
match-ready shopper's results are in the first paint. The marker stays in the URL
for HWL verdicts (so a refresh doesn't silently downgrade to the intro) and is
stripped for session-backed results.

The "I already have my CrownPrint" CTA always routes through
`/shop-by-crownprint/connect?start=connect` → HWL `/crownprint/connect`. It must
never link back to `/shop-by-crownprint`.

## 11. Safe response (WynnMatchContext) — the only fields Wynn accepts

`normalizeMatchContext()` whitelists exactly these; anything else is dropped:

```
crownPrintPresent: boolean
entitlementActive?: boolean          // false ⇒ refunded/revoked ⇒ NO_CROWNPRINT
entitlementStatus?: string           // "active" | "refunded" | "revoked" | …
assessmentComplete?: boolean         // false ⇒ NO_CROWNPRINT
resultsReady?: boolean               // false ⇒ NO_CROWNPRINT
crownState: { present: boolean, fresh: boolean, message?: string }
currentPriorityLabel?: string
matches: { productKey, productName, matchClass: "strong"|"good"|"conditional", why }[]
noStrongMatch: boolean
whatToLookFor?: { hairNeed?, productType?, formulationCharacteristics[], ingredientFunctions[], whatMayNotFit[], whyThisMatters? }
safeLinks?: { productHub?, assessment?, crownstateUpdate? }
ruleVersion?: string
generatedAt?: string
```

The four entitlement flags are **inputs only** — they collapse into
`crownPrintPresent` and are not stored. Absent means "HWL didn't qualify it"
(accepted); an explicit `false` always disqualifies and drops every match.

**Never stored or exposed:** raw CrownPrint answers, CrownPrint axis values,
CrownState detail, CrownHistory, report content, user UUID, raw scores, weights,
thresholds, internal reason codes, evidence logic.

## 12. Commerce & data boundaries

- Match cards resolve `productKey` → the Wynn catalog (`app/data.ts`) for image,
  name, price, and URL. Product claims are never changed by CrownPrint; only the
  consumer-safe "why" is personalized.
- Cart, checkout, orders, payments, and analytics stay entirely in Wynn
  Essentials. Analytics events carry only product slugs — never CrownPrint data.


---

## 13. Shop by CrownPrint **code** (`/crownprint`) — the Wynn-side path

`/shop-by-crownprint` can only show matches once the whole HWL round trip
succeeds. Any break in that chain — not signed in, the integration not
configured on a deployment, HWL erroring on the exchange — leaves a shopper who
genuinely **has** a CrownPrint standing on a page with no products on it.

`/crownprint` removes that dead end. Every CrownPrint Intelligence Report™ opens
with a code the shopper already owns:

```
CrownPrint code: P2-D3-T3-S2-E2
```

They type it in, tell us their CrownState, and Wynn matches its own catalog
against it — no round trip, no sign-in, nothing to verify. Every non-result
state on `/shop-by-crownprint` links here.

### The code

Five **CrownPrint Core** axes, each with a level (`lib/crownprint-code.ts`):

| Letter | Axis | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- | --- |
| `P` | Porosity | Low | Medium | High | — |
| `D` | Density | Low | Medium | High | — |
| `T` | Strand Thickness | Fine | Medium | Coarse | — |
| `S` | Scalp Type | Dry | Balanced | Oily | Sensitive |
| `E` | Elasticity | Low | Normal | High | — |

**Curl pattern is deliberately not an axis.** CrownPrint decides product fit on
how hair *behaves*, so "4C" is not a CrownPrint signal and the parser rejects it
rather than inventing one.

`parseCrownPrintCode()` is tolerant because a shopper is retyping off a PDF:
casing, separators, spacing, axis order, run-together (`P2D3T3S2E2`), the
report's own filename, and word forms (`porosity high`) all resolve to the same
Core. Partial codes are usable. Unreadable tokens are **reported, not fatal** —
`P2-X9-D1` still matches on P and D and says it could not read `X9`. A code with
nothing readable renders an explanation plus the axis pickers, never an empty
page.

### CrownState is never in the code

The Core is stable; the CrownState is not — HWL's own report says to update it
free "whenever your style, season, or scalp shifts". So `/crownprint` asks for it
on the page every visit: current style, protective stage, scalp right now,
primary concern, and current goal, mirroring the report's CrownState section
field for field.

### The page (`app/crownprint/`)

Everything renders on the **server** from the URL, so results are shareable,
bookmarkable, and work with JavaScript off (the form is a plain GET). The bare
page is indexable educational content; anything with a query string is
`noindex`. Sections, in order:

1. **Your CrownPrint** — the code, each axis read back with its meaning, and the entry form
2. **Your current priorities** — ranked, scalp comfort ahead of moisture ahead of strength
3. **Product functions you need** — routine functions, named independently of any product
4. **Best Wynn matches** — per card: match class, why it fits, what CrownPrint need it serves, when to use it, key ingredients from its own list, and any caveat
5. **What Wynn does not currently carry** — named gaps (clarifying/chelating wash, heat protectant, bond builder, firm-hold styler, medicated anti-dandruff, thick leave-in cream), listed only when this CrownPrint needs them
6. **What to look for elsewhere** — brand-agnostic formulation and ingredient-function guidance

### No forced recommendations

`lib/crownprint-fit.ts` gives products **no baseline weight**: a product scores
only from CrownPrint signals that actually point at it, and a product with zero
triggered signals is dropped. So "no fit" is a real, reachable outcome — it
renders *"Unfortunately, your CrownPrint didn't match any Wynn Essentials product
we currently offer"* followed by the full what-to-look-for guidance. Thresholds
are set high enough that a typical profile reaches two or three strong matches,
not a catalog full of them, and cautions are never dropped to make a card look
better. Braiding hair is excluded entirely; the bundle appears only when the
CrownPrint points at three of its four steps.

Tests: `tests/crownprint-code.test.mjs` (the vocabulary and parser, against the
real report fixture) and `tests/crownprint-fit.test.mjs` (the engine, against the
live catalog).

---

## 14. Which authority is speaking — primary vs. fallback

```
Hair Wellness Lab  =  CrownPrint intelligence authority
Wynn Essentials    =  catalog matching / commerce authority
```

`lib/crownprint-guidance.ts` is the only place that decides which of the two is
on screen, and its precedence is absolute:

**A trusted CrownPrint 360 context always outranks Wynn's local Core
reconstruction — including when the shopper has also typed their code in.**

### Primary — a connected CrownPrint 360

After a successful exchange, HWL has already resolved this shopper. Wynn
consumes that context and re-derives none of it:

| Field | Who owns it | What Wynn does with it |
| --- | --- | --- |
| `crownPrintCode` | HWL | Displays it back as identification |
| `currentPriorities[]` | HWL | Renders the ranked list verbatim |
| `productFunctionsNeeded[]` | HWL | **Matches the Wynn catalog against these** |
| `crownState.fresh` / `.message` / `.summary` | HWL | Drives the update path; never re-asked |
| `matches[]` | HWL | Rendered in HWL's own classes, with HWL's own `why` |
| `notCarried[]` | HWL | Listed under "what Wynn does not carry" |

Wynn answers exactly one question of its own: *which products in our catalog
serve these resolved functions, and which of them can we not serve at all?* A
function Wynn can serve that HWL didn't already name a product for is added as a
**good** match at most — `strong` is an intelligence verdict, and that belongs to
HWL. A function Wynn cannot serve joins the gaps.

Approximation is explicitly blocked (`NOT_SERVED` in `lib/crownprint-fit.ts`): a
bond-repair need is never answered with a protein conditioner, a clarifying need
never with a gentle sulfate-free cleanser, a medicated need never with a
botanical oil. Function matching reads the function **name only** — including the
explanatory detail was enough to make "scalp comfort care, applied while styled"
pull in a styling cream.

`productUsage()` runs in the other direction: Wynn adds "need it serves" and
"when to use it" to HWL's matches, because those are facts about Wynn's catalog
rather than anything HWL should carry across the boundary.

### Fallback — `/crownprint`

The Core-based engine serves three cases and no others: **manual code entry**, a
**degraded path** when the secure cross-site connection cannot complete, and
**shareable Core-based guidance**. It never claims equivalence to the CrownPrint
360 Product Blueprint, and it says so on the page — every result carries a
provenance block naming its source and confidence:

| Source | When | Confidence |
| --- | --- | --- |
| `crownprint-360` | Trusted HWL context | full |
| `core` | Complete P-D-T-S-E code | full (Core-based, limited context) |
| `core-partial` | Incomplete code | reduced |
| `crownstate-only` | No code at all | limited |

If a live trusted session exists, `/crownprint` does not render Core-based
matches at all. It points the shopper at their Blueprint — otherwise the fallback
would be competing with the authority.

### Partial codes

Tolerant parsing is unchanged, but a partial CrownPrint never gets a complete
one's treatment:

- **Missing axes are named**, in the provenance block and on the affected cards.
- **Confidence drops** — `core-partial`, never `full`.
- **Dependent guidance is held back.** A product whose reasoning consults an axis
  we weren't given cannot be a `strong` match; it caps at `good` and carries
  `limitedBy` saying which axes and why.
- **Nothing is inferred.** Absent axes are never defaulted, and the code is never
  padded out.

The dependency set is discovered by probing each predicate rather than by a
hand-maintained list, so a rule can never drift out of sync with the axes it
reads.

A statement is suppressed only when its truth *turns on* an axis we lack, decided
by substitution: every combination of levels for the missing axes is tried, and
if any of them changes the answer, the statement is contingent on something we
were not told. So "your CrownPrint doesn't flag a strength problem" disappears
when elasticity is missing (it would flip), while "breakage plus low density
means watch your hairline tension" is kept (it holds either way).

### CrownState

| Situation | `crownStateAction()` | Behavior |
| --- | --- | --- |
| Fresh trusted context | `none` | **Never re-asked.** They completed a full assessment; a storefront questionnaire would be a competing source of truth |
| Stale trusted context | `refresh` | HWL's free CrownState update flow. No Wynn questions, no second payment |
| No trusted context | `ask` | The fallback asks the **three** essential fields (current style, scalp right now, primary concern). Everything else is optional, behind a disclosure |

There is no second full questionnaire anywhere in the flow.

Tests: `tests/crownprint-architecture.test.mjs` pins all of the above —
precedence, offline fallback, partial-code downgrade, non-inference, CrownState
policy, no-fit reachability, no conditional promotion, and that connect
verification is untouched.
