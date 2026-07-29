import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FCFBF8" };
export const metadata: Metadata = {
  metadataBase: new URL("https://wynnessentialsllc.us"),
  title: "Wynn Essentials | Healthy Hair Is a Practice",
  description: "Moisture, strength, scalp, and styling essentials created for textured hair and the routines that keep it healthy.",
  alternates: { canonical: "/" },
  openGraph: { title: "Wynn Essentials | Healthy Hair Is a Practice", description: "Intentional textured-hair wellness for every stage of your routine.", url: "/", siteName: "Wynn Essentials", images: [{ url: "/og-basket-logo.jpg", width: 1200, height: 630, alt: "Wynn Essentials — Healthy Hair Is a Practice — logo and a gift basket of Lathyr, Uplyft, Hydrate, Nourish, and Edge Control" }], type: "website" },
  twitter: { card: "summary_large_image", title: "Wynn Essentials | Healthy Hair Is a Practice", description: "Intentional textured-hair wellness for every stage of your routine.", images: ["/og-basket-logo.jpg"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const organization = { "@context": "https://schema.org", "@type": "Organization", name: "Wynn Essentials", url: "https://wynnessentialsllc.us", foundingDate: "2025", address: { "@type": "PostalAddress", addressLocality: "Los Angeles", addressRegion: "CA", addressCountry: "US" } };
  return <html lang="en"><body><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }} />{children}</body></html>;
}
