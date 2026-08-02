import type { Metadata } from "next";
import InfoPage from "../InfoPage";

export const metadata: Metadata = {
  title: "Shipping Information | Wynn Essentials",
  description: "Where Wynn Essentials ships, processing times, rates, and free-shipping details.",
  alternates: { canonical: "/shipping" },
};

export default function Shipping() {
  return (
    <InfoPage title="Shipping Information" updated="August 2026">
      <p>We currently ship within the United States only. Standard and expedited rates are shown at checkout, and U.S. orders over $50 qualify for free standard shipping.</p>
      <p>Orders may require up to 3 business days for processing before shipment. Delivery estimates and available rates are shown at checkout.</p>
      <p>Please review your shipping address carefully. Address corrections, returned packages, and reshipments may result in additional charges. When your order ships, tracking information is sent to the email used at checkout.</p>
      <p>If a package is marked delivered but cannot be found, contact the carrier first to request a trace, then contact us at <a href="mailto:wynnessentialsllc@gmail.com">wynnessentialsllc@gmail.com</a> with your order number.</p>
    </InfoPage>
  );
}
