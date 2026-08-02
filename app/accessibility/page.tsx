import type { Metadata } from "next";
import InfoPage from "../InfoPage";

export const metadata: Metadata = {
  title: "Accessibility | Wynn Essentials",
  description: "Wynn Essentials' commitment to an accessible website and how to report a barrier.",
  alternates: { canonical: "/accessibility" },
};

export default function Accessibility() {
  return (
    <InfoPage title="Accessibility" updated="August 2026">
      <p>Wynn Essentials is committed to making this website usable for as many people as possible, including customers who use keyboards, screen readers, magnification, or other assistive technology. We aim to follow widely recognized guidelines such as WCAG 2.1 AA and improve continually.</p>
      <p>If you encounter an accessibility barrier, email <a href="mailto:wynnessentialsllc@gmail.com">wynnessentialsllc@gmail.com</a> and include the page, the feature, and the assistance you need. We&rsquo;ll work with you to provide the information or complete the transaction through an alternative method.</p>
    </InfoPage>
  );
}
