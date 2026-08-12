import type { Metadata } from "next";
import InfoPage from "../InfoPage";

export const metadata: Metadata = {
  title: "Website Terms | Wynn Essentials",
  description: "The terms that apply to using the Wynn Essentials website and placing orders.",
  alternates: { canonical: "/terms" },
};

export default function Terms() {
  return (
    <InfoPage title="Terms of Service" updated="August 12, 2026" lead="These terms govern your use of wynnessentialsllc.us and purchases from Wynn Essentials, LLC.">
      <h2>Acceptance of these terms</h2>
      <p>By visiting <a href="https://wynnessentialsllc.us">wynnessentialsllc.us</a>, using its features, or placing an order, you agree to these Terms of Service and the policies linked on this website. If you do not agree, do not use the website or purchase our products. You must be at least the age of majority in your state of residence or use the website with the involvement of a parent or legal guardian.</p>
      <h2>Products and website information</h2>
      <p>We make reasonable efforts to describe and display our products accurately. Colors, textures, packaging, and appearance may vary because of natural product variation, manufacturing updates, photography, lighting, or device displays. Product descriptions, prices, availability, and packaging may be changed without notice.</p>
      <h2>Orders, pricing, and payment</h2>
      <p>Submitting an order is an offer to purchase. An order is accepted when Wynn Essentials confirms it for fulfillment. We may limit quantities or cancel an order because of inventory, pricing or description errors, suspected fraud, payment issues, address problems, or other legitimate business reasons. If we cancel a paid order, we will return the applicable amount to the original payment method.</p>
      <p>You agree to provide complete, current, and accurate billing, contact, and shipping information and confirm that you are authorized to use the payment method submitted. Prices, discounts, promotions, taxes, shipping charges, and availability may change without notice. The amount displayed at checkout and in the order confirmation controls the transaction, subject to correction of obvious errors.</p>
      <h2>Shipping, returns, and refunds</h2>
      <p>Orders are governed by our <a href="/shipping">Shipping Policy</a>, <a href="/returns">Returns &amp; Exchanges Policy</a>, and <a href="/refunds">Refund Policy</a>. Shipping and delivery dates are estimates. Refunds are not accepted except as provided in the Refund Policy for qualifying merchandise damaged in transit.</p>
      <h2>Educational information, not medical advice</h2>
      <p>Hair-care information on this website is educational and is not medical advice. Everyone&rsquo;s hair and scalp are different — patch test first, review the ingredient list on each product page, stop use if irritation occurs, and consult a qualified professional when appropriate.</p>
      <h2>Acceptable use</h2>
      <p>You may use this website only for lawful, personal, noncommercial purposes. You may not interfere with the website, attempt unauthorized access, introduce malicious code, scrape or harvest information, impersonate another person, submit false information, violate another person&rsquo;s rights, or use the website or its content for unlawful, fraudulent, or abusive activity.</p>
      <h2>Intellectual property</h2>
      <p>The website and its text, branding, product names, logos, photography, graphics, videos, designs, and other content belong to Wynn Essentials, LLC or their respective licensors and are protected by applicable intellectual-property laws. They may not be copied, modified, distributed, sold, or commercially reused without written permission.</p>
      <h2>Third-party services and links</h2>
      <p>The website may use or link to third-party services for payment, hosting, shipping, analytics, communications, or other functions. Those services may be governed by their own terms and privacy practices. Wynn Essentials is not responsible for third-party websites or services outside our control.</p>
      <h2>Disclaimer and limitation of liability</h2>
      <p>To the fullest extent permitted by law, the website and its content are provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. We do not guarantee uninterrupted or error-free access. Wynn Essentials, LLC will not be liable for indirect, incidental, special, punitive, or consequential losses arising from use of the website or products. Nothing in these terms excludes rights or remedies that cannot lawfully be excluded.</p>
      <h2>Indemnification</h2>
      <p>You agree to indemnify and hold harmless Wynn Essentials, LLC and its owners, employees, contractors, and service providers from third-party claims, losses, or reasonable expenses arising from your unlawful use of the website, your violation of these terms, or your violation of another person&rsquo;s rights.</p>
      <h2>Governing law and severability</h2>
      <p>These terms are governed by the laws of the State of California, without regard to conflict-of-law principles. If any provision is found unenforceable, the remaining provisions will continue in effect.</p>
      <h2>Changes to these terms</h2>
      <p>We may revise these terms by posting an updated version on this page. Changes take effect on the posted update date. Continued use of the website after a change means you accept the revised terms.</p>
      <h2>Contact information</h2>
      <p>Questions about these terms may be sent to <a href="mailto:wynnessentialsllc@gmail.com">wynnessentialsllc@gmail.com</a>, by telephone at <a href="tel:+12132670825">(213) 267-0825</a>, or by mail to Wynn Essentials, LLC, 3680 Wilshire Blvd., Ste P04 A118, Los Angeles, CA 90010. See our <a href="/contact-information">Contact Information</a> page for details.</p>
    </InfoPage>
  );
}
