// Makes a rendered email viewable offline.
//
// Every email points its images at the production origin, which is correct — an
// email is opened days later, from anywhere, and a relative path would resolve
// against nothing. It also means that opening a rendered preview on a machine
// that cannot reach production shows a page full of broken images, which reads
// as "the email is broken" when the email is fine.
//
// So each preview is written twice: the exact message, and a `.preview.html`
// twin whose image URLs point at this repository's own public/ folder. The twin
// is for looking at; the exact one is what actually gets sent.

import { relative, resolve } from "node:path";

const PRODUCTION_ORIGIN = "https://wynnessentialsllc.us";

/**
 * Rewrites production image URLs to paths relative to `outDir`, so every
 * picture resolves against the local public/ folder when the file is opened.
 * Only `src` attributes are touched — links still point at the live site,
 * because a preview is also how you check where a button goes.
 */
export function localPreview(html, { root, outDir }) {
  const publicDir = resolve(root, "public");
  const prefix = relative(outDir, publicDir).replaceAll("\\", "/");
  return html.replaceAll(
    new RegExp(`(src=")${PRODUCTION_ORIGIN}(/[^"]+)"`, "g"),
    (_match, attr, path) => `${attr}${prefix}${path}"`,
  );
}
