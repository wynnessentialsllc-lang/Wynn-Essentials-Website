#!/usr/bin/env node
/**
 * Renders the post-purchase product-education email to disk for review. Sends
 * nothing.
 *
 *   npm run email:preview:education
 *
 * Writes to build/email-previews/education/ (gitignored): the exact HTML and
 * plain text for every fixture.
 *
 * A throwaway signing secret is pinned before the module loads, so a preview can
 * never produce a working unsubscribe link, and NEXT_PUBLIC_SITE_URL is cleared
 * so image URLs resolve against production rather than a developer's localhost.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "build/email-previews/education");

process.env.UNSUBSCRIBE_SECRET = "preview-only-not-a-real-secret";
delete process.env.NEXT_PUBLIC_SITE_URL;

const { productEducationEmail } = await import(pathToFileURL(resolve(root, "lib/product-education-email.ts")).href);
const { educationFor } = await import(pathToFileURL(resolve(root, "lib/product-education.ts")).href);
const { educationFixtures } = await import(pathToFileURL(resolve(root, "lib/product-education-fixtures.ts")).href);

// Wipe first: a renamed or removed fixture must not leave a stale preview
// behind, or someone reviews copy that is no longer sent.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const kb = (s) => `${(Buffer.byteLength(s, "utf8") / 1024).toFixed(1)}KB`;

for (const fixture of educationFixtures) {
  const cards = educationFor(fixture.items, "https://wynnessentialsllc.us");
  const { subject, preheader, html, text } = productEducationEmail({
    email: fixture.email,
    customerName: fixture.customerName,
    orderReference: fixture.orderReference,
    cards,
  });
  writeFileSync(resolve(outDir, `${fixture.key}.html`), html);
  writeFileSync(resolve(outDir, `${fixture.key}.txt`), text);
  console.log(`${fixture.key.padEnd(13)} ${String(cards.length).padStart(2)} sections  ${kb(html).padStart(8)} HTML  ${kb(text).padStart(7)} text  ${subject}`);
  if (Buffer.byteLength(html, "utf8") > 102_000) console.warn(`  WARNING: ${fixture.key} is over ~102KB — Gmail will clip it.`);
  if (!preheader) console.warn(`  WARNING: ${fixture.key} has no preview text.`);
}

console.log(`\nWrote ${educationFixtures.length * 2} files to ${outDir}`);
