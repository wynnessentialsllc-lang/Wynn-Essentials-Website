import type { Metadata } from "next";
import InfoPage from "../InfoPage";

export const metadata: Metadata = {
  title: "Refund Policy | Wynn Essentials",
  description: "How refunds are issued at Wynn Essentials and which items are eligible.",
  alternates: { canonical: "/refunds" },
};

export default function Refunds() {
  return (
    <InfoPage title="Refund Policy" updated="August 12, 2026">
      <h2>All sales are final</h2>
      <p>Wynn Essentials, LLC does not accept returns or issue refunds for change of mind, ordering the wrong item, or personal preference. Because we sell personal-care products and human hair, opened, used, worn, altered, brushed, combed, picked, washed, installed, or otherwise processed merchandise cannot be returned or exchanged.</p>
      <h2>Items damaged in transit</h2>
      <p>If your product was damaged while in transit, contact us within 5 calendar days after delivery. The item must be unused, unopened, in its original condition, and returned with all original packaging and tags. Please email <a href="mailto:wynnessentialsllc@gmail.com">wynnessentialsllc@gmail.com</a> with your order number and clear photographs of the item, shipping box, packaging, and shipping label.</p>
      <p>After we review the request, we may authorize an exchange. A refund may be considered only when an item was damaged in transit. Eligibility is determined after the returned merchandise is received and inspected. Shipping damage reported after the 5-day period, merchandise that has been used or altered, and items returned without authorization are not eligible.</p>
      <h2>Incorrect items</h2>
      <p>If you received an item different from the one shown in your order confirmation, contact us within 5 calendar days after delivery and do not open or use it. We will review the order and provide instructions when an exchange is approved.</p>
      <h2>Authorized returns and exchanges</h2>
      <p>Do not mail merchandise back before receiving authorization and return instructions from Wynn Essentials. Unauthorized returns will not be accepted. An approved item must be returned within the stated 5-day eligibility period, unused and in its original condition and packaging. Unless the return is due to verified transit damage or our fulfillment error, original shipping charges are nonrefundable.</p>
      <h2>Approved refunds</h2>
      <p>If a refund for transit damage is approved after inspection, it will be issued to the original payment method. Bank and card-processing times vary, so the credit may take additional business days to appear after Wynn Essentials submits it.</p>
      <p>For additional return instructions, see <a href="/returns">Returns &amp; Exchanges</a>.</p>
    </InfoPage>
  );
}
