import type { Metadata } from "next";
import InfoPage from "../InfoPage";

export const metadata: Metadata = {
  title: "Returns & Exchanges | Wynn Essentials",
  description: "How returns and exchanges work at Wynn Essentials, including eligibility and how to start a request.",
  alternates: { canonical: "/returns" },
};

export default function Returns() {
  return (
    <InfoPage title="Returns & Exchanges" updated="August 2026">
      <p>Please contact us before sending any product back. Eligibility depends on the product type, condition, and reason for the request.</p>
      <p>For hygiene and safety, opened or used hair-care products and bulk human hair may not be returnable. Report damaged, defective, or incorrect items within 5 calendar days of delivery and include your order number and clear photos.</p>
      <p>Email <a href="mailto:wynnessentialsllc@gmail.com">wynnessentialsllc@gmail.com</a> for authorization and instructions before returning anything; unauthorized returns may not be accepted. See our <a href="/refunds">Refund Policy</a> for how approved refunds are issued.</p>
    </InfoPage>
  );
}
