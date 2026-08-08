"use client";
import { useEffect } from "react";
import { trackPurchase, trackCrownPrintEvent } from "../analytics";

export default function SuccessClient({ confirmed, value, currency, orderRef }: { confirmed: boolean; value: number | null; currency: string; orderRef: string }) {
  useEffect(() => {
    if (!confirmed) return;
    localStorage.removeItem("wynnCart");
    // Fire the conversion pixel once per order, so a refresh of the success
    // page can't double-count the purchase.
    if (value == null || !orderRef) return;
    try {
      const key = `wynnPurchaseFired:${orderRef}`;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
      trackPurchase({ value, currency, ref: orderRef });
      // Attribute the purchase of any products added from a CrownPrint match,
      // then clear the marker so it fires at most once. No PII, no answers.
      try {
        const matched: string[] = JSON.parse(localStorage.getItem("wynnCrownMatched") || "[]");
        for (const slug of matched) trackCrownPrintEvent("matched_product_purchased", { contentId: slug });
        if (matched.length) localStorage.removeItem("wynnCrownMatched");
      } catch {}
    } catch {}
  }, [confirmed, value, currency, orderRef]);
  return null;
}
