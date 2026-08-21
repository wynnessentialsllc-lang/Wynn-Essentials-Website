export const PREORDER_PRODUCT_SLUGS = new Set([
  "boho-body-wave-18",
  "boho-bohemian-curl-18",
  "boho-deep-wave-18",
  "boho-spanish-curl-18",
]);

export const isPreorderEligible = (slug: string) => PREORDER_PRODUCT_SLUGS.has(slug);

export const PREORDER_POLICY = {
  cutoff: "Pre-orders close every Friday at 12 PM PT.",
  batch: "Order before the cutoff to be included in the current pre-order batch.",
  processing: "Please allow approximately 7–13 days for processing before shipment.",
} as const;
