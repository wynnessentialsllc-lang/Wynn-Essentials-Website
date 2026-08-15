#!/usr/bin/env node
/**
 * Builds one email-safe photograph per catalog product.
 *
 *   npm run email:images
 *
 * WHY THIS EXISTS
 *
 * Outlook for Windows renders neither WebP nor AVIF, and six of the catalog's
 * products are photographed only in those formats — ThairaP, the Soft Life
 * Bonnet, and all four braiding-hair textures. An email that reached for their
 * catalog photography either shipped an image that would not render or, with the
 * guard in lib/customer-email.ts, showed an empty square instead. Neither is a
 * photograph.
 *
 * So every product gets a JPEG here, written to public/email/products/<slug>.jpg
 * from whichever catalog image comes first, at the width the emails actually
 * display it. The catalog is left alone: these are email assets, and the
 * storefront keeps its WebP.
 *
 * Re-run it after adding a product or changing a product's lead photograph, and
 * commit what it writes. A test fails if a product has no file here.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "public/email/products");

const { products } = await import(pathToFileURL(resolve(root, "app/data.ts")).href);

// Twice the 64px the product rows display, so it stays sharp on a retina phone
// without carrying a full-size photograph into every inbox.
const WIDTH = 256;

mkdirSync(outDir, { recursive: true });
const written = new Set();

for (const product of products) {
  const source = product.images?.[0]?.src;
  if (!source) { console.warn(`  · ${product.slug.padEnd(32)} no catalog photography at all`); continue; }
  const input = resolve(root, "public", source.replace(/^\//, ""));
  if (!existsSync(input)) { console.warn(`  · ${product.slug.padEnd(32)} missing file: ${source}`); continue; }

  const file = `${product.slug}.jpg`;
  await sharp(input)
    .resize({ width: WIDTH, withoutEnlargement: true })
    // Flatten onto the brand cream so a transparent PNG does not land as black
    // in a client that ignores alpha.
    .flatten({ background: "#f4eadc" })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toFile(resolve(outDir, file));
  written.add(file);
  const kb = (statSync(resolve(outDir, file)).size / 1024).toFixed(1);
  console.log(`  + ${product.slug.padEnd(32)} ${String(kb).padStart(6)}KB  from ${source.split("/").pop()}`);
}

// A product removed from the catalog must not leave its photograph behind.
for (const stale of readdirSync(outDir).filter(f => !written.has(f))) {
  rmSync(resolve(outDir, stale));
  console.log(`  - ${stale.padEnd(34)} removed (no longer in the catalog)`);
}

console.log(`\n${written.size} email photographs in public/email/products/`);
