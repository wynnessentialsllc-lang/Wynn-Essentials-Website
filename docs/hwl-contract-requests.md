# HWL contract additions Wynn needs

Wynn will not approximate any of these locally. Each exists because a customer
experience improvement was attempted, found to require authority Wynn does not
have, and stopped rather than guessed at.

Ordered by customer impact.

---

## 1. Recommendation hierarchy — `matches[].rank`

| | |
| --- | --- |
| **Field** | `matches[].rank` |
| **Type** | positive integer, 1-based, dense, unique within `matches[]` |
| **Semantic authority** | HWL. The order in which this shopper should act, not the order products were scored. |
| **Where HWL derives it** | The same priority resolution that already produces `currentPriorities[]` and each match's `functionKey`. HWL already knows which resolved priority a match serves and how those priorities rank. |
| **Changes recommendation logic?** | **No.** Presentation only. It re-orders and labels what `matches[]` already authorizes; it adds and removes nothing. |

**Why Wynn cannot derive it.** Wynn wants to present "Start here → Next
priority → Additional support", which is the single largest comprehension win
available on a multi-match page. There is no authoritative ordering to render:

- `matchClass` is **degree and context of fit**, by the Lab's own definition. A
  Strong match is not "do this first" — a Conditional match can be the most
  urgent thing in a routine when its condition is live. Treating class as
  sequence would be Wynn inventing priority, which invariant 2 prohibits.
- `methodStep` is *Wynn's* routine order (cleanse → condition → treat → …). It
  describes where a product sits in a wash day, not which need matters most.
- Array order is currently **discarded** — see the open question below.

**Open question Wynn needs answered either way:** is the order of `matches[]`
authoritative? Wynn currently re-sorts by class, then by its own `methodStep`.
If HWL's array order carries meaning, Wynn is destroying it today and will stop
on request. If the order is arbitrary, `rank` is the only way to express
hierarchy.

---

## 2. Routine sequencing across a set — `matches[].sequence`

| | |
| --- | --- |
| **Field** | `matches[].sequence` — `{ afterProductKey?: string, notWithProductKey?: string[], cadence?: string }` |
| **Type** | object, all fields optional |
| **Semantic authority** | HWL, for cross-product interaction within a resolved set. |
| **Where HWL derives it** | The formulation/evidence model that already resolves `capabilityKey` per product. Protein-then-moisture ordering, or not-same-day pairings, are formulation facts. |
| **Changes recommendation logic?** | **No.** It orders products already authorized. |

**Why Wynn cannot derive it.** Wynn has per-product usage text (`whenToUse`),
which is authoritative for one product in isolation — "use once or twice a
month" is a fact about Revaivl. It says nothing about *this* shopper's set. When
CrownPrint authorizes a protein treatment and a moisturising conditioner
together, whether they go on the same wash day is a formulation interaction, and
Wynn inferring it from `capabilityKey` would be exactly the ingredient-to-advice
derivation invariant 9 prohibits.

Wynn will render this verbatim if supplied and shows nothing if not.

---

## 3. Accessory rationale linkage — `accessories[].supportsFunctionKey`

| | |
| --- | --- |
| **Field** | `accessories[].supportsFunctionKey` |
| **Type** | string, a `functionKey` from the same payload |
| **Semantic authority** | HWL. Which resolved need the tool supports. |
| **Where HWL derives it** | Whatever already decides to send the accessory. |
| **Changes recommendation logic?** | **No.** It explains an accessory already sent. |

**Why Wynn cannot derive it.** Today an accessory carries only `why` prose.
Wynn can say *that* the Lab suggested a bonnet, not *which* of the shopper's
needs it relates to. Matching the bonnet to `reduce_surface_friction` by name
would be the retired keyword lookup returning through the accessory channel —
the exact failure mode that produced the original bypass.

---

## 4. Multi-product function grouping — `matches[].functionKey` coverage guarantee

| | |
| --- | --- |
| **Field** | no new field; a **guarantee** that `functionKey` is always present and stable across matches serving the same function |
| **Type** | — |
| **Semantic authority** | HWL |
| **Changes recommendation logic?** | **No.** |

**Why Wynn needs it.** When two products serve one resolved function, Wynn wants
to group them as *alternatives for the same need* rather than as two unrelated
recommendations. That grouping is safe **only** if `functionKey` is guaranteed
present and identical for both. It is currently optional, so Wynn cannot rely on
it, and grouping by `needServed` prose would break the moment HWL rewords.

---

## Not requested, deliberately

- **Efficacy or outcome claims.** Ingredient-family evidence must stay
  mechanism, never performance. Wynn is not asking HWL to strengthen it.
- **Substitutes for `not_carried` gaps.** A gap is a genuine gap. Wynn does not
  want a "nearest alternative" field and would not render one.
- **Wynn-catalog reasoning.** Routine stage, price, availability and usage
  cadence for a single product are Wynn's own truth and stay Wynn's.
