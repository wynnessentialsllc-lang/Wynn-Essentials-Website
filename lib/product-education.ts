// What each product is, what it does, and when to reach for it — the content
// behind the post-purchase education email.
//
// THE CLAIM RULE
//
// Nothing here may say more about a product than app/data.ts already says. Each
// entry is written from that product's own `benefit`, `description` and
// `directions`, and the "how to use it" line is not written here at all: the
// email prints `product.directions` verbatim, so usage guidance can never drift
// from the catalog, the product page, or the label.
//
// What that rules out, on purpose: results, timeframes, and quantities nobody
// verified — no "grows hair X inches", no "repairs damage", no "in two weeks".
// The scenarios are situations to use something IN, not outcomes to expect FROM
// it. Where the catalog warns about something (Revaivl's no-heat, twice-monthly
// treatment; Edge Control's buildup and tension), the warning is carried here
// rather than quietly dropped, because the part a customer most needs after
// buying is the part that keeps them from using it wrong.
//
// The tone is the storefront's: plain, practical, no exclamation marks.

import { products, type Product } from "../app/data";

export type EducationScenario = {
  /** The situation she is actually in, in her words. */
  when: string;
  /** What to do about it with this product. */
  then: string;
};

export type ProductEducation = {
  /** What the thing physically is — form, size, the ingredients it leads with. */
  whatItIs: string;
  /** What it does, in the catalog's own terms. */
  whatItDoes: string;
  /** Where it sits in a routine, and how often. */
  rhythm: string;
  /** Two or three moments to reach for it. */
  scenarios: EducationScenario[];
  /** What it works with — only where the catalog's directions already say so. */
  pairsWith?: string;
  /** The mistake worth naming, where the catalog names it. */
  goEasy?: string;
};

/**
 * A bundle is not a thing to explain — it is the things inside it. A bundle
 * buyer gets a section for each product it contains, in routine order, exactly
 * as if she had bought them separately.
 */
const BUNDLE_CONTENTS: Record<string, string[]> = {
  "hair-wellness-bundle": ["lathyr-shampoo", "uplyft-conditioner", "hydrate-herbal-hair-mist", "nourish-oil"],
};

// Braiding hair is four products with one story, so the story is written once
// and each texture named where it belongs.
const bohoEducation = (texture: string): ProductEducation => ({
  whatItIs: `18 inches of premium human hair bulk in a natural colour, in the ${texture} texture. One bundle per pack.`,
  whatItDoes: "Braid-ready texture with soft movement, meant to blend naturally into boho braids and protective styles.",
  rhythm: "For professional or at-home braiding. A full style usually takes more than one bundle.",
  scenarios: [
    { when: "You're booking an appointment", then: "Ask your braider how many bundles your length and fullness will need before your date — one pack is one bundle." },
    { when: "You're braiding it yourself", then: "Separate and lay out the bundle before you start, so the texture stays even from the first braid to the last." },
    { when: "The style is in and your scalp is asking for attention", then: "Mist Hydrate along the parts and use Relief on any dry or itchy areas — the hair being braided in does not change what your own scalp needs." },
  ],
  goEasy: "Natural colour, 18 inches. Colouring or heat-styling human hair bulk is a decision to make with your stylist, not on the day of install.",
});

/**
 * The education content, keyed by catalog slug. Every product in app/data.ts
 * has an entry — a purchase that arrives with nothing to say about it is the
 * one outcome this feature exists to prevent — and a test holds that line.
 */
export const productEducation: Record<string, ProductEducation> = {
  "lathyr-shampoo": {
    whatItIs: "An 8 oz sulfate-free shampoo built on aloe vera juice, with organic oils and plant extracts through it.",
    whatItDoes: "Cleanses from roots to ends while helping restore moisture balance, reduce breakage, and refresh the scalp.",
    rhythm: "Wash day — every 7 to 10 days.",
    scenarios: [
      { when: "Oils and creams have built up and your hair feels weighed down", then: "Cleanse from roots to ends, rinse, and repeat only if it still feels coated." },
      { when: "You've just taken down a protective style", then: "Start here. A gentle cleanse resets the scalp before you condition and re-style." },
      { when: "It's the start of a full wash day", then: "This is step one of six in The Wynn Method — everything after it works better on clean hair." },
    ],
    pairsWith: "Uplyft Conditioner, straight after, on the same wash day.",
    goEasy: "Massage gently rather than piling your hair on top of itself — that is what causes the tangling.",
  },
  "uplyft-conditioner": {
    whatItIs: "An 8 oz peach-and-honey deep conditioner with aloe vera, honey, black castor oil, olive and sweet almond oils. No parabens, sulfates, or gluten.",
    whatItDoes: "Melts into dry or damaged hair to restore softness — hydration, softness, strength, and shine.",
    rhythm: "Every wash day, or one to two times a week.",
    scenarios: [
      { when: "Your hair feels rough or squeaky after cleansing", then: "Apply generously to clean, damp hair, cap it, and give it the full 20 minutes." },
      { when: "You have detangling ahead of you", then: "Condition first. The slip is what lets you work through your hair without fighting it." },
      { when: "Your hair feels parched after heat or a long protective style", then: "Use medium dryer heat over the cap for deeper penetration, then rinse thoroughly." },
    ],
    pairsWith: "Lathyr before it; Hydrate and Nourish once you're out of the shower.",
  },
  "revaivl-protein-conditioner": {
    whatItIs: "An 8 oz protein-rich conditioner with rice protein, flax seed oil, rice bran oil, panthenol, and vitamin E.",
    whatItDoes: "Helps rebuild, smooth, soften, and strengthen tired strands without heaviness.",
    rhythm: "One to two times a month. This is a treatment, not a weekly step.",
    scenarios: [
      { when: "Strands stretch and snap instead of springing back", then: "Work it through the mid-lengths and ends, where the damage usually is, and detangle gently while it's on." },
      { when: "You've been colouring or using heat", then: "Book it into your month the way you'd book a trim — regularly, not reactively." },
      { when: "Your ends feel weak but your roots feel fine", then: "Focus it from the mid-lengths down and leave the new growth alone." },
    ],
    pairsWith: "A moisturizing leave-in straight after — Hydrate does that job.",
    goEasy: "Room temperature, 10 to 15 minutes, no heat. More protein more often is not more strength, which is why the catalog says once or twice a month and means it.",
  },
  "hydrate-herbal-hair-mist": {
    whatItIs: "A 12 oz leave-in mist of organic aloe vera leaf juice, strengthening herbs, and light oils, in a spray bottle.",
    whatItDoes: "Revitalizing leave-in moisture for dry hair and scalp. Leaves hair soft, smooth, and manageable while helping relieve dryness, flakiness, and itchiness.",
    rhythm: "Daily or every other day, on dry or damp hair.",
    scenarios: [
      { when: "Your braids or twists feel tight and dry a few days in", then: "Mist along the length and the parts, focusing on the tight areas, then smooth it in gently." },
      { when: "Day-three curls have gone flat", then: "Mist lightly and scrunch — you get your pattern back without rewetting your whole head." },
      { when: "Your scalp feels dry or flaky under a style", then: "Mist directly onto the exposed scalp and work it in with your fingertips." },
    ],
    pairsWith: "Nourish Oil, applied straight after, to seal the moisture in.",
  },
  "nourish-oil": {
    whatItIs: "A 2 oz organic blend — sunflower, coconut, shea butter, jojoba, olive and grapeseed oils, finished with cedarwood, lavender, and peppermint.",
    whatItDoes: "Nourishes and revitalizes hair, and seals moisture in after you've added it.",
    rhythm: "Two to four times a week, on the scalp and/or the ends.",
    scenarios: [
      { when: "You've just misted with Hydrate", then: "Warm a few drops between your palms and press them over the same areas. Moisture goes on first, oil goes on second to keep it there." },
      { when: "Your ends look dull between wash days", then: "A few drops through the ends, nothing more." },
      { when: "Your hair is damp after a wash", then: "This is the best moment for it — apply while there's still water in the hair to seal." },
    ],
    pairsWith: "Hydrate first, always. Oil on dry hair with no moisture under it seals in exactly what's there.",
    goEasy: "Shake well, and start with less than you think. This is a 2 oz bottle of concentrated oils, not a leave-in.",
  },
  "grow-oil": {
    whatItIs: "A 2 oz organic blend of black seed, Jamaican black castor, safflower, coconut, avocado, rosemary, and ylang ylang oils.",
    whatItDoes: "Nourishes the scalp and supports stronger, healthier-looking hair, made with thinning and breakage concerns in mind.",
    rhythm: "Two to three times a week, on a clean or refreshed scalp.",
    scenarios: [
      { when: "Certain areas are thinner or slower than the rest", then: "Part to the scalp and focus there rather than spreading it over everything." },
      { when: "You've just taken down a style that pulled", then: "Give your perimeter a gentle one-to-two-minute massage while the scalp is clear." },
      { when: "It's mid-week and your scalp is clean", then: "This is a scalp step, not a length step — part, apply, massage, and style as usual." },
    ],
    goEasy: "Massage for one to two minutes and don't rinse it out. Apply to a clean or refreshed scalp — on top of buildup it has nothing to reach.",
  },
  "relief-oil": {
    whatItIs: "A 2 oz targeted organic scalp oil with almond, jojoba, babassu, black cumin seed, and Jamaican black castor oils, plus tea tree, lemongrass and rose.",
    whatItDoes: "Deeply hydrates the scalp, relieves dryness and irritation, reduces itchiness, and helps combat dandruff — especially during protective styling or dry seasons.",
    rhythm: "One to three times a week, or as needed.",
    scenarios: [
      { when: "Your scalp is itching under braids, locs, or a weave", then: "Part in sections and apply only to the areas that are asking for it." },
      { when: "The weather has turned and you're seeing flakes", then: "Work it in gently until it absorbs — this is the seasonal one." },
      { when: "You've just taken a style down and your scalp feels tight", then: "Use it on the tight areas before you cleanse and re-style." },
    ],
    goEasy: "Go light and part into sections. Heavy application is not more relief — it is just more product sitting on your scalp.",
  },
  "thairap-moisture-styling-cream": {
    whatItIs: "An 8 oz styling cream — rich but lightweight — with shea butter, castor oil, aloe vera, rice bran oil, and lavender.",
    whatItDoes: "Softens, moisturizes, and defines without stiffness or weight. Made for touchable twist-outs, braid-outs, wash-and-gos, protective styles, and everyday moisture.",
    rhythm: "Whenever you're styling, on damp or dry hair.",
    scenarios: [
      { when: "You're setting a twist-out or braid-out", then: "Work a small amount from root to tip on each section before you twist, so the definition is in the set rather than added after." },
      { when: "You're doing a wash-and-go", then: "Apply to soaking or damp hair and let your pattern do the rest." },
      { when: "The leave-out on a protective style needs smoothing", then: "A little through the loose hair blends it without the crunch." },
    ],
    pairsWith: "Mist with Hydrate first, then style with ThairaP.",
    goEasy: "A small amount, built up if you need it. This is a cream, and a cream applied heavily is what makes hair feel weighed down.",
  },
  "edge-control": {
    whatItIs: "A 4 oz hydrating edge control with castor oil, olive fruit oil, aloe vera leaf juice, and hydrolyzed silk.",
    whatItDoes: "Tames frizz, smooths the hairline, and supports healthy-looking edges.",
    rhythm: "As needed, up to two to four times a week.",
    scenarios: [
      { when: "You're finishing a sleek bun or ponytail", then: "A small amount on clean, moisturized edges, smoothed with a fingertip or a soft edge brush." },
      { when: "It's mid-week and your hairline has gone fuzzy", then: "Smooth what's there rather than re-doing the whole style." },
      { when: "You've just had braids installed", then: "Wait until your hairline is calm, then use it lightly — your edges have already had a day of tension." },
    ],
    goEasy: "Avoid excessive brushing, tension, and daily buildup. Edges are the part of your hair with the least margin for all three.",
  },
  "soft-life-bonnet": {
    whatItIs: "A satin-lined bonnet with a comfortable stretch band, one size.",
    whatItDoes: "Protects braids, curls, and edges while you sleep by reducing friction, frizz, and overnight moisture loss.",
    rhythm: "Nightly — every night, not only the night after a fresh style.",
    scenarios: [
      { when: "You've just had a silk press or a set you want to keep", then: "Bonnet from the first night. A style lasts as long as its nights do." },
      { when: "You've misted and sealed before bed", then: "Cover it — the bonnet is what keeps that moisture in your hair instead of on your pillow." },
      { when: "You're wearing braids or twists", then: "Tuck the length in gently rather than pulling it tight at the hairline." },
    ],
    goEasy: "Cotton pillowcases pull moisture and rough up the cuticle. That is the friction this is here to remove.",
  },
  "heritage-hold-scrunchie-set": {
    whatItIs: "Satin scrunchies, sold as the Uptown Collection (set of 3) or the Estate Collection (set of 4).",
    whatItDoes: "Secures curls, protective styles, and silk presses with less friction and tension than a standard elastic.",
    rhythm: "In place of an elastic, any time you gather your hair.",
    scenarios: [
      { when: "You're pineappling before bed", then: "Gather loosely at the crown — the satin is what keeps the crease and the tension out of it." },
      { when: "You want a bun that doesn't leave a dent", then: "Use it in place of your usual elastic and keep it loose enough to slide." },
      { when: "You're gathering braids or locs", then: "Their weight is exactly why the surface you tie them with matters." },
    ],
  },
  "hair-wellness-bundle": {
    whatItIs: "The four-step system: Lathyr, Uplyft, Hydrate, and Nourish.",
    whatItDoes: "Covers cleansing, conditioning, daily hydration, and moisture-sealing care as one routine.",
    rhythm: "Cleanse with Lathyr every 7 to 10 days, condition with Uplyft on wash day, refresh with Hydrate as needed, and seal with Nourish two to four times a week.",
    scenarios: [
      { when: "It's wash day", then: "Lathyr, then Uplyft. Those two belong to the same afternoon." },
      { when: "It's any other day", then: "Hydrate when your hair feels dry, Nourish straight after to hold it there." },
      { when: "You're not sure where to start", then: "Start with a wash day. Everything else in the system is built on top of clean, conditioned hair." },
    ],
  },
  "boho-body-wave-18": bohoEducation("Body Wave"),
  "boho-bohemian-curl-18": bohoEducation("Bohemian Curl"),
  "boho-deep-wave-18": bohoEducation("Deep Wave"),
  "boho-spanish-curl-18": bohoEducation("Spanish Curl"),
};

/** One product's worth of email: the catalog facts plus the education entry. */
export type EducationCard = {
  slug: string;
  name: string;
  subtitle: string;
  size: string | null;
  /** Printed verbatim from the catalog, so usage can never drift from the label. */
  directions: string;
  url: string;
  /**
   * The email build of the product's photograph (public/email/products), which
   * exists as a JPEG for every product — Outlook for Windows renders neither
   * WebP nor AVIF, and six of the catalog's products are shot only in those.
   */
  image: { src: string; alt: string } | null;
  education: ProductEducation;
};

/** The order a routine actually runs in: wash day first, then the rest. */
function routineOrder(a: Product, b: Product): number {
  const step = (p: Product) => (p.methodStep > 0 ? p.methodStep : 99);
  return step(a) - step(b);
}

/**
 * Turns an order's stored line items into the sections its email should carry.
 *
 * Line items are matched on Stripe product id, the same way the review-request
 * cron matches them. Bundles expand into their contents, duplicates collapse,
 * and anything the catalog no longer sells — or has no education written for —
 * is simply left out rather than guessed at.
 */
export function educationFor(items: { productId?: string | null }[], siteUrl: string): EducationCard[] {
  const slugs: string[] = [];
  for (const item of items) {
    const product = products.find(p => p.stripeProductId && p.stripeProductId === item.productId);
    if (!product) continue;
    for (const slug of BUNDLE_CONTENTS[product.slug] ?? [product.slug]) {
      if (!slugs.includes(slug)) slugs.push(slug);
    }
  }
  return slugs
    .map(slug => products.find(p => p.slug === slug))
    .filter((p): p is Product => Boolean(p && productEducation[p.slug]))
    .sort(routineOrder)
    .map(p => ({
      slug: p.slug,
      name: p.name,
      subtitle: p.subtitle,
      size: p.size,
      directions: p.directions,
      url: `${siteUrl.replace(/\/+$/, "")}/products/${p.slug}`,
      image: p.images?.[0] ? { src: `/email/products/${p.slug}.jpg`, alt: p.images[0].alt } : null,
      education: productEducation[p.slug],
    }));
}
