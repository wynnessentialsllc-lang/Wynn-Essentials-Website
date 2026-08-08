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

## 4. Exact HMAC request

```
POST {HWL_API_BASE_URL}/api/integrations/wynn-essentials/match
Content-Type: application/json
X-Wynn-Timestamp: <unix-ms timestamp>
X-Wynn-Signature: hex( HMAC_SHA256( WYNN_INTEGRATION_HMAC_SECRET, "<timestamp>.<rawBody>" ) )

<rawBody>   // the exact bytes signed and sent, e.g.:
{"code":"<opaque one-time code>","return":"https://<wynn-domain>/shop-by-crownprint/connect"}
```

The signature is computed over the concatenation `timestamp + "." + rawBody`, and
`rawBody` is the verbatim serialized body (`lib/crownprint.ts` builds it once and
both signs and sends the same string, so bytes cannot drift). No Bearer header.

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

Wynn-local markers (`EXPIRED`, `ERROR`, `CANCELLED`, `DISCONNECTED`) fall back to
the intro **with an explanatory note**. None of them asserts anything about
whether the shopper has a CrownPrint.

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
