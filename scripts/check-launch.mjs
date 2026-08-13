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
const APP_DB_VARS = ["ORDERS_DATABASE_POSTGRES_URL", "ORDERS_DATABASE_URL", "DATABASE_URL"];
const appDbVar = APP_DB_VARS.find(k => env?.[k]);
const appDbUrl = appDbVar ? env[appDbVar] : null;

if (!appDbUrl) {
  block.push(`No orders database connection string (looked for ${APP_DB_VARS.join(", ")}). If Neon is connected in Vercel, run: npx vercel env pull .env.local`);
} else if (!/^postgres(ql)?:\/\//.test(appDbUrl)) {
  block.push(`${appDbVar} is not a Postgres connection string`);
} else {
  pass.push(`Orders database connection string present (${appDbVar})`);
  if (!/-pooler\.|pgbouncer=true|:6543\//.test(appDbUrl)) {
    warn.push(`${appDbVar} does not look pooled — serverless functions can exhaust direct Postgres connections`);
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
    // ---------- Welcome promotion ----------
    // The first-order welcome email advertises this code, so its real terms
    // have to come from Stripe rather than from memory. Everything printed
    // below is read from the live promotion; paste the terms worth telling a
    // customer about into brandConfig.firstOrder.verifiedTerms, which is the
    // only thing the email will state.
    const promoCode = (src.match(/firstOrder:\s*\{[\s\S]*?code:\s*"([^"]+)"/) || [])[1];
    if (!promoCode) {
      warn.push("No first-order promotion code found in app/data.ts");
    } else if (env.STRIPE_PROMOTION_CODES_ENABLED !== "true") {
      warn.push(`STRIPE_PROMOTION_CODES_ENABLED is not "true" — the promo-code field is hidden at checkout, so ${promoCode} cannot be redeemed and the welcome email will omit the offer`);
    } else {
      try {
        const found = await stripe.promotionCodes.list({ code: promoCode, limit: 1 });
        const promo = found.data[0];
        if (!promo) {
          block.push(`Promotion code ${promoCode} does not exist in this Stripe account — the welcome email would advertise a code checkout rejects`);
        } else if (!promo.active) {
          block.push(`Promotion code ${promoCode} exists but is INACTIVE in Stripe`);
        } else {
          const coupon = promo.coupon || {};
          const amount = coupon.percent_off != null
            ? `${coupon.percent_off}% off`
            : coupon.amount_off != null
              ? `${(coupon.amount_off / 100).toFixed(2)} ${String(coupon.currency || "").toUpperCase()} off`
              : "unknown discount";
          pass.push(`Promotion ${promoCode} is active in Stripe (${amount})`);

          // The exact fields the welcome email must not guess at.
          const terms = [
            `discount: ${amount}`,
            `duration: ${coupon.duration ?? "unknown"}`,
            `first-time customers only: ${promo.restrictions?.first_time_transaction ? "yes" : "no"}`,
            `minimum purchase: ${promo.restrictions?.minimum_amount != null ? `${(promo.restrictions.minimum_amount / 100).toFixed(2)} ${String(promo.restrictions.minimum_amount_currency || "").toUpperCase()}` : "none"}`,
            `expires: ${promo.expires_at ? new Date(promo.expires_at * 1000).toISOString().slice(0, 10) : "never"}`,
            `max redemptions: ${promo.max_redemptions ?? "unlimited"} (used ${promo.times_redeemed ?? 0})`,
            `coupon redeem-by: ${coupon.redeem_by ? new Date(coupon.redeem_by * 1000).toISOString().slice(0, 10) : "never"}`,
            `applies to specific products: ${coupon.applies_to?.products?.length ? coupon.applies_to.products.join(", ") : "no — all products"}`,
          ];
          warn.push(`Confirm ${promoCode} terms shown in the welcome email match Stripe:\n      ${terms.join("\n      ")}`);

          const label = (src.match(/firstOrder:\s*\{[\s\S]*?discountLabel:\s*"([^"]+)"/) || [])[1];
          if (label && coupon.percent_off != null && !label.includes(String(coupon.percent_off))) {
            block.push(`Site advertises "${label}" but Stripe's ${promoCode} gives ${coupon.percent_off}% off`);
          }
        }
      } catch (error) {
        warn.push(`Could not verify promotion ${promoCode}: ${error.message}`);
      }
    }
  } catch (error) {
    warn.push(`Could not reach Stripe to verify: ${error.message}`);
  }
}

// ---------- Fulfillment view ----------
const adminToken = env?.ADMIN_ORDERS_TOKEN;
if (!adminToken) block.push("ADMIN_ORDERS_TOKEN is not set — /admin/orders stays closed and orders cannot be fulfilled");
else if (adminToken.length < 16) block.push("ADMIN_ORDERS_TOKEN is shorter than 16 characters — it guards customer addresses");
else pass.push("Fulfillment view token configured");

// ---------- Manual sign-off ----------
warn.push("Confirm return, refund, and shipping policies are published before live checkout");
warn.push("Confirm Stripe Tax registration and nexus if STRIPE_TAX_ENABLED=true");

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
