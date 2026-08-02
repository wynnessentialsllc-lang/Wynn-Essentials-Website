import type { Metadata } from "next";
import InfoPage from "../InfoPage";

export const metadata: Metadata = {
  title: "Refund Policy | Wynn Essentials",
  description: "How refunds are issued at Wynn Essentials and which items are eligible.",
  alternates: { canonical: "/refunds" },
};

export default function Refunds() {
  return (
    <InfoPage title="Refund Policy" updated="August 2026">
      <p>Approved refunds are returned to the original payment method. Your bank&rsquo;s processing time may vary after Wynn Essentials issues the refund.</p>
      <p>Opened or used hair-care products and bulk human hair may be ineligible for refund for hygiene reasons. Report damage, defects, or incorrect items within 5 calendar days of delivery. Contact us before returning anything — unauthorized returns may not be accepted.</p>
      <p>Email <a href="mailto:wynnessentialsllc@gmail.com">wynnessentialsllc@gmail.com</a> with your order number and photos when applicable. See <a href="/returns">Returns &amp; Exchanges</a> to start a request.</p>
    </InfoPage>
  );
}
