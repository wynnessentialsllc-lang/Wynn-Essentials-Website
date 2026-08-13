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
    // ADMINISTRATIVE CHECK ONLY. Nothing at website runtime calls Stripe to
    // resolve the offer — the secret key stays out of the request path, and the
    // email renders from terms a human recorded in app/data.ts. This is how
    // those terms get verified before a deploy.
    //
    // It reports every restriction WITHOUT GUESSING, and it never treats a
    // coupon's NAME as a rule: a coupon called "First order 15% off" proves
    // nothing about first-time-transaction eligibility.
    const promoCode = (src.match(/firstOrder:\s*\{[\s\S]*?code:\s*"([^"]+)"/) || [])[1];
    const promoLabel = (src.match(/firstOrder:\s*\{[\s\S]*?discountLabel:\s*"([^"]+)"/) || [])[1];

    if (!promoCode) {
      warn.push("No welcome promotion code found in app/data.ts");
    } else if (env.STRIPE_PROMOTION_CODES_ENABLED !== "true") {
      warn.push(`STRIPE_PROMOTION_CODES_ENABLED is not "true" — the promo-code field is hidden at checkout, so ${promoCode} cannot be redeemed and the welcome email omits the offer entirely`);
    } else {
      try {
        // 1. Exists in THIS account and mode. `live` is derived from the key
        //    prefix above, so a test-mode key checking a live promotion is
        //    reported as the mismatch it is.
        const found = await stripe.promotionCodes.list({ code: promoCode, limit: 100 });
        const promo = found.data.find(p => p.code === promoCode);
        if (!promo) {
          block.push(`Promotion code ${promoCode} does not exist in this Stripe account (${live ? "LIVE" : "test"} mode) — the welcome email would advertise a code checkout rejects`);
        } else {
          const coupon = promo.coupon || {};

          // 2 + 3. The promotion code and its coupon must BOTH be usable.
          if (!promo.active) block.push(`Promotion code ${promoCode} exists but is INACTIVE in Stripe`);
          if (coupon.valid === false) block.push(`The coupon behind ${promoCode} is INVALID in Stripe (expired, or its redemption limit is reached)`);

          // 4. Exactly 15% — not "about", not a fixed amount.
          if (coupon.percent_off == null) {
            block.push(`${promoCode} is not a percentage coupon (${coupon.amount_off != null ? `${(coupon.amount_off / 100).toFixed(2)} ${String(coupon.currency || "").toUpperCase()} off` : "unknown discount"}) — the site advertises "${promoLabel ?? "a percentage"}"`);
          } else if (coupon.percent_off !== 15) {
            block.push(`${promoCode} gives ${coupon.percent_off}% off, but the site advertises "${promoLabel ?? "15% off"}"`);
          }
          if (promoLabel && coupon.percent_off != null && !promoLabel.includes(String(coupon.percent_off))) {
            block.push(`Site advertises "${promoLabel}" but Stripe's ${promoCode} gives ${coupon.percent_off}% off`);
          }

          // 5. Duration. "once" means the discount applies once WHEN REDEEMED.
          //    It is not a cap on how many customers may redeem it.
          if (coupon.duration !== "once") {
            block.push(`${promoCode} has duration "${coupon.duration}", not "once" — the email says the discount applies to one eligible order`);
          }

          if (promo.active && coupon.valid !== false && coupon.percent_off === 15 && coupon.duration === "once") {
            pass.push(`Promotion ${promoCode} verified in Stripe: active, valid coupon, 15% off, duration once`);
          }

          // 6. Report the rest verbatim, distinguishing what IS configured from
          //    what is simply not set. Nothing here is inferred.
          const unset = "not set in Stripe — the email claims nothing either way";
          const facts = [
            `first-time transaction only: ${promo.restrictions?.first_time_transaction === true ? "YES — enforced by Stripe" : unset}`,
            `minimum purchase: ${promo.restrictions?.minimum_amount != null ? `${(promo.restrictions.minimum_amount / 100).toFixed(2)} ${String(promo.restrictions.minimum_amount_currency || "").toUpperCase()} — enforced by Stripe` : unset}`,
            `expiration: ${promo.expires_at ? `${new Date(promo.expires_at * 1000).toISOString().slice(0, 10)} — enforced by Stripe` : "none listed"}`,
            `coupon redeem-by: ${coupon.redeem_by ? `${new Date(coupon.redeem_by * 1000).toISOString().slice(0, 10)} — enforced by Stripe` : "none listed"}`,
            // These two are routinely confused. Keep them apart, always.
            `MAX redemptions (a limit): ${promo.max_redemptions ?? unset}`,
            `times redeemed (historical usage, NOT a limit, never shown to customers): ${promo.times_redeemed ?? 0}`,
            `coupon max redemptions (a limit): ${coupon.max_redemptions ?? unset}`,
            `restricted to one customer: ${promo.customer ? "YES — this code only works for one specific customer" : unset}`,
            `product scope: ${coupon.applies_to?.products?.length ? `LIMITED to ${coupon.applies_to.products.length} product(s) — enforced by Stripe` : unset}`,
          ];
          warn.push(`${promoCode} restrictions, as configured in Stripe. Only state these in customer-facing copy if they appear above as enforced:\n      ${facts.join("\n      ")}`);

          // A code locked to a single customer must never go out in a broadcast.
          if (promo.customer) {
            block.push(`${promoCode} is restricted to a single Stripe customer — it must not be emailed to subscribers`);
          }
          // A limit that is nearly spent will start failing at checkout.
          const limit = promo.max_redemptions ?? coupon.max_redemptions;
          if (limit != null && (promo.times_redeemed ?? 0) >= limit) {
            block.push(`${promoCode} has reached its redemption limit (${promo.times_redeemed}/${limit}) — it can no longer be redeemed`);
          }

          // 8. Cross-check the copy the email will actually print.
          const verified = (src.match(/verifiedTerms:\s*\{([\s\S]*?)\n    \}/) || [])[1] ?? "";
          if (/first[- ]time|first order|your first/i.test(verified)) {
            block.push(`brandConfig.firstOrder.verifiedTerms claims first-order eligibility, which Stripe ${promo.restrictions?.first_time_transaction === true ? "does enforce — but say so only in those words" : "does NOT enforce"}`);
          }
          if (/no minimum|unlimited|all products|every product/i.test(verified)) {
            block.push("brandConfig.firstOrder.verifiedTerms claims an absence of restrictions (no minimum / unlimited / all products). Stripe not setting a restriction is not a promise to the customer that none applies");
          }
          if (/no listed expiration/i.test(verified) && (promo.expires_at || coupon.redeem_by)) {
            block.push(`brandConfig.firstOrder.verifiedTerms says "no listed expiration", but Stripe now has one set for ${promoCode}`);
          }
        }
      } catch (error) {
        // 7. Never pass by accident: an unverifiable promotion blocks.
        block.push(`Could not verify promotion ${promoCode} — treat as unverified: ${error.message}`);
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
