import Link from "next/link";

// Shared chrome for standalone content pages (policies, About). Gives each a
// crawlable, linkable URL with the brand bar, breadcrumb, and footer — what
// Stripe, ad platforms, and BNPL providers require and what the modal-only
// versions couldn't provide.
export default function InfoPage({ title, updated, lead, children }: { title: string; updated?: string; lead?: string; children: React.ReactNode }) {
  return (
    <div className="legal-page">
      <header className="pdp-bar">
        <Link className="pdp-logo" href="/">WYNN ESSENTIALS<span>Healthy Hair Is a Practice</span></Link>
        <Link className="pdp-bar-shop" href="/#shop">Shop all products</Link>
      </header>
      <nav className="pdp-crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link> <span aria-hidden="true">/</span> <span aria-current="page">{title}</span>
      </nav>
      <main className="legal-main">
        <p className="eyebrow">WYNN ESSENTIALS</p>
        <h1>{title}</h1>
        {updated && <p className="legal-updated">Last updated {updated}</p>}
        {lead && <p className="legal-lead">{lead}</p>}
        <div className="legal-body">{children}</div>
        <p className="legal-contact">Questions? Email <a href="mailto:wynnessentialsllc@gmail.com">wynnessentialsllc@gmail.com</a>.</p>
      </main>
      <footer className="pdp-footer">
        <p><Link href="/#shop">Browse all products</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/">Back to home</Link></p>
        <small>© {new Date().getFullYear()} Wynn Essentials. All rights reserved.</small>
      </footer>
    </div>
  );
}
