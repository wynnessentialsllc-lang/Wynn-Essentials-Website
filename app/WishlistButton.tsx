"use client";

import { useEffect, useState } from "react";

// Device-based favorite toggle for the standalone product pages. Reads and
// writes the same localStorage key ("wynnWishlist") the storefront uses, so a
// product saved here also appears in the shop's "Saved" drawer.
export default function WishlistButton({ slug, name }: { slug: string; name: string }) {
  const [wished, setWished] = useState(false);

  const read = (): string[] => {
    try {
      const w = JSON.parse(localStorage.getItem("wynnWishlist") || "[]");
      return Array.isArray(w) ? w.filter((s: unknown): s is string => typeof s === "string") : [];
    } catch { return []; }
  };

  useEffect(() => { setWished(read().includes(slug)); }, [slug]);

  const toggle = () => {
    const list = read();
    const next = list.includes(slug) ? list.filter(s => s !== slug) : [...list, slug];
    try { localStorage.setItem("wynnWishlist", JSON.stringify(next)); } catch {}
    setWished(next.includes(slug));
  };

  return (
    <button type="button" className="pdp-wish" aria-pressed={wished} aria-label={wished ? `Remove ${name} from favorites` : `Save ${name} to favorites`} onClick={toggle}>
      {wished ? "♥ Saved to favorites" : "♡ Save to favorites"}
    </button>
  );
}
