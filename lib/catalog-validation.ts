import { products } from "../app/data";

const pricePattern = /^price_[A-Za-z0-9]+$/;
export function validateActiveCatalog() {
  return products.flatMap(product => {
    const errors: string[] = [];
    if (!product.price || product.price <= 0) errors.push("verified display price");
    if (!product.size) errors.push("verified size");
    if (!product.stripeProductId?.startsWith("prod_")) errors.push("Stripe Product ID");
    if (!product.stripePriceId || !pricePattern.test(product.stripePriceId)) errors.push("Stripe Price ID");
    return errors.length ? [{ productId: product.slug, missing: errors }] : [];
  });
}
