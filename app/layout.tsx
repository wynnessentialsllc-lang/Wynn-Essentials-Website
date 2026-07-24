import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Manrope } from "next/font/google";
import "./globals.css";

const display = Instrument_Serif({ variable: "--font-display", subsets: ["latin"], weight: "400" });
const sans = Manrope({ variable: "--font-sans", subsets: ["latin"] });

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FCFBF8" };
export const metadata: Metadata = {
  metadataBase: new URL("https://www.wynnessentials.us"),
  title: "Wynn Essentials | Healthy Hair Is a Practice",
  description: "Moisture, strength, scalp, and styling essentials created for textured hair and the routines that keep it healthy.",
  alternates: { canonical: "/" },
  openGraph: { title: "Wynn Essentials | Healthy Hair Is a Practice", description: "Intentional textured-hair wellness for every stage of your routine.", url: "/", siteName: "Wynn Essentials", images: [{ url: "/og.png", width: 1200, height: 630, alt: "Wynn Essentials — Healthy Hair Is a Practice" }], type: "website" },
  twitter: { card: "summary_large_image", title: "Wynn Essentials | Healthy Hair Is a Practice", description: "Intentional textured-hair wellness for every stage of your routine.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const organization = { "@context": "https://schema.org", "@type": "Organization", name: "Wynn Essentials", url: "https://www.wynnessentials.us", foundingDate: "2025", address: { "@type": "PostalAddress", addressLocality: "Los Angeles", addressRegion: "CA", addressCountry: "US" } };
  return <html lang="en"><body className={`${display.variable} ${sans.variable}`}><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }} />{children}</body></html>;
}
