#!/usr/bin/env node
/**
 * Launch preflight. Reports what still stands between the current state and
 * taking real orders. Verifies the local catalog against the live Stripe
 * account when a key is present, so a price shown on the site can never drift
 * from the price a customer is actually charged.
 *
 *   npm run stripe:check
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Stripe from "stripe";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");
const dataPath = resolve(root, "app/data.ts");

const pass = [];
const warn = [];
const block = [];

function parseEnv(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : null;
if (!env) block.push(".env.local is missing — copy .env.example to .env.local");

const key = env?.STRIPE_SECRET_KEY;
const live = key?.startsWith("sk_live_");
if (!key) block.push("STRIPE_SECRET_KEY is not set in .env.local");
else pass.push(`Stripe secret key present (${live ? "LIVE" : "test"} mode)`);

if (!env?.STRIPE_WEBHOOK_SECRET) block.push("STRIPE_WEBHOOK_SECRET is not set — paid orders will not be recorded");
else pass.push("Webhook signing secret present");

for (const k of ["STRIPE_STANDARD_SHIPPING_RATE_ID", "STRIPE_EXPEDITED_SHIPPING_RATE_ID"]) {
  if (!env?.[k]) block.push(`${k} is not set — checkout returns 503`);
}
if (!env?.STRIPE_FREE_SHIPPING_RATE_ID) warn.push("STRIPE_FREE_SHIPPING_RATE_ID is not set — the 'free shipping over $50' promise will not be honored at checkout");
if (env?.STRIPE_STANDARD_SHIPPING_RATE_ID && env?.STRIPE_EXPEDITED_SHIPPING_RATE_ID) pass.push("Shipping rates configured");

const siteUrl = env?.NEXT_PUBLIC_SITE_URL || "";
if (live && siteUrl.includes("localhost")) block.push("NEXT_PUBLIC_SITE_URL still points at localhost while using a live key");
else if (siteUrl) pass.push(`Site URL: ${siteUrl}`);

// ---------- Catalog ----------
const src = readFileSync(dataPath, "utf8");
const catalog = [...src.matchAll(/\{ slug: "([^"]+)", name: "([^"]+)",[\s\S]*?price: ([\d.]+|null),[\s\S]*?stripeProductId: (null|"[^"]*"), stripePriceId: (null|"[^"]*")/g)].map(m => ({
  slug: m[1], name: m[2],
  price: m[3] === "null" ? null : Number(m[3]),
  productId: m[4] === "null" ? null : m[4].slice(1, -1),
  priceId: m[5] === "null" ? null : m[5].slice(1, -1),
}));

const unconfigured = catalog.filter(p => !p.priceId || !p.productId);
if (unconfigured.length) block.push(`${unconfigured.length} of ${catalog.length} products have no Stripe IDs (${unconfigured.map(p => p.name).join(", ")}) — run: npm run stripe:setup`);
else pass.push(`All ${catalog.length} products have Stripe product and price IDs`);

// ---------- Order persistence ----------
if (!env?.ORDERS_DATABASE_URL) block.push("ORDERS_DATABASE_URL is not set — paid orders cannot be stored");
else if (!/^postgres(ql)?:\/\//.test(env.ORDERS_DATABASE_URL)) block.push("ORDERS_DATABASE_URL is not a Postgres connection string");
else {
  pass.push("Orders database connection string present");
  if (!/-pooler\.|pgbouncer=true|:6543\//.test(env.ORDERS_DATABASE_URL)) {
    warn.push("ORDERS_DATABASE_URL does not look pooled — serverless functions can exhaust direct Postgres connections");
  }
}

const webhookSrc = readFileSync(resolve(root, "app/api/stripe/webhook/route.ts"), "utf8");
if (!/insert\(orders\)/.test(webhookSrc)) block.push("Webhook does not persist orders to the database");
else pass.push("Webhook persists orders with replay protection");

// ---------- Verify against Stripe ----------
if (key && !unconfigured.length) {
  const stripe = new Stripe(key);
  try {
    for (const item of catalog) {
      let price;
      try { price = await stripe.prices.retrieve(item.priceId); }
      catch { block.push(`${item.name}: price ${item.priceId} does not exist in this Stripe account (wrong mode?)`); continue; }
      if (!price.active) block.push(`${item.name}: price ${item.priceId} is archived in Stripe`);
      const expected = Math.round(item.price * 100);
      if (price.unit_amount !== expected) {
        block.push(`${item.name}: site shows $${item.price.toFixed(2)} but Stripe charges $${(price.unit_amount / 100).toFixed(2)}`);
      }
    }
    if (!block.some(b => b.includes("Stripe charges") || b.includes("does not exist"))) {
      pass.push("Every displayed price matches the amount Stripe will charge");
    }

    for (const [label, id] of [["standard", env.STRIPE_STANDARD_SHIPPING_RATE_ID], ["expedited", env.STRIPE_EXPEDITED_SHIPPING_RATE_ID], ["free", env.STRIPE_FREE_SHIPPING_RATE_ID]]) {
      if (!id) continue;
      try {
        const rate = await stripe.shippingRates.retrieve(id);
        if (!rate.active) warn.push(`${label} shipping rate ${id} is archived in Stripe`);
      } catch { block.push(`${label} shipping rate ${id} does not exist in this Stripe account`); }
    }
  } catch (error) {
    warn.push(`Could not reach Stripe to verify: ${error.message}`);
  }
}

// ---------- Manual sign-off ----------
warn.push("Confirm return, refund, and shipping policies are published before live checkout");
warn.push("Confirm Stripe Tax registration and nexus if STRIPE_TAX_ENABLED=true");
warn.push("Confirm a fulfillment process exists for reading new orders out of the database");

// ---------- Report ----------
const g = s => `\x1b[32m${s}\x1b[0m`, y = s => `\x1b[33m${s}\x1b[0m`, r = s => `\x1b[31m${s}\x1b[0m`, dim = s => `\x1b[2m${s}\x1b[0m`;
console.log(`\n  ${dim("Wynn Essentials — launch preflight")}\n`);
for (const p of pass) console.log(`  ${g("✓")} ${p}`);
if (warn.length) { console.log(""); for (const w of warn) console.log(`  ${y("!")} ${w}`); }
if (block.length) { console.log(""); for (const b of block) console.log(`  ${r("✗")} ${b}`); }

console.log("");
if (block.length) {
  console.log(`  ${r(`Not ready to take orders — ${block.length} blocker${block.length > 1 ? "s" : ""} above.`)}\n`);
  process.exit(1);
}
console.log(`  ${g("Ready to take orders.")} ${dim(`${warn.length} item${warn.length === 1 ? "" : "s"} still need your sign-off.`)}\n`);
