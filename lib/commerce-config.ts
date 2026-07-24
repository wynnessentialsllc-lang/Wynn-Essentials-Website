export const commerceConfig = {
  allowedShippingCountries: ["US"] as const,
  freeShippingThresholdCents: 5000,
  standardShippingRateId: process.env.STRIPE_STANDARD_SHIPPING_RATE_ID || null,
  expeditedShippingRateId: process.env.STRIPE_EXPEDITED_SHIPPING_RATE_ID || null,
  freeShippingRateId: process.env.STRIPE_FREE_SHIPPING_RATE_ID || null,
  automaticTaxEnabled: process.env.STRIPE_TAX_ENABLED === "true",
  promotionCodesEnabled: process.env.STRIPE_PROMOTION_CODES_ENABLED === "true",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  maxQuantityPerItem: 10,
  maxLineItems: 20,
};
