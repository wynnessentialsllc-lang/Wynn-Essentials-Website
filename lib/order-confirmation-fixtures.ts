// Sample orders for previewing and testing the order-confirmation email.
//
// PREVIEW AND TEST DATA ONLY — nothing in this file is imported by the
// storefront, the webhook, or any sending path. Every fixture is shaped exactly
// like the row lib/record-order.ts builds from a Stripe Checkout Session, so
// what the preview renders is what a real customer receives.
//
// Names, emails, addresses, session ids and order references are obviously
// fictional so a preview can never be mistaken for a real order.
//
// Render them with:  npm run email:preview
import type { OrderEmailData } from "./order-confirmation-email";

export type OrderEmailFixture = {
  key: string;
  label: string;
  /** What this fixture is meant to prove about the template. */
  covers: string[];
  order: OrderEmailData;
};

export const orderEmailFixtures: OrderEmailFixture[] = [
  {
    key: "single-item",
    label: "One product · paid shipping · tax",
    covers: ["one product", "paid shipping", "tax", "single-line address"],
    order: {
      sessionId: "cs_test_SAMPLEsingleitem0000000001",
      orderReference: "WE-2026-SAMPLE01",
      currency: "usd",
      customerName: "Amara Whitfield",
      customerEmail: "amara.whitfield@example.com",
      subtotalAmount: 1999,
      discountAmount: 0,
      shippingAmount: 595,
      taxAmount: 190,
      totalAmount: 2784,
      shippingAddress: {
        name: "Amara Whitfield",
        address: { line1: "1215 Crenshaw Blvd", line2: null, city: "Los Angeles", state: "CA", postal_code: "90019", country: "US" },
      },
      items: [
        { priceId: "price_1Twv4GDdFWqPTC8DY58xfKoA", productId: "prod_UwohVUS6w2MB46", name: "Lathyr — Gentle Cleansing Shampoo", quantity: 1, unitAmount: 1999, totalAmount: 1999 },
      ],
    },
  },
  {
    key: "multiple-products",
    label: "Multiple products · multiple quantities · free shipping",
    covers: ["multiple products", "quantity > 1", "free shipping", "tax", "long product name"],
    order: {
      sessionId: "cs_test_SAMPLEmultiproduct000000002",
      orderReference: "WE-2026-SAMPLE02",
      currency: "usd",
      customerName: "Denise Okafor",
      customerEmail: "denise.okafor@example.com",
      subtotalAmount: 16196,
      discountAmount: 0,
      shippingAmount: 0,
      taxAmount: 1539,
      totalAmount: 17735,
      shippingAddress: {
        name: "Denise Okafor",
        address: { line1: "4402 W Slauson Ave", line2: "Apt 12B", city: "Los Angeles", state: "CA", postal_code: "90043", country: "US" },
      },
      items: [
        { priceId: "price_1Twv4FDdFWqPTC8DzatZ1Mu4", productId: "prod_UwohkQStybdWBa", name: "Hydrate — Herbal Hair Mist", quantity: 2, unitAmount: 2699, totalAmount: 5398 },
        { priceId: "price_1Twv4HDdFWqPTC8DheJkds8F", productId: "prod_UwohummcUAZ3J2", name: "Nourish — Organic Oil Blend", quantity: 1, unitAmount: 2199, totalAmount: 2199 },
        { priceId: "price_1Twv4KDdFWqPTC8Drdo2AwZs", productId: "prod_UwohQgZlMAUM3o", name: "Hair Wellness Bundle — The Four-Step System", quantity: 1, unitAmount: 8599, totalAmount: 8599 },
      ],
    },
  },
  {
    key: "variants",
    label: "Selected variants and colours",
    covers: ["product variant", "colour option", "quantity > 1", "inline price line items"],
    order: {
      sessionId: "cs_test_SAMPLEvariants00000000003",
      orderReference: "WE-2026-SAMPLE03",
      currency: "usd",
      customerName: "Keisha Bell",
      customerEmail: "keisha.bell@example.com",
      subtotalAmount: 14295,
      discountAmount: 0,
      shippingAmount: 0,
      taxAmount: 1358,
      totalAmount: 15653,
      shippingAddress: {
        name: "Keisha Bell",
        address: { line1: "88 Marlborough Rd", line2: null, city: "Brooklyn", state: "NY", postal_code: "11226", country: "US" },
      },
      items: [
        // Inline price_data lines: Stripe mints an ad-hoc product for these, so
        // they resolve back to the catalog through their description.
        { priceId: "price_SAMPLEinline01", productId: "prod_SAMPLEinline01", name: "Heritage Hold — Satin Scrunchie Set · Estate Collection · Set of 4", quantity: 1, unitAmount: 1499, totalAmount: 1499 },
        { priceId: "price_SAMPLEinline02", productId: "prod_SAMPLEinline02", name: "Soft Life Bonnet — Satin Hair Protection · Light Blue", quantity: 3, unitAmount: 1999, totalAmount: 5997 },
        // A catalog product whose gallery is WebP/AVIF only — the email falls
        // back to the JPEG shot of the same product.
        { priceId: "price_1Twv4LDdFWqPTC8DBohoBW18", productId: "prod_Uwoh1j63vc16pj", name: "Body Wave — 18″ Human Hair Bulk", quantity: 1, unitAmount: 6799, totalAmount: 6799 },
      ],
    },
  },
  {
    key: "discounted",
    label: "Discount code · free shipping · no tax",
    covers: ["discount", "free shipping", "no tax collected"],
    order: {
      sessionId: "cs_test_SAMPLEdiscounted000000004",
      orderReference: "WE-2026-SAMPLE04",
      currency: "usd",
      customerName: "Toni Adeyemi",
      customerEmail: "toni.adeyemi@example.com",
      subtotalAmount: 7497,
      discountAmount: 1125,
      shippingAmount: 0,
      taxAmount: 0,
      totalAmount: 6372,
      shippingAddress: {
        name: "Toni Adeyemi",
        address: { line1: "920 N Wells St", line2: "Unit 4", city: "Chicago", state: "IL", postal_code: "60610", country: "US" },
      },
      items: [
        { priceId: "price_1Twv4HDdFWqPTC8DnczUbZfJ", productId: "prod_UwohRS3RqO3lbF", name: "Uplyft — Deep Conditioner", quantity: 1, unitAmount: 2499, totalAmount: 2499 },
        { priceId: "price_1Twv4HDdFWqPTC8D1RHBwFnv", productId: "prod_UwohjMcfN5BnoW", name: "Revaivl — Protein-Rich Conditioner", quantity: 2, unitAmount: 2499, totalAmount: 4998 },
      ],
    },
  },
  {
    key: "long-values",
    label: "Long customer name · multiline address · unrecognised product",
    covers: ["long customer name", "long product name", "multiline shipping address", "missing product image"],
    order: {
      sessionId: "cs_test_SAMPLElongvalues00000005",
      orderReference: "WE-2026-SAMPLE05",
      currency: "usd",
      customerName: "Alexandria Nkechi Oyelaran-Fitzgerald",
      customerEmail: "alexandria.oyelaran-fitzgerald@example-longdomainname.com",
      subtotalAmount: 12498,
      discountAmount: 0,
      shippingAmount: 595,
      taxAmount: 1094,
      totalAmount: 14187,
      shippingAddress: {
        name: "Alexandria Nkechi Oyelaran-Fitzgerald",
        address: {
          line1: "18422 Northwest Bougainvillea Terrace Boulevard",
          line2: "Building C, Suite 1180, Attn: Receiving Department",
          city: "Rancho Santa Margarita",
          state: "CA",
          postal_code: "92688",
          country: "US",
        },
      },
      items: [
        { priceId: "price_1Twv4GDdFWqPTC8DlffIQOu4", productId: "prod_UwohLEU6ygv8V2", name: "ThairaP — Moisture Styling Cream", quantity: 1, unitAmount: 1899, totalAmount: 1899 },
        // A line with no catalog match at all (a one-off Stripe product created
        // outside the site): no photo, no size, but the order stays readable.
        { priceId: "price_SAMPLEoneoff01", productId: "prod_SAMPLEoneoff01", name: "Wynn Essentials Limited Edition Wash Day Gift Collection — Holiday Presentation Box", quantity: 1, unitAmount: 10599, totalAmount: 10599 },
      ],
    },
  },
  {
    key: "no-first-name",
    label: "No customer name · tracking not yet available",
    covers: ["missing first name", "tracking unavailable at confirmation time"],
    order: {
      sessionId: "cs_test_SAMPLEnofirstname0000006",
      orderReference: "WE-2026-SAMPLE06",
      currency: "usd",
      customerName: null,
      customerEmail: "wallet-checkout@example.com",
      subtotalAmount: 2399,
      discountAmount: 0,
      shippingAmount: 595,
      taxAmount: 228,
      totalAmount: 3222,
      shippingAddress: {
        name: null,
        address: { line1: "77 Peachtree St NE", line2: null, city: "Atlanta", state: "GA", postal_code: "30303", country: "US" },
      },
      items: [
        { priceId: "price_1Twv4IDdFWqPTC8DCAtO7n1K", productId: "prod_Uwoh9rrVK8X2eg", name: "Relief — Organic Scalp Oil", quantity: 1, unitAmount: 2399, totalAmount: 2399 },
      ],
    },
  },
  {
    key: "with-tracking",
    label: "Tracking already available",
    covers: ["tracking number present", "carrier link"],
    order: {
      sessionId: "cs_test_SAMPLEwithtracking000007",
      orderReference: "WE-2026-SAMPLE07",
      currency: "usd",
      customerName: "Rhonda Price",
      customerEmail: "rhonda.price@example.com",
      subtotalAmount: 5697,
      discountAmount: 0,
      shippingAmount: 0,
      taxAmount: 541,
      totalAmount: 6238,
      shippingAddress: {
        name: "Rhonda Price",
        address: { line1: "3401 Fannin St", line2: null, city: "Houston", state: "TX", postal_code: "77004", country: "US" },
      },
      items: [
        { priceId: "price_1Twv4JDdFWqPTC8DHmEDIVAJ", productId: "prod_UwohJvATomQbao", name: "Edge Control — Hydrating Styling Essential", quantity: 1, unitAmount: 1499, totalAmount: 1499 },
        { priceId: "price_1Twv4IDdFWqPTC8DGawuhdLY", productId: "prod_UwohycIkFviaBt", name: "Grow — Organic Oil Blend", quantity: 1, unitAmount: 2199, totalAmount: 2199 },
        { priceId: "price_1Twv4JDdFWqPTC8DkMAcrvIB", productId: "prod_Uwohf6MFLmBduk", name: "Soft Life Bonnet — Satin Hair Protection", quantity: 1, unitAmount: 1999, totalAmount: 1999 },
      ],
      carrier: "usps",
      trackingNumber: "9400111899223197428490",
    },
  },
];

export const fixtureByKey = (key: string): OrderEmailFixture | undefined => orderEmailFixtures.find(f => f.key === key);
