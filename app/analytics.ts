// Client-side ad/analytics event helpers. The pixels themselves are injected by
// app/Analytics.tsx, and ONLY when the matching NEXT_PUBLIC_* id is configured —
// so every call here safely no-ops until the owner adds their pixel ids. Keeping
// the event names in one place means Meta, GA4, and TikTok all agree.

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    ttq?: { track: (event: string, params?: Record<string, unknown>) => void };
  }
}

// Fire the purchase/conversion event across whichever pixels are configured.
export function trackPurchase({ value, currency, ref }: { value: number; currency: string; ref: string }) {
  if (typeof window === "undefined") return;
  try { window.fbq?.("track", "Purchase", { value, currency }); } catch {}
  try { window.gtag?.("event", "purchase", { transaction_id: ref, value, currency }); } catch {}
  try { window.ttq?.track("CompletePayment", { value, currency, content_type: "product" }); } catch {}
}

export {};
