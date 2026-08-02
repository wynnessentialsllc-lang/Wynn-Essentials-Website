import type { Metadata } from "next";
import InfoPage from "../InfoPage";

export const metadata: Metadata = {
  title: "Privacy Notice | Wynn Essentials",
  description: "How Wynn Essentials collects, uses, and protects your personal information, and how to exercise your privacy rights.",
  alternates: { canonical: "/privacy" },
};

export default function Privacy() {
  return (
    <InfoPage title="Privacy Notice" updated="August 2026" lead="This notice explains what we collect, why, and the choices you have.">
      <h2>Information we collect</h2>
      <p>We collect the information needed to process orders and support customers: your name, email address, shipping address, order details, and how you interact with the site. When you check out, our payment processor (Stripe) collects the details needed to complete payment and shipping. Wynn Essentials never sees or stores your full card number.</p>
      <h2>How we use it</h2>
      <p>We use your information to fulfill and support orders, prevent fraud, operate and improve the site, and — only if you opt in — to send marketing emails. You can unsubscribe from marketing at any time using the link in any email.</p>
      <h2>Who we share it with</h2>
      <p>We share information only with the service providers that operate checkout, payments, hosting, shipping, email, and security on our behalf. We do not sell or rent your personal information, and we do not share it for cross-context behavioral advertising in exchange for money.</p>
      <h2 id="rights">Your privacy rights</h2>
      <p>Depending on where you live (including California residents under the CCPA/CPRA), you may have the right to access, correct, or delete the personal information we hold about you, and to opt out of the sale or sharing of personal information.</p>
      <p><strong>Do Not Sell or Share My Personal Information:</strong> we do not sell your personal information or share it for cross-context behavioral advertising. If we ever change that, we will post a clear opt-out here first. To make any privacy request, email <a href="mailto:wynnessentialsllc@gmail.com">wynnessentialsllc@gmail.com</a> with the details of your request, and we will verify and respond as required by law. We will not discriminate against you for exercising these rights.</p>
      <h2>Cookies &amp; storage</h2>
      <p>We use essential browser storage to remember your bag and whether you&rsquo;ve seen the welcome invitation, and our payment and security providers may set cookies needed to complete payment and prevent fraud. See our <a href="/cookies">Cookie Information</a> page for details and how to control them.</p>
      <h2>Data retention</h2>
      <p>We keep order and subscriber records for as long as needed to provide our services and meet legal, tax, and accounting obligations, then delete or de-identify them.</p>
    </InfoPage>
  );
}
