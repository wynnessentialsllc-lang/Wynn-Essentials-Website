#!/usr/bin/env node
/**
 * Renders customer emails to disk for review. Sends nothing.
 *
 *   npm run email:preview
 *
 * Writes to build/email-previews/ (gitignored):
 *   wynn-edit-welcome.html        the exact HTML the provider would be handed
 *   wynn-edit-welcome.txt         the plain-text alternative
 *   wynn-edit-welcome-desktop.png a 640px-wide render      (needs playwright)
 *   wynn-edit-welcome-mobile.png  a 390px-wide render      (needs playwright)
 *   wynn-edit-welcome-noimg.png   images blocked, 640px    (needs playwright)
 *
 * The screenshots are optional: without playwright installed the HTML and text
 * are still written, and the script exits 0.
 *
 * A preview is built for a placeholder address with a throwaway signing secret,
 * so nothing here depends on — or reveals — production configuration.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "build/email-previews");

// A preview must never be able to sign a real unsubscribe link, and must never
// point at a developer's localhost. Both are pinned before the module loads.
process.env.UNSUBSCRIBE_SECRET = "preview-only-not-a-real-secret";
delete process.env.NEXT_PUBLIC_SITE_URL;

const { wynnEditWelcomeEmail } = await import(pathToFileURL(resolve(root, "lib/wynn-edit-email.ts")).href);

const PREVIEW_ADDRESS = "preview@example.com";
const { subject, preheader, html, text } = wynnEditWelcomeEmail({ email: PREVIEW_ADDRESS });

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "wynn-edit-welcome.html"), html);
writeFileSync(resolve(outDir, "wynn-edit-welcome.txt"), text);

const kb = (s) => `${(Buffer.byteLength(s, "utf8") / 1024).toFixed(1)}KB`;
console.log(`Subject:  ${subject}`);
console.log(`Preview:  ${preheader}`);
console.log(`HTML:     ${resolve(outDir, "wynn-edit-welcome.html")} (${kb(html)})`);
console.log(`Text:     ${resolve(outDir, "wynn-edit-welcome.txt")} (${kb(text)})`);
if (Buffer.byteLength(html, "utf8") > 102_000) console.warn("WARNING: over ~102KB — Gmail will clip this message.");

let chromium;
try {
  // PLAYWRIGHT_MODULE_PATH lets a globally installed playwright be used without
  // adding a dependency to this project just to take a screenshot.
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || "playwright"));
} catch {
  console.log("\nplaywright not installed — skipping screenshots (HTML and text were still written).");
  process.exit(0);
}

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

const shots = [
  { name: "wynn-edit-welcome-desktop.png", width: 640, images: true },
  { name: "wynn-edit-welcome-mobile.png", width: 390, images: true },
  { name: "wynn-edit-welcome-noimg.png", width: 640, images: false },
];

const browser = await chromium.launch();
for (const { name, width, images } of shots) {
  const context = await browser.newContext({ viewport: { width, height: 1200 }, deviceScaleFactor: 2 });
  // The email's <img src> values are production URLs and stay that way in the
  // file we write. For the screenshot only, they are answered from public/ —
  // so the preview shows the real photography without the render depending on
  // the live site being reachable from wherever this runs.
  await context.route("https://wynnessentialsllc.us/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!images) return route.abort();
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
  await page.screenshot({ path: resolve(outDir, name), fullPage: true });
  // A horizontally scrolling email is a broken email; report it rather than
  // leaving it for someone to notice in a client.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${name.padEnd(32)} ${width}px  horizontal overflow: ${Math.max(0, overflow)}px`);
  await context.close();
}
await browser.close();
console.log(`\nScreenshots written to ${outDir}`);
