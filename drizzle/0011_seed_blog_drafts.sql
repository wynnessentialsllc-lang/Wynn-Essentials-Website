-- Starter articles for the education hub, inserted as DRAFTS so the owner can
-- review, edit, and publish them from /admin/blog. ON CONFLICT DO NOTHING keeps
-- this safe to re-run and never overwrites edited posts.
INSERT INTO "blog_posts" ("slug","title","excerpt","body","cover_image","author","status") VALUES
(
  'caring-for-boho-braids',
  'How to Care for Boho Braids So They Last',
  'Boho braids can look fresh for weeks with the right scalp and moisture routine. Here is a simple, stylist-approved way to care for them.',
  '## Why boho braids need real care

Boho braids blend braiding hair with loose, curly pieces for a soft, lived-in look. Because the style stays in for weeks, the health of your scalp and edges underneath matters as much as the braids themselves.

## Your weekly routine

- **Soothe the scalp.** Apply [Relief Organic Scalp Oil](/products/relief-oil) to dry or itchy areas 1 to 3 times a week and massage gently.
- **Support growth.** Use [Grow Oil](/products/grow-oil) on the scalp 2 to 3 times a week, focusing on the hairline and any tender spots.
- **Refresh moisture.** Lightly mist the braids with [Hydrate Herbal Hair Mist](/products/hydrate-herbal-hair-mist) as they start to feel dry.

## Protect your style at night

Wrap your hair or wear a [Soft Life Bonnet](/products/soft-life-bonnet) to reduce friction and frizz while you sleep. This is the single easiest way to keep boho braids looking fresh.

## Choosing your hair

Premium human hair holds curl and blends beautifully. Explore textures and a bundle guide on our [braiding hair page](/braiding-hair).

*This article is educational and is not medical advice. Stop use if irritation occurs.*',
  '/editorial/relief-braids.jpeg',
  'Hair Wellness Lab',
  'draft'
),
(
  'the-wynn-method-routine',
  'The Wynn Method: A Simple Textured-Hair Routine',
  'Healthy hair is a practice. Here is an easy way to build a consistent routine from wash day forward using six intentional steps.',
  '## Healthy hair is a practice

A good routine is not complicated. It is consistent. The Wynn Method breaks textured-hair care into simple steps you can repeat.

## The steps

1. **Cleanse** with [Lathyr Gentle Cleansing Shampoo](/products/lathyr-shampoo) every 7 to 10 days.
2. **Condition** with [Uplyft Deep Conditioner](/products/uplyft-conditioner) on wash day.
3. **Treat** with [Revaivl Protein-Rich Conditioner](/products/revaivl-protein-conditioner) once or twice a month.
4. **Moisturize** daily as needed with [Hydrate Herbal Hair Mist](/products/hydrate-herbal-hair-mist).
5. **Seal** with [Nourish Organic Oil Blend](/products/nourish-oil) to lock in moisture.
6. **Style** with [ThairaP Moisture Styling Cream](/products/thairap-moisture-styling-cream) or [Edge Control](/products/edge-control).

## Make it yours

Not every step is needed every day. Start with cleanse, condition, and moisture, then add the rest as your hair asks for it. Not sure where to begin? Try the [Routine Finder](/#routine-finder).',
  '/collections/wynn-method-family.jpeg',
  'Hair Wellness Lab',
  'draft'
),
(
  'ingredient-spotlight-rosemary-castor-aloe',
  'Ingredient Spotlight: Rosemary, Black Castor Oil, and Aloe',
  'A quick, honest look at three botanicals you will see throughout our formulas, and what they actually do for textured hair.',
  '## Familiar ingredients, chosen with intention

We build our formulas around botanicals with a long history in textured-hair care. Here are three you will see often.

## Rosemary

Rosemary is a scalp favorite, traditionally used to support a clean, comfortable scalp and the appearance of fullness. You will find it in [Grow Oil](/products/grow-oil) and throughout the collection.

## Jamaican Black Castor Oil

Rich and cushioning, black castor oil helps coat and soften strands and is a staple for edges and ends. It appears in [Edge Control](/products/edge-control) and our oil blends.

## Aloe Vera

Aloe brings lightweight moisture and slip, which is why it leads the ingredient list in products like [Uplyft Deep Conditioner](/products/uplyft-conditioner) and [Hydrate](/products/hydrate-herbal-hair-mist).

## Read every label

We list full ingredients on each product page so you can make informed choices. Patch test first, and stop use if irritation occurs.',
  '/editorial/wellness-ritual.jpeg',
  'Hair Wellness Lab',
  'draft'
)
ON CONFLICT ("slug") DO NOTHING;
