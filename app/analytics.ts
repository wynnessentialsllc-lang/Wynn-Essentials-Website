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

// Product added to the bag.
export function trackAddToCart({ value, currency, contentId }: { value: number; currency: string; contentId?: string }) {
  if (typeof window === "undefined") return;
  const meta = contentId ? { content_ids: [contentId], content_type: "product" } : {};
  try { window.fbq?.("track", "AddToCart", { value, currency, ...meta }); } catch {}
  try { window.gtag?.("event", "add_to_cart", { value, currency }); } catch {}
  try { window.ttq?.track("AddToCart", { value, currency, ...(contentId ? { content_id: contentId } : {}) }); } catch {}
}

// Shopper started checkout (before the Stripe redirect).
export function trackInitiateCheckout({ value, currency }: { value: number; currency: string }) {
  if (typeof window === "undefined") return;
  try { window.fbq?.("track", "InitiateCheckout", { value, currency }); } catch {}
  try { window.gtag?.("event", "begin_checkout", { value, currency }); } catch {}
  try { window.ttq?.track("InitiateCheckout", { value, currency }); } catch {}
}

// Product detail viewed.
export function trackViewContent({ value, currency, contentId }: { value: number; currency: string; contentId?: string }) {
  if (typeof window === "undefined") return;
  const meta = contentId ? { content_ids: [contentId], content_type: "product" } : {};
  try { window.fbq?.("track", "ViewContent", { value, currency, ...meta }); } catch {}
  try { window.gtag?.("event", "view_item", { value, currency }); } catch {}
  try { window.ttq?.track("ViewContent", { value, currency, ...(contentId ? { content_id: contentId } : {}) }); } catch {}
}

export {};
