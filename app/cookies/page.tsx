import type { Metadata } from "next";
import InfoPage from "../InfoPage";

export const metadata: Metadata = {
  title: "Cookie Information | Wynn Essentials",
  description: "How Wynn Essentials uses cookies and browser storage, and how to control them.",
  alternates: { canonical: "/cookies" },
};

export default function Cookies() {
  return (
    <InfoPage title="Cookies & Local Storage" updated="August 2026">
      <p>This site uses essential browser storage to remember your shopping bag and whether you have viewed the welcome invitation. Checkout and security providers may also use cookies needed to prevent fraud and complete payment.</p>
      <p>If analytics or advertising pixels are enabled, they may set cookies used to measure site performance and marketing. You can clear or block cookies and local storage in your browser settings, and manage your privacy choices as described in our <a href="/privacy#rights">Privacy Notice</a>.</p>
      <p>Blocking essential storage may prevent the bag, checkout, or other site features from working correctly.</p>
    </InfoPage>
  );
}
