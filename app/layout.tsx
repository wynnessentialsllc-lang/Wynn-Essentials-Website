import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SITE_URL, organizationSchema, websiteSchema, faqSchema, ldJson } from "./seo";
import CookieConsent from "./CookieConsent";
import Analytics from "./Analytics";
import { Analytics as VercelAnalytics } from "@vercel/analytics/next";

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FCFBF8" };
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Wynn Essentials | Healthy Hair Is a Practice",
  description: "Moisture, strength, scalp, and styling essentials created for textured hair and the routines that keep it healthy.",
  // An AI assistant that lands on any page can follow these to the plain-text
  // site map (/llms.txt) and the full catalog, instead of crawling the DOM.
  alternates: {
    canonical: "/",
    types: {
      "text/plain": [
        { url: "/llms.txt", title: "Wynn Essentials — site guide for AI assistants" },
        { url: "/llms-full.txt", title: "Wynn Essentials — full catalog for AI assistants" },
      ],
      "application/json": [{ url: "/api/catalog", title: "Wynn Essentials — machine-readable catalog" }],
    },
  },
  icons: {
    icon: [{ url: "/wynn-essentials-favicon.png", type: "image/png", sizes: "512x512" }],
    shortcut: "/wynn-essentials-favicon.png",
    apple: [{ url: "/wynn-essentials-apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: { title: "Wynn Essentials | Healthy Hair Is a Practice", description: "Intentional textured-hair wellness for every stage of your routine.", url: "/", siteName: "Wynn Essentials", images: [{ url: "/og-basket-espresso.jpg", width: 1200, height: 630, alt: "Wynn Essentials — Healthy Hair Is a Practice — logo and a gift basket of Lathyr, Uplyft, Hydrate, Nourish, and Edge Control on an espresso backdrop" }], type: "website" },
  twitter: { card: "summary_large_image", title: "Wynn Essentials | Healthy Hair Is a Practice", description: "Intentional textured-hair wellness for every stage of your routine.", images: ["/og-basket-espresso.jpg"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Site-wide structured data: the business (Organization), the site (WebSite),
  // and the FAQ. Per-product Product/Review schema lives on each product page.
  const schemas = [organizationSchema(), websiteSchema(), faqSchema()];
  return (
    <html lang="en">
      <body>
        {schemas.map((schema, i) => (
          <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(schema) }} />
        ))}
        {children}
        <CookieConsent />
        <Analytics />
        <VercelAnalytics />
      </body>
    </html>
  );
}
