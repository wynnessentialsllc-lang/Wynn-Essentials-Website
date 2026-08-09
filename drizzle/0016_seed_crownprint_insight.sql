-- Insights article: the CrownPrint™ System and the Hair Wellness Lab partnership.
--
-- Seeded as PUBLISHED because it is the customer-facing explanation of a feature
-- that is already live on /shop-by-crownprint and /crownprint — a shopper who
-- meets those pages today has nowhere else to read what CrownPrint is. It stays
-- editable (or un-publishable) from /admin/blog like any other post.
--
-- WRITTEN FOR SEARCH, DELIBERATELY
--   · Slug is the query ("what is a crownprint"), not a headline.
--   · The excerpt is the meta description: 155 characters is where
--     app/blog/[slug] clips it, so it is written to land under that and read as
--     a complete sentence rather than a truncated one.
--   · The first paragraph answers the title question outright, so a featured
--     snippet or an AI overview has a definition to lift without needing the
--     rest of the page.
--   · H2s are the questions people actually type. H3s carry the long-tail FAQ.
--   · Internal links use descriptive anchor text and point only at live routes
--     (/crownprint, /shop-by-crownprint, /products/*, /#routine-finder) — never
--     at the starter posts in 0011, which are still drafts and would 404.
--
-- Every claim here is sourced from the shipped contract in
-- docs/wynn-essentials-integration.md, lib/crownprint-code.ts, and
-- lib/crownprint-match-intelligence.ts. Nothing invents a score, a percentage,
-- or a capability the integration does not have. ON CONFLICT DO NOTHING keeps
-- this safe to re-run and never overwrites an edited post.
INSERT INTO "blog_posts" ("slug","title","excerpt","body","cover_image","author","status","published_at") VALUES
(
  'what-is-a-crownprint',
  'What Is a CrownPrint™? Inside Our Hair Wellness Lab Partnership',
  'A CrownPrint is a five-part hair assessment from the Hair Wellness Lab. See what it measures, what stays private, and how it matches products to your hair.',
  'A **CrownPrint** is a hair assessment built by the **Hair Wellness Lab**. It profiles five characteristics of your hair that stay relatively stable — porosity, density, strand thickness, scalp type, and elasticity — plus a **CrownState** that captures what your hair is doing right now. Together those two halves decide which Wynn Essentials products actually fit you, instead of leaving you to guess in a comment section.

Here is how the system works, what crosses between the two companies, and what it costs.

## Why the assessment lives at the Hair Wellness Lab

Most product quizzes on the internet are marketing with a progress bar. Three questions, a predictable answer, and every road leads to the most expensive bundle.

We did not want to run that. We also did not want to be the ones grading your hair — we make the products, and a company that both sells you something and decides what you need is not a neutral judge of fit.

So we partnered with the Hair Wellness Lab, and split the work honestly:

- **The Hair Wellness Lab** owns the CrownPrint assessment, your CrownPrint Intelligence Report, and the matching engine behind it. That is their science, and it stays with them.
- **Wynn Essentials** owns the products, the catalog, and the shopping experience. That is ours.

You get an assessment from people who are not trying to sell you a bottle, applied to a catalog by the people who actually made it.

## What does a CrownPrint measure?

A CrownPrint is not a curl type and it is not one number. It has two halves, and the difference between them is the whole idea.

### The CrownPrint Core: five traits that hold still

- **Porosity** — how readily your hair takes moisture in, and how well it holds on to it.
- **Density** — how many strands are actually on your head.
- **Strand thickness** — the diameter of a single hair, which is a different question from density.
- **Scalp type** — dry, balanced, oily, or sensitive.
- **Elasticity** — whether a strand stretches and returns, or stretches and snaps.

Density and thickness get confused constantly, and it matters: fine strands packed densely need something very different from a sparse head of coarse ones. Treating those as one trait is how people end up with a shelf of products that were never bad, just never aimed at them.

### CrownState: the part that keeps changing

Your Core barely moves over the years. Your hair''s situation changes constantly. CrownState captures the right now:

- The style you are wearing — braids, locs, twists, a wig or weave, loose natural, or a silk press.
- Where you are in a protective style: fresh install, mid-wear, nearing takedown, or just took it down.
- What your scalp is doing this week: comfortable, tender, itchy, dry or flaky, or oily.
- Your main concern — dryness, breakage, shedding, scalp discomfort, buildup, frizz, or definition.
- What you are working toward.

Braids in week one and braids in week six are the same style and two entirely different care problems. That is why CrownState is asked separately from the Core, and why you can update it whenever your hair changes without redoing anything else.

## How do I read my CrownPrint code?

At the top of your CrownPrint Intelligence Report there is a short code:

`P2-D3-T3-S2-E2`

That is your Core, one letter per trait — **P**orosity, **D**ensity, strand **T**hickness, **S**calp, **E**lasticity — with a level for each. The example above reads as medium porosity, high density, coarse strands, a balanced scalp, and normal elasticity.

Notice what is not in it. There is no CrownState, because CrownState changes. There is nothing that identifies you. It is five facts about hair, which is exactly why it is safe to type into a box.

And you can: enter it on the [Shop by CrownPrint code page](/crownprint), tell us what your hair is doing this week, and see the fit — no account, no round trip, nothing to verify.

## What do Strong, Good, and Conditional match mean?

Every recommendation carries one of three labels, and we would rather define them than let you guess:

- **Strong Match** — high alignment. The product directly serves one or more of the higher-priority needs identified from your CrownPrint.
- **Good Match** — real support, less central. It serves a need you have, just not the one doing the most work right now.
- **Conditional Match** — useful depending on context. Worth it when a particular condition applies, and not otherwise.

**A classification describes the degree and context of fit. It is not a grade of the product.** A Conditional Match is not a lesser formula. It is a product whose usefulness to *you* depends on something that changes — your style, your scalp this month, where you are in a protective style.

You will also notice something missing: percentages. We do not print "94% match," because that number would be invented. Product fit does not have that kind of precision, and a decimal point is an easy way to sound more certain than anyone should be. What you get instead is the reasoning — which of your own signals produced the label, and which job the product is being pointed at.

## Is my CrownPrint data private?

Yes, and the architecture is the reason, not a promise.

Your CrownPrint answers stay at the Hair Wellness Lab. They are never sent to us. We could not display them if we wanted to.

When you connect, the Lab hands us a single-use secure link that we redeem exactly once. What comes back is a safe match: which products fit, and why they fit, in language written for you. No answers. No scores. No report. Nothing about you in the address bar, ever.

And when that handoff does not complete — an expired link, a step finished in a different browser — we say so and stop, rather than show results we cannot stand behind. If you already own a CrownPrint, a broken connection never means paying again or retaking the assessment. It means reconnecting.

## How much does a CrownPrint cost?

A CrownPrint is a **one-time $9.99** purchase at the Hair Wellness Lab. No subscription, and nothing recurring on our side.

Updating your CrownState later costs nothing additional. Your hair in December is not your hair in July, and you should not have to buy a new assessment to say so.

## What does a CrownPrint match look like in practice?

Say your Core comes back high porosity with a dry scalp, and your CrownState says braids at mid-wear with dryness as the main concern.

High porosity means moisture arrives fast and leaves faster, so sealing matters more than soaking. Mid-wear braids mean the scalp is the part asking for attention, and a heavy cream down the length is the wrong tool. That points at [Relief Organic Scalp Oil](/products/relief-oil) for the scalp, [Hydrate Herbal Hair Mist](/products/hydrate-herbal-hair-mist) to refresh moisture, and [Nourish Organic Oil Blend](/products/nourish-oil) to seal it in — with a [Soft Life Bonnet](/products/soft-life-bonnet) doing quiet work overnight.

![Lathyr shampoo, Uplyft deep conditioner, Hydrate herbal hair mist, and Nourish organic oil blend arranged as a textured-hair wash-day routine](/collections/wynn-method-family.jpeg)

Change one input and the answer changes. Low porosity with the same style leans lighter, because heavy layers sit on top instead of sinking in. Low elasticity moves [Revaivl Protein-Rich Conditioner](/products/revaivl-protein-conditioner) up the list, because snapping strands are a strength problem, not a moisture one.

That is the entire point. Same catalog, different starting place.

## How do I shop with my CrownPrint?

Two ways in, and both land on real products:

1. **Connect your account.** Start at [Shop by CrownPrint](/shop-by-crownprint) and the Lab resolves your CrownPrint securely. This is the fuller path — it carries your complete assessment, not just the Core.
2. **Type your code.** Enter `P2-D3-T3-S2-E2` on the [CrownPrint code page](/crownprint) and answer two quick questions about this week. No sign-in, no handoff, and it works even if the connection fails.

No CrownPrint yet and not ready to buy one? The [Routine Finder](/#routine-finder) is free and always will be.

## What a CrownPrint does not do

- **It is not medical advice.** Persistent scalp pain, sudden shedding, or a reaction to any product belongs with a professional, not a product page.
- **It does not change what a product is.** Full ingredients and directions live on every product page and say the same thing to everybody. CrownPrint explains fit; it never rewrites a label.
- **It does not overrule you.** You have lived with your hair longer than any assessment has. A match is a well-informed starting point, and your hair still gets the last word.

## CrownPrint FAQ

### Is a CrownPrint the same as a curl type?

No. Curl pattern describes what your hair looks like. A CrownPrint describes how it behaves — how it absorbs moisture, how much tension it tolerates, how your scalp responds. Two people with identical curl patterns can need opposite routines.

### Do I need a CrownPrint to shop Wynn Essentials?

No. Every product page lists its full ingredients, directions, and the concerns it addresses, and the [Routine Finder](/#routine-finder) is free. A CrownPrint narrows the catalog faster; it is not a gate.

### How often should I update my CrownState?

Whenever your hair situation changes — a new protective style, a takedown, a seasonal shift, or a new concern. If the Lab sees that your CrownState has gone stale, we show you an update prompt instead of matching against old information. Refreshing it is free.

### What if I lose my CrownPrint code?

It is printed on your CrownPrint Intelligence Report in your Hair Wellness Lab account. You can also skip the code entirely and [connect your account](/shop-by-crownprint) — the Lab resolves your CrownPrint directly.

### Does CrownPrint work for braids, locs, and wigs?

Yes. Protective styles are a first-class part of CrownState, including where you are in the wear cycle. Braids at mid-wear and braids at takedown get different guidance, because they need different care.

---

Ready to see yours? [Connect your CrownPrint](/shop-by-crownprint) if you already have one, or [enter your code](/crownprint) and shop from it directly.

*Educational content, not medical advice. Patch test new products and stop use if irritation occurs.*',
  '/collections/wynn-essentials-three-hands.webp',
  'Wynn Essentials',
  'published',
  now()
)
ON CONFLICT ("slug") DO NOTHING;
