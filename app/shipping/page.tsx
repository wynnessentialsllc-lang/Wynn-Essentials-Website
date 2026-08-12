import type { Metadata } from "next";
import InfoPage from "../InfoPage";

export const metadata: Metadata = {
  title: "Shipping Information | Wynn Essentials",
  description: "Where Wynn Essentials ships, processing times, rates, and free-shipping details.",
  alternates: { canonical: "/shipping" },
};

export default function Shipping() {
  return (
    <InfoPage title="Shipping Policy" updated="August 12, 2026">
      <p>We currently ship within the United States only. Standard and expedited rates are shown at checkout, and U.S. orders over $50 qualify for free standard shipping.</p>
      <h2>Order processing</h2>
      <p>Most orders require up to 3 business days for processing before shipment. Boho Hair orders require 3–7 business days for processing. Processing time begins on the first business day after an order is placed and does not include weekends, federal holidays, or carrier transit time.</p>
      <p>During launches, sales, restocks, holidays, or other high-volume periods, processing may take longer. If an order contains Boho Hair and other products, the entire order may be held and shipped together when all items are ready. Selecting expedited shipping speeds up carrier transit only and does not shorten processing time.</p>
      <h2>Delivery estimates</h2>
      <p>Delivery estimates shown at checkout begin after processing is complete and the carrier receives the package. All delivery dates are estimates and are not guaranteed.</p>
      <h2>Addresses and returned packages</h2>
      <p>Please review your shipping address carefully. Address corrections, returned packages, and reshipments may result in additional charges. When your order ships, tracking information is sent to the email used at checkout.</p>
      <h2>Lost, missing, or damaged packages</h2>
      <p>If tracking shows a package as delivered but you cannot locate it, contact the carrier to request a trace, then email <a href="mailto:wynnessentialsllc@gmail.com">wynnessentialsllc@gmail.com</a> with your order number and case details.</p>
      <p>If an item arrives damaged in transit, retain the merchandise and all shipping materials and contact us within 5 calendar days after delivery. See our <a href="/refunds">Refund Policy</a> for eligibility requirements.</p>
    </InfoPage>
  );
}
