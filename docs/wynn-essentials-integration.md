# Wynn Essentials ⇄ Hair Wellness Lab — CrownPrint Integration Contract

This is the authoritative Wynn-side contract for **Shop by CrownPrint™**. It
mirrors the approved Hair Wellness Lab (HWL) integration. Wynn Essentials owns the
shopping experience; HWL owns the CrownPrint assessment, CrownState/CrownHistory,
the CrownPrint Intelligence Report, the scientific/evidence architecture, and the
Wynn Essentials Match™ engine (all proprietary scoring stays server-side at HWL).

Implementation lives in `lib/crownprint.ts`, `app/shop-by-crownprint/`, and
`db/schema.ts` (`crownprint_sessions`) / `drizzle/0015_crownprint_sessions.sql`.

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

`?start=create` → redirect to `HWL_ASSESSMENT_URL?return=<wynn>` → user completes
the assessment → HWL issues a **new** one-time code → return → Wynn exchanges once
→ render. (No reusable token is echoed from the assessment.)

## 8. Reconnect flow (existing CrownPrint)

`?start=connect` → redirect to `{HWL_API_BASE_URL}/crownprint/connect?return=<wynn>`
→ HWL authenticates + verifies CrownPrint → issues a **new** one-time code →
return → Wynn exchanges once → render.

## 9. CrownState refresh flow (stale)

`?start=refresh` → redirect to `HWL_CROWNSTATE_UPDATE_URL?return=<wynn>` → user
saves new CrownState → HWL issues a **new** one-time code → return → Wynn
exchanges the **new** code once → refreshed context. The previous code is never
reused.

## 10. Failure states (all distinct; never fabricated)

- **INTEGRATION_UNAVAILABLE** — HWL not configured (`crownprintIntegrationReady()`
  false). "CrownPrint matching isn't available just yet."
- **TEMPORARILY_UNAVAILABLE** — configured, but exchange got `503` / timed out.
  "CrownPrint matching is temporarily unavailable." Never "you don't have a
  CrownPrint."
- **NO_CROWNPRINT** — configured, no Wynn session (or `crownPrintPresent=false`,
  or an expired link). Offers create/connect.

## 11. Safe response (WynnMatchContext) — the only fields Wynn accepts

`normalizeMatchContext()` whitelists exactly these; anything else is dropped:

```
crownPrintPresent: boolean
crownState: { present: boolean, fresh: boolean, message?: string }
currentPriorityLabel?: string
matches: { productKey, productName, matchClass: "strong"|"good"|"conditional", why }[]
noStrongMatch: boolean
whatToLookFor?: { hairNeed?, productType?, formulationCharacteristics[], ingredientFunctions[], whatMayNotFit[], whyThisMatters? }
safeLinks?: { productHub?, assessment?, crownstateUpdate? }
ruleVersion?: string
generatedAt?: string
```

**Never stored or exposed:** raw CrownPrint answers, CrownPrint axis values,
CrownState detail, CrownHistory, report content, user UUID, raw scores, weights,
thresholds, internal reason codes, evidence logic.

## 12. Commerce & data boundaries

- Match cards resolve `productKey` → the Wynn catalog (`app/data.ts`) for image,
  name, price, and URL. Product claims are never changed by CrownPrint; only the
  consumer-safe "why" is personalized.
- Cart, checkout, orders, payments, and analytics stay entirely in Wynn
  Essentials. Analytics events carry only product slugs — never CrownPrint data.
