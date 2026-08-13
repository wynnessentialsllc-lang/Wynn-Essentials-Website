#!/usr/bin/env node
/**
 * Renders the first-order welcome email to disk for review. Sends nothing.
 *
 *   npm run email:preview:first-order
 *
 * Writes to build/email-previews/first-order/ (gitignored): the exact HTML and
 * plain text for every fixture, plus — when playwright is available — desktop
 * (640px), mobile (390px) and images-blocked renders of each.
 *
 * A throwaway signing secret is pinned before the module loads, so a preview can
 * never produce a working unsubscribe link, and NEXT_PUBLIC_SITE_URL is cleared
 * so image URLs resolve against production rather than a developer's localhost.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "build/email-previews/first-order");

process.env.UNSUBSCRIBE_SECRET = "preview-only-not-a-real-secret";
delete process.env.NEXT_PUBLIC_SITE_URL;

const { firstOrderWelcomeEmail } = await import(pathToFileURL(resolve(root, "lib/first-order-welcome-email.ts")).href);
const { firstOrderFixtures } = await import(pathToFileURL(resolve(root, "lib/first-order-welcome-fixtures.ts")).href);

mkdirSync(outDir, { recursive: true });

const kb = (s) => `${(Buffer.byteLength(s, "utf8") / 1024).toFixed(1)}KB`;
const rendered = [];

for (const fixture of firstOrderFixtures) {
  const { subject, preheader, html, text } = firstOrderWelcomeEmail({ email: fixture.email, offer: fixture.offer });
  writeFileSync(resolve(outDir, `${fixture.key}.html`), html);
  writeFileSync(resolve(outDir, `${fixture.key}.txt`), text);
  rendered.push({ fixture, html });
  console.log(`${fixture.key.padEnd(22)} ${kb(html).padStart(8)} HTML  ${kb(text).padStart(7)} text  ${subject}`);
  if (Buffer.byteLength(html, "utf8") > 102_000) console.warn(`  WARNING: ${fixture.key} is over ~102KB — Gmail will clip it.`);
  if (!preheader) console.warn(`  WARNING: ${fixture.key} has no preview text.`);
}

let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || "playwright"));
} catch {
  console.log("\nplaywright not installed — skipping screenshots (HTML and text were still written).");
  process.exit(0);
}

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const shots = [
  { suffix: "desktop", width: 640, images: true },
  { suffix: "mobile", width: 390, images: true },
  { suffix: "noimg", width: 640, images: false },
];

const browser = await chromium.launch();
for (const { fixture, html } of rendered) {
  for (const { suffix, width, images } of shots) {
    const context = await browser.newContext({ viewport: { width, height: 1200 }, deviceScaleFactor: 2 });
    // The <img src> values in the written file stay production URLs. For the
    // screenshot only, they are answered from public/, so a preview does not
    // depend on the live site being reachable from wherever this runs.
    await context.route("https://wynnessentialsllc.us/**", (route) => {
      if (!images) return route.abort();
      const path = new URL(route.request().url()).pathname;
      try {
        const body = readFileSync(resolve(root, "public", path.replace(/^\/+/, "")));
        return route.fulfill({ status: 200, contentType: MIME[path.slice(path.lastIndexOf("."))] || "application/octet-stream", body });
      } catch {
        return route.abort();
      }
    });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => Promise.all([...document.images].map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; }))));
    await page.screenshot({ path: resolve(outDir, `${fixture.key}-${suffix}.png`), fullPage: true });
    // A horizontally scrolling email is a broken email; report it rather than
    // leaving it to be noticed in a client.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`${`${fixture.key}-${suffix}.png`.padEnd(38)} ${String(width).padStart(4)}px  horizontal overflow: ${Math.max(0, overflow)}px`);
    await context.close();
  }
}
await browser.close();
console.log(`\nWritten to ${outDir}`);
