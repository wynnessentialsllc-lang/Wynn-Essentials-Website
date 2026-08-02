import Link from "next/link";

export const metadata = { title: "Page not found | Wynn Essentials" };

export default function NotFound() {
  return (
    <div className="status-page">
      <Link className="status-brand" href="/">WYNN ESSENTIALS<span>Healthy Hair Is a Practice</span></Link>
      <p className="eyebrow">404 — Page not found</p>
      <h1>This page took a wash day.</h1>
      <p>The link may be broken, or a product may have moved. Let&rsquo;s get you back to healthy-hair essentials.</p>
      <div className="status-actions">
        <Link className="button" href="/#shop">Shop all products</Link>
        <Link className="outline-button" href="/">Back to home</Link>
      </div>
      <p className="status-fine">Looking for something? <Link href="/braiding-hair">Braiding hair</Link> · <Link href="/blog">Insights</Link></p>
    </div>
  );
}
