-- Insights article: the CrownPrint™ System and the Hair Wellness Lab partnership.
--
-- Seeded as PUBLISHED because it is the customer-facing explanation of a feature
-- that is already live on /shop-by-crownprint and /crownprint — a shopper who
-- meets those pages today has nowhere else to read what CrownPrint is. It stays
-- editable (or un-publishable) from /admin/blog like any other post.
--
-- Every claim here is sourced from the shipped contract in
-- docs/wynn-essentials-integration.md, lib/crownprint-code.ts, and
-- lib/crownprint-match-intelligence.ts. Nothing invents a score, a percentage,
-- or a capability the integration does not have. ON CONFLICT DO NOTHING keeps
-- this safe to re-run and never overwrites an edited post.
INSERT INTO "blog_posts" ("slug","title","excerpt","body","cover_image","author","status","published_at") VALUES
(
  'inside-the-crownprint-system',
  'Inside the CrownPrint™ System: Our Partnership With the Hair Wellness Lab',
  'CrownPrint is a hair assessment built by the Hair Wellness Lab, and it now powers how you shop with us. Here is what it measures, what stays private, and what a match actually means.',
  '## Why we partnered instead of building it ourselves

Most product quizzes on the internet are marketing with a progress bar. Three questions, a predictable answer, and every road leads to the most expensive bundle.

We did not want to run that. We also did not want to be the ones grading your hair — we make the products, and a company that both sells you something and decides what you need is not a neutral judge of fit.

So we partnered with the **Hair Wellness Lab**, and we split the work honestly:

- The Hair Wellness Lab owns the CrownPrint assessment, your CrownPrint Intelligence Report, and the matching engine behind it. That is their science, and it stays with them.
- Wynn Essentials owns the products, the catalog, and the shopping experience. That is ours.

You get an assessment from people who are not trying to sell you a bottle, applied to a catalog by the people who actually made it.

## What a CrownPrint measures

A CrownPrint is not one number, and it is not a curl type. It has two halves, and the difference between them is the whole idea.

### The CrownPrint Core — the part that holds still

Five characteristics that stay relatively stable over time:

- **Porosity** — how readily your hair takes moisture in, and how well it holds on to it.
- **Density** — how many strands are actually on your head.
- **Strand Thickness** — the diameter of an individual hair, which is a different question from density.
- **Scalp Type** — dry, balanced, oily, or sensitive.
- **Elasticity** — whether a strand stretches and returns, or stretches and snaps.

Density and thickness get confused constantly, and it matters: a head of fine strands packed densely needs something very different from a sparse head of coarse ones. Treating those two as one trait is how people end up with a shelf of products that were never wrong so much as never aimed at them.

### Your CrownState — the part that keeps moving

Your Core does not change much. Your hair''s situation changes all the time. CrownState captures the right now:

- What style you are wearing.
- Where you are in a protective style — fresh install, mid-wear, nearing takedown, or just took it down.
- What your scalp is doing this week: comfortable, tender, itchy, dry or flaky, oily.
- Your main concern at the moment — dryness, breakage, shedding, scalp discomfort, buildup, frizz, definition.
- What you are working toward.

Braids in week one and braids in week six are the same style and two different care problems. So CrownState is asked separately, and you can update it whenever your hair changes without redoing anything else.

## The code on your report

At the top of your CrownPrint Intelligence Report there is a short code:

`P2-D3-T3-S2-E2`

That is your Core, one letter per characteristic — **P**orosity, **D**ensity, strand **T**hickness, **S**calp, **E**lasticity — with a level for each. The example above reads as medium porosity, high density, coarse strands, a balanced scalp, and normal elasticity.

Note what is not in it. There is no CrownState in the code, because CrownState changes. There is nothing in it that identifies you. It is five traits about hair, which is exactly why it is safe to type into a box.

And you can: enter it on our [Shop by CrownPrint code page](/crownprint), tell us what your hair is doing this week, and see the fit — no account, no round trip, nothing to verify.

## Strong, Good, Conditional — what those words mean

Every recommendation you see carries one of three labels, and we would rather define them than let you guess:

- **Strong Match** — high alignment. The product directly serves one or more of the higher-priority needs identified from your CrownPrint.
- **Good Match** — real support, less central. It serves a need you have, just not the one doing the most work right now.
- **Conditional Match** — useful depending on context. Worth it when a particular condition applies, and not otherwise.

**A classification describes the degree and context of fit. It is not a grade of the product.** A Conditional Match is not a lesser formula. It is a product whose usefulness to *you* depends on something that changes — your style, your scalp this month, where you are in a protective style.

You will also notice something missing: percentages. We do not print "94% match," because that number would be invented. Product fit does not have that kind of precision, and a decimal point is an easy way to sound more certain than anyone should be. What you get instead is the reasoning — which of your own signals produced the label, and which job the product is being pointed at.

## What crosses between us, and what never does

This is the part we get asked about most, so here it is plainly.

Your CrownPrint answers stay at the Hair Wellness Lab. They are not sent to us, and we could not display them if we wanted to.

When you connect, the Lab hands us a single-use secure link that we redeem exactly once. What comes back is a safe match: which products fit, why they fit in language meant for you, and nothing else. No answers. No scores. No report. Nothing about you in the address bar, ever.

And when that handoff does not complete — an expired link, a step finished in a different browser — we say so and stop, rather than show you results we cannot stand behind. If you already own a CrownPrint, a broken connection never means paying again or retaking the assessment. It means reconnecting.

## What it costs

A CrownPrint is a **one-time $9.99** purchase at the Hair Wellness Lab. No subscription, and nothing recurring on our side.

Updating your CrownState later does not cost anything additional. Your hair in December is not your hair in July, and you should not have to buy a new assessment to say so.

## What it looks like in practice

Say your Core comes back high porosity with a dry scalp, and your CrownState says braids at mid-wear with dryness as the main concern.

High porosity means moisture arrives fast and leaves faster, so sealing matters more than soaking. Mid-wear braids mean the scalp is the part asking for attention, and a heavy cream on the length is the wrong tool. That points at [Relief Organic Scalp Oil](/products/relief-oil) for the scalp, [Hydrate Herbal Hair Mist](/products/hydrate-herbal-hair-mist) to refresh moisture, and [Nourish Organic Oil Blend](/products/nourish-oil) to seal it in — with a [Soft Life Bonnet](/products/soft-life-bonnet) doing quiet work overnight.

Change one input and the answer changes. Low porosity with the same style leans lighter, because heavy layers sit on top rather than sink in. Low elasticity moves [Revaivl Protein-Rich Conditioner](/products/revaivl-protein-conditioner) up the list, because snapping strands are a strength problem and not a moisture one.

That is the entire point. Same catalog, different starting place.

## What CrownPrint does not do

- **It is not medical advice.** Persistent scalp pain, sudden shedding, or a reaction to anything belongs with a professional, not a product page.
- **It does not change what a product is.** Full ingredients and directions live on every product page and say the same thing to everybody. CrownPrint explains fit; it never rewrites the label.
- **It does not overrule you.** You have lived with your hair longer than any assessment has. A match is a well-informed starting point, and your hair still gets the last word.

---

Ready to see yours? [Connect your CrownPrint](/shop-by-crownprint) if you already have one, or [enter your code](/crownprint) and shop from it directly. Prefer to start simpler? The [Routine Finder](/#routine-finder) is always free.

*Educational content, not medical advice. Patch test new products and stop use if irritation occurs.*',
  '/collections/wynn-essentials-three-hands.webp',
  'Wynn Essentials',
  'published',
  now()
)
ON CONFLICT ("slug") DO NOTHING;
