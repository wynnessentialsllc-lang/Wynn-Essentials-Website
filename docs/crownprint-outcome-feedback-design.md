# Post-routine outcome feedback — design proposal

**Status: proposal only. Nothing here is implemented, and no adaptive
recommendation behaviour is proposed.**

The ask was to assess how a future system could capture structured customer
observations after a CrownPrint routine, keeping subjective outcomes strictly
separate from formulation evidence and efficacy substantiation.

---

## 1. What the repository already has

`product_reviews` (migration `0007`, `db/schema.ts`) is a working first-party
feedback pipeline: `productSlug`, `author`, `rating`, `title`, `body`, `email`,
`verified`, `status`, moderated through `/admin/reviews`, published to the
storefront only after approval. `review_requests` (`0012`) already emails a
customer 8 days after purchase.

**It should not be extended to carry outcome data.** Three reasons:

1. **Different subject.** A review is about a *product*. An outcome observation
   is about a *routine over time* — several products, a CrownPrint, and a period
   of adherence. Forcing it into a per-product row loses the thing that makes it
   meaningful.
2. **Different visibility.** Reviews are published marketing copy. Outcome
   observations are private research data. Mixing them puts a moderation queue
   between a customer and a private note, and puts private notes one bug away
   from a product page.
3. **Different truth claim.** A 5-star review is an opinion and reads as one. A
   structured observation that "breakage decreased" sitting next to formulation
   evidence would read as substantiation. That is the confusion this whole
   integration exists to prevent, arriving from a new direction.

## 2. Proposed shape

A separate table, deliberately not joined to `product_reviews`.

```
crownprint_outcome_observations
  id                bigserial primary key
  observation_id    text unique          -- opaque; never a user id
  crownprint_code   text                 -- the Core code only ("P2-D3-T3-S2-E2")
  observed_at       timestamptz not null
  window_days       integer not null     -- how long the routine ran

  -- SUBJECTIVE, self-reported. Ordinal, never a measurement.
  manageability     integer  -- 1..5, "harder" → "easier"
  dryness           integer  -- 1..5
  scalp_comfort     integer  -- 1..5
  breakage_observed integer  -- 1..5
  adherence         text     -- 'rarely' | 'sometimes' | 'mostly' | 'as_directed'

  -- What was ACTUALLY used, which is not the same as what was recommended.
  products_used     jsonb    -- [{ productKey, frequency }]
  products_skipped  jsonb    -- [{ productKey, reason }]

  note              text     -- free text, private
  created_at        timestamptz not null default now()
```

RLS enabled with no policy and `PUBLIC` revoked, matching every other table
holding customer data.

### Fields deliberately absent

- No user id, email, or order id. Feedback is keyed to an opaque observation id
  and the CrownPrint **Core** code — five hair traits, identifying nobody.
- No free-text health or symptom field beyond `note`, and `note` is never
  rendered publicly.
- No "did it work" boolean. There is no version of that question whose answer is
  not read as an efficacy claim.

## 3. The separation that matters

| | Formulation evidence | Outcome observation |
| --- | --- | --- |
| Source | HWL evidence model | The customer |
| Nature | Mechanism — a formulation carries a capability | Subjective experience over a period |
| Renders | On the product card, next to the match | **Nowhere on the match card** |
| May substantiate a claim | No — mechanism, not performance | **No** |
| Storage | Session context, never persisted | Its own table |

**The hard rule, if this is ever built:** an outcome observation must never
render on, beside, or below a CrownPrint match card, and must never enter the
`matches` pipeline in any form. It is input to product development and to HWL's
model, not evidence shown to the next shopper. The moment aggregated outcomes
appear next to a match, they become an implied performance claim about a
formulation — which neither Wynn nor HWL has substantiated.

## 4. Why no adaptive behaviour is proposed

Feeding observations back into recommendation would move recommendation
authority into Wynn, which the entire architecture prohibits. If outcome data
should influence future CrownPrints, it belongs in **HWL's** model, reaching
Wynn the way everything else does: as an authorized `matches[]` array.

The safe first version is collection and export. Nothing more.

## 5. Open questions before any implementation

1. Who owns the observation data — Wynn, HWL, or joint? It is collected on
   Wynn's storefront about HWL's assessment.
2. Does capturing it require consent language beyond the existing review
   consent? Almost certainly yes, since it is research data rather than
   published feedback.
3. What is the retention period, and what does deletion mean when the row
   identifies nobody?
4. Should HWL receive it at all, and if so aggregated or per-observation?
