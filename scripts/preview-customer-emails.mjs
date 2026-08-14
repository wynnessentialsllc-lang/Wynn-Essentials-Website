#!/usr/bin/env node
/**
 * Renders the five shorter customer emails to disk for review. Sends nothing.
 *
 *   npm run email:preview:customer
 *
 * These are the messages that share lib/customer-email.ts — the waitlist
 * confirmation, the abandoned-cart reminder, the back-in-stock note, the
 * shipping confirmation, and the review request.
 *
 * A throwaway signing secret is pinned before the module loads, so a preview can
 * never produce a working unsubscribe link, and NEXT_PUBLIC_SITE_URL is cleared
 * so image URLs resolve against production rather than a developer's localhost.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "build/email-previews/customer");

process.env.UNSUBSCRIBE_SECRET = "preview-only-not-a-real-secret";
delete process.env.NEXT_PUBLIC_SITE_URL;

const { customerEmail, productLine, totalLine, detailRows, noteCard, mailableImage } =
  await import(pathToFileURL(resolve(root, "lib/customer-email.ts")).href);
const { emailUrl, BRAND, button } = await import(pathToFileURL(resolve(root, "lib/email-brand.ts")).href);
const { trackingUrl } = await import(pathToFileURL(resolve(root, "lib/carrier-tracking.ts")).href);

const money = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

// The same shapes lib/notify.ts builds, kept here so the preview exercises the
// blocks rather than re-implementing the messages.
const cart = [
  { slug: "uplyft-conditioner", name: "Uplyft Deep Conditioner", quantity: 1, price: 24.99 },
  { slug: "nourish-oil", name: "Nourish Organic Oil Blend", quantity: 2, price: 21.99 },
];
const reviewProducts = [
  { name: "Hydrate", slug: "hydrate-herbal-hair-mist", url: "https://wynnessentialsllc.us/products/hydrate-herbal-hair-mist" },
  { name: "Lathyr", slug: "lathyr-shampoo", url: "https://wynnessentialsllc.us/products/lathyr-shampoo" },
];

const messages = {
  waitlist: customerEmail({
    subject: "You're on the waitlist — Bohemian Curl",
    preheader: "We'll email you the moment Bohemian Curl is back.",
    eyebrow: "YOU'RE ON THE LIST",
    heading: "We&rsquo;ll tell you<br>the moment it&rsquo;s back.",
    intro: "Thanks for your interest in <strong>Bohemian Curl</strong>.",
    bodyHtml: noteCard("We&rsquo;ll email you once &mdash; as soon as <strong>Bohemian Curl</strong> is back in stock. No need to check back, and nothing else is added to your inbox."),
    cta: { label: "Browse the essentials", url: emailUrl("/#shop") },
    text: "We'll email you once — as soon as Bohemian Curl is back in stock.",
  }),
  "abandoned-cart": customerEmail({
    subject: "You left something in your bag",
    preheader: "Your picks are still here whenever you're ready.",
    eyebrow: "YOUR BAG IS WAITING",
    heading: "Still here,<br>whenever you are.",
    intro: "Nothing has moved &mdash; your hair-care picks are exactly where you left them.",
    bodyHtml: cart.map(i => productLine({
      name: i.name, meta: `Qty ${i.quantity}`, amount: money(Math.round(i.price * 100)), image: mailableImage(i.slug),
    })).join("")
      + totalLine("Subtotal", money(Math.round((24.99 + 21.99 * 2) * 100)))
      + `<div style="margin-top:26px">${noteCard("Still deciding? Use <strong>WELCOME15</strong> for 15% off on one eligible order. Offer availability is confirmed at checkout.")}</div>`,
    cta: { label: "Return to your bag", url: emailUrl("/#shop") },
    unsubscribeEmail: "customer@example.com",
    text: "Uplyft Deep Conditioner × 1\nNourish Organic Oil Blend × 2",
  }),
  restock: customerEmail({
    subject: "Nourish is back in stock",
    preheader: "Nourish is available again.",
    eyebrow: "BACK IN STOCK",
    heading: "It&rsquo;s back.",
    intro: "You asked us to tell you when <strong>Nourish</strong> returned. It has.",
    bodyHtml: productLine({ name: "Nourish", meta: "Back in stock", image: mailableImage("nourish-oil") }),
    cta: { label: "Shop Nourish", url: "https://wynnessentialsllc.us/products/nourish-oil" },
    text: "Nourish is back in stock.",
  }),
  shipped: customerEmail({
    subject: "Your Wynn Essentials order has shipped — WE-1042",
    preheader: "Tracking 9400111899223197428490 is on its way to you.",
    eyebrow: "ON ITS WAY",
    heading: "It&rsquo;s out the door.",
    intro: "Hi Sheree &mdash; your order has shipped.",
    bodyHtml: detailRows([
      { label: "Carrier", value: "USPS" },
      { label: "Tracking #", value: "9400111899223197428490" },
      { label: "Order", value: "WE-1042" },
    ]),
    cta: { label: "Track your package", url: trackingUrl("usps", "9400111899223197428490") },
    closing: "Once it lands, we&rsquo;ll send you everything you need to know about what&rsquo;s inside.",
    text: "Carrier: USPS\nTracking #: 9400111899223197428490",
  }),
  "review-request": customerEmail({
    subject: "How are you loving your Wynn Essentials?",
    preheader: "A minute of your time helps someone else find what works.",
    eyebrow: "A FEW WEEKS IN",
    heading: "How&rsquo;s your hair<br>loving it?",
    intro: "Hi Sheree &mdash; you&rsquo;ve had a little while with your order now. An honest word about how it went helps the next person find what works for their hair.",
    bodyHtml: reviewProducts.map(p => `${productLine({
      name: p.name, meta: "How has it worked for your hair?", image: mailableImage(p.slug),
    })}<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 8px"><tr><td>${button("LEAVE A REVIEW", p.url, "left", BRAND.cream, BRAND.black, BRAND.black)}</td></tr></table>`).join(""),
    closing: "Order reference: WE-1042",
    unsubscribeEmail: "customer@example.com",
    text: reviewProducts.map(p => `  · ${p.name} — ${p.url}`).join("\n"),
  }),
};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const kb = (s) => `${(Buffer.byteLength(s, "utf8") / 1024).toFixed(1)}KB`;
for (const [key, message] of Object.entries(messages)) {
  writeFileSync(resolve(outDir, `${key}.html`), message.html);
  writeFileSync(resolve(outDir, `${key}.txt`), message.text);
  console.log(`${key.padEnd(16)} ${kb(message.html).padStart(8)} HTML  ${kb(message.text).padStart(7)} text  ${message.subject}`);
}
console.log(`\nWrote ${Object.keys(messages).length * 2} files to ${outDir}`);
