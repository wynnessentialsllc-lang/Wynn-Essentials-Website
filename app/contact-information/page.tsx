import type { Metadata } from "next";
import InfoPage from "../InfoPage";

export const metadata: Metadata = {
  title: "Contact Information | Wynn Essentials",
  description: "Contact Wynn Essentials, LLC for customer service, order assistance, and policy questions.",
  alternates: { canonical: "/contact-information" },
};

export default function ContactInformation() {
  return (
    <InfoPage title="Contact Information" updated="August 12, 2026">
      <p><strong>Wynn Essentials, LLC</strong></p>
      <p>Website: <a href="https://wynnessentialsllc.us">wynnessentialsllc.us</a></p>
      <p>Email: <a href="mailto:wynnessentialsllc@gmail.com">wynnessentialsllc@gmail.com</a></p>
      <p>Telephone: <a href="tel:+12132670825">(213) 267-0825</a></p>
      <p>Mailing address:<br />3680 Wilshire Blvd.<br />Ste P04 A118<br />Los Angeles, CA 90010</p>
      <p>For questions about an order, include your order number but never send full payment-card information by email. Customer-service messages are generally answered within 1–2 business days.</p>
    </InfoPage>
  );
}
