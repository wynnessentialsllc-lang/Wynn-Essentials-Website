// Carrier tracking links, shared by the customer emails and /admin/orders.
// Lives in its own module so the order-confirmation renderer and lib/notify.ts
// can both use it without importing each other.

// Builds a carrier tracking URL from a tracking number. Falls back to null for
// an unknown carrier, in which case the email shows the number without a link.
export function trackingUrl(carrier: string | null | undefined, number: string | null | undefined): string | null {
  if (!number) return null;
  const n = encodeURIComponent(number);
  switch ((carrier ?? "").toLowerCase()) {
    case "usps": return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
    case "ups": return `https://www.ups.com/track?tracknum=${n}`;
    case "fedex": return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
    case "dhl": return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${n}`;
    default: return null;
  }
}
