import type { Metadata } from "next";
import InfoPage from "../InfoPage";

export const metadata: Metadata = {
  title: "Returns & Exchanges | Wynn Essentials",
  description: "How returns and exchanges work at Wynn Essentials, including eligibility and how to start a request.",
  alternates: { canonical: "/returns" },
};

export default function Returns() {
  return (
    <InfoPage title="Returns & Exchanges" updated="August 12, 2026">
      <p>All sales are final. Returns and exchanges are limited to merchandise damaged in transit or an incorrect item sent by Wynn Essentials.</p>
      <p>Contact <a href="mailto:wynnessentialsllc@gmail.com">wynnessentialsllc@gmail.com</a> within 5 calendar days after delivery. Include your order number and clear photos of the merchandise, original packaging, shipping box, and shipping label. The item must remain unused, unopened, unaltered, and in its original packaging with all tags attached.</p>
      <p>Do not return merchandise until Wynn Essentials provides authorization and return instructions. Unauthorized, late, used, opened, installed, washed, brushed, combed, picked, or otherwise altered merchandise will not be accepted.</p>
      <p>See our <a href="/refunds">Refund Policy</a> for complete eligibility and refund terms.</p>
    </InfoPage>
  );
}
