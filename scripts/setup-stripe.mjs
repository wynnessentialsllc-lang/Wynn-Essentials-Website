#!/usr/bin/env node
/**
 * Provisions the Wynn Essentials catalog in Stripe and writes the resulting IDs
 * back into app/data.ts and .env.local.
 *
 *   node scripts/setup-stripe.mjs            # test mode (sk_test_... required)
 *   node scripts/setup-stripe.mjs --live     # live mode, requires explicit opt-in
 *
 * Safe to re-run. Products are matched by the `wynn_slug` metadata key, so a
 * second run reuses what already exists instead of creating duplicates.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Stripe from "stripe";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");
const dataPath = resolve(root, "app/data.ts");

const LIVE = process.argv.includes("--live");

// Shipping rates created on first run. Amounts are in cents.
// Confirmed by the owner 2026-07-24. A Stripe price is immutable once created,
// so changing these means creating new rates and updating .env.local.
const SHIPPING_RATES = [
  { key: "STRIPE_STANDARD_SHIPPING_RATE_ID", name: "Standard Shipping (3-7 business days)", amount: 595, min: 3, max: 7 },
  { key: "STRIPE_EXPEDITED_SHIPPING_RATE_ID", name: "Expedited Shipping (1-3 business days)", amount: 1495, min: 1, max: 3 },
  { key: "STRIPE_FREE_SHIPPING_RATE_ID", name: "Free U.S. Shipping (3-7 business days)", amount: 0, min: 3, max: 7 },
];

function parseEnv(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function fail(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

if (!existsSync(envPath)) fail("No .env.local found. Copy .env.example to .env.local and add your Stripe secret key first.");

const env = parseEnv(readFileSync(envPath, "utf8"));
const key = env.STRIPE_SECRET_KEY;

if (!key) fail("STRIPE_SECRET_KEY is empty in .env.local.");
if (key.startsWith("sk_live_") && !LIVE) fail("That is a LIVE key. Re-run with --live if you really mean to provision live products.");
if (key.startsWith("sk_test_") && LIVE) fail("--live was passed but STRIPE_SECRET_KEY is a test key.");
if (!key.startsWith("sk_test_") && !key.startsWith("sk_live_")) fail("STRIPE_SECRET_KEY does not look like a Stripe secret key.");

const mode = LIVE ? "LIVE" : "TEST";
const stripe = new Stripe(key);

// Read the catalog straight out of the source file so the script has no build step.
const dataSource = readFileSync(dataPath, "utf8");
const catalog = [...dataSource.matchAll(/\{ slug: "([^"]+)", name: "([^"]+)", subtitle: "([^"]+)",[\s\S]*?size: (?:"([^"]*)"|null), price: ([\d.]+|null),/g)].map(m => ({
  slug: m[1], name: m[2], subtitle: m[3], size: m[4] ?? null, price: m[5] === "null" ? null : Number(m[5]),
}));

if (!catalog.length) fail("Could not parse any products out of app/data.ts.");

console.log(`\n  Wynn Essentials — Stripe provisioning (${mode} mode)`);
console.log(`  ${catalog.length} products found in app/data.ts\n`);

const unpriced = catalog.filter(p => !p.price || p.price <= 0);
if (unpriced.length) fail(`These products have no price and cannot be provisioned: ${unpriced.map(p => p.slug).join(", ")}`);

// ---------- Products and prices ----------
const existingProducts = [];
for await (const product of stripe.products.list({ limit: 100 })) existingProducts.push(product);

const results = [];
for (const item of catalog) {
  const amount = Math.round(item.price * 100);
  let product = existingProducts.find(p => p.metadata?.wynn_slug === item.slug);

  if (product) {
    console.log(`  · ${item.name.padEnd(14)} reusing product ${product.id}`);
  } else {
    product = await stripe.products.create({
      name: `${item.name} — ${item.subtitle}`,
      description: item.size ? `${item.subtitle} · ${item.size}` : item.subtitle,
      metadata: { wynn_slug: item.slug },
      shippable: true,
    });
    console.log(`  + ${item.name.padEnd(14)} created product ${product.id}`);
  }

  const prices = [];
  for await (const price of stripe.prices.list({ product: product.id, active: true, limit: 100 })) prices.push(price);
  let price = prices.find(p => p.unit_amount === amount && p.currency === "usd" && !p.recurring);

  if (price) {
    console.log(`    ${"".padEnd(14)} reusing price   ${price.id} ($${item.price.toFixed(2)})`);
  } else {
    price = await stripe.prices.create({ product: product.id, currency: "usd", unit_amount: amount });
    console.log(`    ${"".padEnd(14)} created price   ${price.id} ($${item.price.toFixed(2)})`);
    // Retire stale prices so only the current one is active on this product.
    for (const stale of prices.filter(p => p.id !== price.id && !p.recurring)) {
      await stripe.prices.update(stale.id, { active: false });
      console.log(`    ${"".padEnd(14)} archived price  ${stale.id}`);
    }
  }

  results.push({ ...item, productId: product.id, priceId: price.id });
}

// ---------- Shipping rates ----------
console.log("");
const existingRates = [];
for await (const rate of stripe.shippingRates.list({ limit: 100, active: true })) existingRates.push(rate);

const rateIds = {};
for (const spec of SHIPPING_RATES) {
  let rate = existingRates.find(r => r.metadata?.wynn_rate === spec.key);
  if (rate) {
    console.log(`  · ${spec.name.padEnd(42)} reusing ${rate.id}`);
  } else {
    rate = await stripe.shippingRates.create({
      display_name: spec.name,
      type: "fixed_amount",
      fixed_amount: { amount: spec.amount, currency: "usd" },
      delivery_estimate: {
        minimum: { unit: "business_day", value: spec.min },
        maximum: { unit: "business_day", value: spec.max },
      },
      metadata: { wynn_rate: spec.key },
    });
    console.log(`  + ${spec.name.padEnd(42)} created ${rate.id}`);
  }
  rateIds[spec.key] = rate.id;
}

// ---------- Write IDs back into app/data.ts ----------
let updated = dataSource;
for (const r of results) {
  const line = updated.split("\n").find(l => l.includes(`{ slug: "${r.slug}",`));
  if (!line) {
    console.warn(`  ! Could not locate the ${r.slug} line in app/data.ts — set its IDs by hand.`);
    continue;
  }
  const rewritten = line
    .replace(/stripeProductId: (?:null|"[^"]*")/, `stripeProductId: "${r.productId}"`)
    .replace(/stripePriceId: (?:null|"[^"]*")/, `stripePriceId: "${r.priceId}"`);
  updated = updated.replace(line, rewritten);
}
writeFileSync(dataPath, updated);
console.log(`\n  ✓ Wrote ${results.length} product/price IDs into app/data.ts`);

// ---------- Write shipping rate IDs back into .env.local ----------
let envText = readFileSync(envPath, "utf8");
for (const [k, v] of Object.entries(rateIds)) {
  envText = new RegExp(`^${k}=.*$`, "m").test(envText)
    ? envText.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`)
    : `${envText.replace(/\n*$/, "")}\n${k}=${v}\n`;
}
writeFileSync(envPath, envText);
console.log(`  ✓ Wrote 3 shipping rate IDs into .env.local`);

console.log(`\n  Done. Next: restart the dev server so it picks up the new .env.local values.\n`);
