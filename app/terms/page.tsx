import type { Metadata } from "next";
import InfoPage from "../InfoPage";

export const metadata: Metadata = {
  title: "Website Terms | Wynn Essentials",
  description: "The terms that apply to using the Wynn Essentials website and placing orders.",
  alternates: { canonical: "/terms" },
};

export default function Terms() {
  return (
    <InfoPage title="Website Terms" updated="August 2026">
      <h2>Orders &amp; pricing</h2>
      <p>Product availability, pricing, promotions, and shipping terms may change. An order is accepted when it is confirmed for fulfillment. We may cancel or refund an order affected by inventory, pricing errors, suspected fraud, or address issues.</p>
      <h2>Educational information, not medical advice</h2>
      <p>Hair-care information on this website is educational and is not medical advice. Everyone&rsquo;s hair and scalp are different — patch test first, review the ingredient list on each product page, stop use if irritation occurs, and consult a qualified professional when appropriate.</p>
      <h2>Intellectual property</h2>
      <p>Site copy, branding, photography, and designs belong to Wynn Essentials or their respective owners and may not be reused without permission.</p>
      <h2>Contact</h2>
      <p>Questions about these terms? Email <a href="mailto:wynnessentialsllc@gmail.com">wynnessentialsllc@gmail.com</a>.</p>
    </InfoPage>
  );
}
