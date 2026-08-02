import type { Metadata } from "next";
import InfoPage from "../InfoPage";
import { brandConfig } from "../data";

export const metadata: Metadata = {
  title: "About Wynn Essentials | Our Story",
  description: "Wynn Essentials is a Black women-owned, family-run hair-care brand founded by the Wynn Sisters. Meet the founders and the philosophy behind Healthy Hair Is a Practice.",
  alternates: { canonical: "/about" },
  openGraph: { title: "About Wynn Essentials | Our Story", description: "A Black women-owned, family-run hair-care brand founded by the Wynn Sisters.", url: "/about", siteName: "Wynn Essentials", type: "website" },
};

export default function About() {
  return (
    <InfoPage title="Our Story" lead="Healthy hair is a practice — and it started at home.">
      <p>Wynn Essentials was founded by {brandConfig.founder.name} — a family of sisters who grew up learning that caring for textured hair is a ritual, not a rush. {brandConfig.founder.ownership} and {brandConfig.founder.established.toLowerCase()} in {brandConfig.founder.location}, we built the brand we wished we&rsquo;d had: intentional, botanical-forward products that work with real routines.</p>
      <h2>Why we make what we make</h2>
      <p>Textured hair thrives on consistency — moisture, strength, scalp care, and gentle styling, repeated. So instead of chasing trends, we formulate for the steps of a routine you can actually keep. Familiar botanicals and purposeful oils, thoughtfully combined, at every stage of The Wynn Method.</p>
      <h2>What we stand for</h2>
      <p>Clean, considered formulas. Honest education over hype. First-party customer reviews, never borrowed testimonials. And products created by and for our community.</p>
      <h2>The Wynn Method</h2>
      <p>Our six-step framework — cleanse, condition, treat, moisturize, seal, and style — turns good products into a real practice. Explore it, and build your own routine, on our <a href="/#the-wynn-method">home page</a>.</p>
      <p><a href="/#shop">Shop the collection →</a></p>
    </InfoPage>
  );
}
