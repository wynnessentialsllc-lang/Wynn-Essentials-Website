"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { brandConfig, ingredientDescriptions, method, products, Product } from "./data";

type CartItem = { slug: string; quantity: number; color?: string };
type FooterInfoKey = "contact" | "shipping" | "returns" | "faq" | "track" | "accessibility" | "privacy" | "terms" | "refunds" | "cookies";
const money = (value: number | null) => value == null ? "Price to be confirmed" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const focusable = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
// Each card opens the matching in-app product modal by slug (sold on-site via Stripe).
const bohoHair: { name: string; image: string; alt: string; slug: string }[] = [
  { name: "Body Wave", image: "/collections/boho-body-wave.avif", alt: "Official Wynn Essentials 18-inch Body Wave human hair bulk product image", slug: "boho-body-wave-18" },
  { name: "Bohemian Curl", image: "/collections/boho-bohemian-curl.webp", alt: "Official Wynn Essentials 18-inch Bohemian Curl human hair bulk product image", slug: "boho-bohemian-curl-18" },
  { name: "Deep Wave", image: "/collections/boho-deep-wave.avif", alt: "Official Wynn Essentials 18-inch Deep Wave human hair bulk product image", slug: "boho-deep-wave-18" },
  { name: "Spanish Curl", image: "/collections/boho-spanish-curl.avif", alt: "Official Wynn Essentials 18-inch Spanish Curl human hair bulk product image", slug: "boho-spanish-curl-18" },
];
// Every card opens the matching in-app product modal by slug.
const shoppableCare: { name: string; detail: string; image: string; alt: string; slug: string }[] = [
  { name: "Nourish", detail: "Organic Oil Blend", image: "/shoppable/nourish-orange.png", alt: "Nourish Organic Oil Blend held against a vivid orange background", slug: "nourish-oil" },
  { name: "Grow", detail: "Organic Hair Growth Oil", image: "/shoppable/grow-model.jpeg", alt: "Model with voluminous textured hair holding Grow Oil", slug: "grow-oil" },
  { name: "Grow", detail: "Scalp & Length Support", image: "/shoppable/grow-lineup.png", alt: "Grow Oil bottle held in front of a coordinated product lineup", slug: "grow-oil" },
  { name: "Edge Control", detail: "Hydrating Styling Essential", image: "/shoppable/edge-control-hand.jpeg", alt: "Hand holding a Wynn Essentials Edge Control jar against a lavender background", slug: "edge-control" },
  { name: "Edge Control", detail: "Hydrating Styling Essential", image: "/shoppable/edge-control-model.jpeg", alt: "Model showing smooth styled edges while holding Edge Control", slug: "edge-control" },
  { name: "Heritage Hold", detail: "Satin Scrunchie Set", image: "/shoppable/heritage-hold-street.jpeg", alt: "Heritage Hold scrunchie styled around a sleek bun", slug: "heritage-hold-scrunchie-set" },
  { name: "Nourish", detail: "Moisture-Sealing Oil", image: "/shoppable/nourish-model.jpeg", alt: "Model smiling while holding Nourish Oil", slug: "nourish-oil" },
  { name: "Relief", detail: "Organic Scalp Oil", image: "/shoppable/relief-gift.jpeg", alt: "Relief Organic Oil Blend presented in Wynn Essentials gift packaging", slug: "relief-oil" },
  { name: "Grow", detail: "For Stronger-Looking Hair", image: "/shoppable/grow-sleek.jpeg", alt: "Grow Oil displayed in front of long sleek hair", slug: "grow-oil" },
  { name: "Hydrate", detail: "Herbal Hair Mist", image: "/shoppable/hydrate-results.png", alt: "Hydrate Mist shown beside a defined curl result", slug: "hydrate-herbal-hair-mist" },
  { name: "Lathyr", detail: "Gentle Cleansing Shampoo", image: "/shoppable/lathyr-pour.jpeg", alt: "Lathyr Gentle Cleansing Shampoo being poured into a hand", slug: "lathyr-shampoo" },
  { name: "Lathyr", detail: "Wash Day Essential", image: "/shoppable/lathyr-bag.jpeg", alt: "Lathyr shampoo displayed with a Wynn Essentials shopping bag", slug: "lathyr-shampoo" },
  { name: "Hydrate + Nourish", detail: "Daily Moisture Pair", image: "/shoppable/hydrate-nourish.jpeg", alt: "Hydrate Mist and Nourish Oil held together", slug: "hair-wellness-bundle" },
  { name: "Soft Life Bonnet", detail: "Satin Hair Protection", image: "/shoppable/bonnet-group.png", alt: "Four women wearing Soft Life Bonnets in different colors", slug: "soft-life-bonnet" },
  { name: "Soft Life Bonnet", detail: "Overnight Protection", image: "/shoppable/bonnet-bedroom.png", alt: "Woman adjusting a Soft Life Bonnet in her bedroom", slug: "soft-life-bonnet" },
  { name: "Uplyft", detail: "Moisture Rich Conditioner", image: "/shoppable/uplyft-texture.jpeg", alt: "Rich white conditioner texture displayed on a hand", slug: "uplyft-conditioner" },
];
const ingredientImages: Record<string, { src: string; alt: string; source: string }> = {
  Aloe: { src: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Aloe_Vera%2C.jpg?width=1000", alt: "Fresh aloe vera plant", source: "https://commons.wikimedia.org/wiki/File:Aloe_Vera,.jpg" },
  Rosemary: { src: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Romarin_2.jpg?width=1000", alt: "Fresh rosemary sprig", source: "https://commons.wikimedia.org/wiki/File:Romarin_2.jpg" },
  Nettle: { src: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Stinging_nettle_%2854750463749%29.jpg?width=1000", alt: "Fresh stinging nettle leaves", source: "https://commons.wikimedia.org/wiki/File:Stinging_nettle_(54750463749).jpg" },
  "Jojoba Oil": { src: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Jojoba.jpg?width=1000", alt: "Jojoba seeds growing on a female jojoba bush", source: "https://commons.wikimedia.org/wiki/File:Jojoba.jpg" },
  "Sunflower Oil": { src: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Sunflower4.jpg?width=1000", alt: "Bright yellow sunflower", source: "https://commons.wikimedia.org/wiki/File:Sunflower4.jpg" },
  Chamomile: { src: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Chamomile_Flower_%2852991508485%29.jpg?width=1000", alt: "White chamomile flower", source: "https://commons.wikimedia.org/wiki/File:Chamomile_Flower_(52991508485).jpg" },
  "Grapeseed Oil": { src: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Grapes_%282%29.jpg?width=1000", alt: "Fresh green grapes", source: "https://commons.wikimedia.org/wiki/File:Grapes_(2).jpg" },
  "Vitamin E": { src: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Vitamina%20E%20%28suplemento%29%20095.jpg?width=1280", alt: "High-resolution photograph of Vitamin E capsules", source: "https://commons.wikimedia.org/wiki/File:Vitamina_E_(suplemento)_095.jpg" },
  Lavender: { src: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Lavender.jpg?width=1000", alt: "Fresh lavender flowers", source: "https://commons.wikimedia.org/wiki/File:Lavender.jpg" },
  Peppermint: { src: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Peppermint%20Plant.jpg?width=1000", alt: "Fresh peppermint leaves", source: "https://commons.wikimedia.org/wiki/File:Peppermint_Plant.jpg" },
};

function BrandLogo({ compact = false, transparent = false }: { compact?: boolean; transparent?: boolean }) {
  return <span className={`brand-logo ${compact ? "compact" : ""}`}><img src={transparent ? "/wynn-essentials-logo-envelope.png" : "/wynn-essentials-logo-trimmed.webp"} width="1474" height="1243" alt="Wynn Essentials"/></span>;
}

function ProductArt({ product, small = false }: { product: Product; small?: boolean }) {
  if (product.images?.[0]) return <div className={`product-art product-photo ${small ? "small" : ""}`}><img src={product.images[0].src} alt={product.images[0].alt} width="1600" height="1600" loading={small ? "lazy" : undefined}/></div>;
  return <div className={`product-art ${small ? "small" : ""}`} role="img" aria-label={`Placeholder pack shot for ${product.name} ${product.subtitle}`}>
    <span className="bottle-cap" /><span className="bottle-label">WYNN<small>ESSENTIALS</small><b>{product.name}</b></span>
  </div>;
}

function ModalShell({ label, onClose, children, className = "" }: { label: string; onClose: () => void; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted) return;
    const previous = document.activeElement as HTMLElement;
    const node = ref.current;
    const items = () => Array.from(node?.querySelectorAll<HTMLElement>(focusable) ?? []);
    // preventScroll so opening a modal never scrolls its content to the first
    // focusable element — the invitation's only button sits at the bottom, which
    // otherwise scrolled the card past its heading on open.
    items()[0]?.focus({ preventScroll: true });
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const all = items(); if (!all.length) return;
        const first = all[0], last = all[all.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    document.body.classList.add("locked");
    return () => { document.removeEventListener("keydown", key); document.body.classList.remove("locked"); previous?.focus(); };
  }, [mounted, onClose]);
  if (!mounted) return null;
  return createPortal(
    <div
      className={`modal-backdrop ${className}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} className="modal">{children}</div>
    </div>,
    document.body,
  );
}

function FooterInfo({ page, onClose }: { page: FooterInfoKey; onClose: () => void }) {
  const content: Record<FooterInfoKey, { title: string; body: React.ReactNode }> = {
    contact: { title: "Contact Wynn Essentials", body: <><p>Questions about a product, routine, or order? We’re here to help.</p><ul><li>Email: <a href="mailto:wynnessentialsllc@gmail.com">wynnessentialsllc@gmail.com</a></li><li>Phone: <a href="tel:+12132670825">(213) 267-0825</a></li><li>Mail: Wynn Essentials, LLC, 3680 Wilshire Blvd., Ste P04 A118, Los Angeles, CA 90010</li></ul><p>Please include your order number when contacting us about an order.</p></> },
    shipping: { title: "Shipping Information", body: <><p>We currently ship within the United States only. Standard and expedited rates are shown at checkout, and U.S. orders over $50 qualify for free standard shipping.</p><p>Orders may require up to 3 business days for processing before shipment. Delivery estimates and available rates are shown at checkout.</p><p>Please review your shipping address carefully. Address corrections, returned packages, and reshipments may result in additional charges. When your order ships, tracking information is sent to the email used at checkout.</p><p>If a package is marked delivered but cannot be found, contact the carrier first to request a trace, then contact Wynn Essentials with your order number.</p></> },
    returns: { title: "Returns & Exchanges", body: <><p>Contact us before sending any product back. Eligibility depends on the product type, condition, and reason for the request.</p><p>For hygiene and safety, opened or used hair-care products and bulk human hair may not be returnable. Report damaged, defective, or incorrect items within 5 calendar days of delivery and include your order number and clear photos.</p><p>Email <a href="mailto:wynnessentialsllc@gmail.com">wynnessentialsllc@gmail.com</a> for authorization and instructions.</p></> },
    faq: { title: "Frequently Asked Questions", body: <><h3>Who are the products created for?</h3><p>Wynn Essentials supports textured-hair routines, including curls, coils, braids, locs, twists, silk presses, wigs, weaves, and other protective styles.</p><h3>How do I choose products?</h3><p>Use the <a href="#routine-finder" onClick={onClose}>Routine Finder</a> or explore products by concern and routine step.</p><h3>Where is my tracking information?</h3><p>It is sent to the email address used at checkout after the carrier receives your package.</p><h3>Can I change an order?</h3><p>Contact us immediately. Changes are not guaranteed once processing or fulfillment begins.</p></> },
    track: { title: "Track Your Order", body: <><p>Open the shipping-confirmation email sent after fulfillment and select the carrier’s tracking link.</p><p>If you did not receive that email, check spam or promotions, then contact <a href="mailto:wynnessentialsllc@gmail.com">wynnessentialsllc@gmail.com</a> with your name and order number. Never send payment-card information by email.</p></> },
    accessibility: { title: "Accessibility", body: <><p>Wynn Essentials is committed to making this website usable for as many people as possible, including customers who use keyboards, screen readers, magnification, or other assistive technology.</p><p>If you encounter an accessibility barrier, email <a href="mailto:wynnessentialsllc@gmail.com">wynnessentialsllc@gmail.com</a> and include the page, feature, and assistance needed.</p></> },
    privacy: { title: "Privacy Notice", body: <><p>We collect information needed to process orders and support customers, such as name, email, phone number, shipping address, order details, and site interactions. Payments are processed by Stripe; Wynn Essentials does not store full card numbers on this website.</p><p>Information may be shared with service providers that operate checkout, payments, hosting, shipping, security, and communications. We do not sell customer payment information.</p><p>To request access, correction, or deletion of eligible personal information, contact <a href="mailto:wynnessentialsllc@gmail.com">wynnessentialsllc@gmail.com</a>.</p></> },
    terms: { title: "Website Terms", body: <><p>Product availability, pricing, promotions, and shipping terms may change. An order is accepted when it is confirmed for fulfillment; we may cancel or refund an order affected by inventory, pricing, fraud, or address issues.</p><p>Hair-care information on this website is educational and is not medical advice. Stop use if irritation occurs and consult a qualified professional when appropriate.</p><p>Site copy, branding, photography, and designs belong to Wynn Essentials or their respective owners and may not be reused without permission.</p></> },
    refunds: { title: "Refund Policy", body: <><p>Approved refunds are returned to the original payment method. Bank processing time may vary after Wynn Essentials issues the refund.</p><p>Opened or used hair-care products and bulk human hair may be ineligible for refund for hygiene reasons. Report damage, defects, or incorrect items within 5 calendar days of delivery. Contact us before returning anything; unauthorized returns may not be accepted.</p><p>Email <a href="mailto:wynnessentialsllc@gmail.com">wynnessentialsllc@gmail.com</a> with your order number and photos when applicable.</p></> },
    cookies: { title: "Cookies & Local Storage", body: <><p>This site uses essential browser storage to remember your shopping bag and whether you have viewed the welcome invitation. Checkout and security providers may also use cookies needed to prevent fraud and complete payment.</p><p>You can clear or block cookies and local storage in your browser settings. Blocking essential storage may prevent the bag, checkout, or other site features from working correctly.</p></> },
  };
  const item = content[page];
  return <ModalShell label={item.title} onClose={onClose} className="footer-info-shell"><article className="footer-info-modal"><header><p className="eyebrow">WYNN ESSENTIALS</p><button onClick={onClose} aria-label="Close information">Close</button></header><h2>{item.title}</h2><div className="footer-info-body">{item.body}</div></article></ModalShell>;
}

function Invitation({ manual, onDone }: { manual: boolean; onDone: () => void }) {
  const [stage, setStage] = useState<"sealed" | "open">("sealed");
  const heading = useRef<HTMLHeadingElement>(null);
  const accept = () => { setStage("open"); setTimeout(() => heading.current?.focus({ preventScroll: true }), 1200); };
  const finish = () => {
    try { localStorage.setItem("wynnInvitationAcceptedAt", String(Date.now())); } catch {}
    onDone(); setTimeout(() => document.querySelector<HTMLElement>("#main-heading")?.focus({ preventScroll: true }), 0);
  };
  return <ModalShell label="Wynn Essentials invitation" onClose={finish} className={`invitation ${stage}`}>
    <div className="envelope" aria-hidden="true"><div className="flap" /><div className="envelope-logo"><BrandLogo compact transparent /></div></div>
    {stage === "sealed" ? <div className="sealed-copy">
      <p>You’ve received an invitation.</p>
      <button className="button" onClick={accept}>Accept Invitation</button>
      <button className="text-button" onClick={finish}>Continue directly to the site</button>
    </div> : <article className="invitation-card">
      <header><p>WYNN ESSENTIALS<br />PRESENTS</p><h2 ref={heading} tabIndex={-1}>AN INVITATION TO<br /><em>HEALTHY HAIR</em></h2></header>
      <p>You are formally invited to enter a new standard of care for textured hair.</p>
      <dl>
        <div><dt>ADMISSION</dt><dd>A commitment to moisture, strength, consistency, and caring for the hair beneath every style.</dd></div>
        <div><dt>DRESS CODE</dt><dd>Curls, coils, braids, locs, twists, silk presses, protective styles, and anything worn with intention.</dd></div>
        <div><dt>THE OCCASION</dt><dd>A healthier relationship with your hair.</dd></div>
        <div><dt>YOUR ACCESS</dt><dd>Wynn Essentials provides moisture, scalp, strength, and styling essentials designed to support your routine.</dd></div>
        <div><dt>LOCATION</dt><dd>Wherever your healthy-hair journey begins.</dd></div>
        <div><dt>ADMIT</dt><dd>Everyone ready to care for their hair differently.</dd></div>
      </dl>
      <p className="presented">Presented by Wynn Essentials<br />wynnessentialsllc.us</p>
      <p aria-live="polite">Your invitation has been accepted.</p>
      <button className="button" onClick={finish}>Enter Here</button>
    </article>}
    {manual && <span className="sr-only">Invitation opened manually.</span>}
  </ModalShell>;
}

function Header({ count, openCart, openSearch, viewInvite }: { count: number; openCart: () => void; openSearch: () => void; viewInvite: () => void }) {
  const [menu, setMenu] = useState(false);
  const nav = ["Shop", "Best Sellers", "Shop by Concern", "The Wynn Method", "Our Story"];
  return <>
    <div className="announcement">{brandConfig.announcement}</div>
    <header className="site-header">
      <button className="icon-button menu-trigger" aria-label="Open menu" onClick={() => setMenu(true)}>☰</button>
      <nav aria-label="Primary">{nav.map(x => <a key={x} href={`#${x.toLowerCase().replaceAll(" ", "-")}`}>{x}</a>)}</nav>
      <a href="#" className="logo" aria-label="Wynn Essentials home"><BrandLogo compact /></a>
      <div className="header-actions"><button onClick={openSearch}>Search</button><button onClick={openCart} aria-label={`Shopping bag, ${count} items`}>Bag ({count})</button></div>
    </header>
    {menu && <ModalShell label="Mobile navigation" onClose={() => setMenu(false)} className="mobile-menu">
      <div className="mobile-menu-head"><button onClick={() => setMenu(false)} aria-label="Close menu">Close</button><span className="logo"><BrandLogo compact /></span><button onClick={openCart}>Bag ({count})</button></div>
      <nav onClick={() => setMenu(false)}><a href="#shop">Shop</a><div className="subnav">{["All Products","Cleanse","Condition","Treat","Moisturize","Oils","Style","Protective Style Care"].map(x=><a key={x} href="#shop">{x}</a>)}</div>{["The Wynn Method","Shop by Concern","Shop by Style","Routine Finder","Our Story","Contact"].map(x=><a key={x} href={`#${x.toLowerCase().replaceAll(" ","-")}`}>{x}</a>)}</nav>
      <button className="text-button invite-menu" onClick={viewInvite}>View Invitation</button>
    </ModalShell>}
  </>;
}

function Cart({ items, setItems, onClose }: { items: CartItem[]; setItems: (x: CartItem[]) => void; onClose: () => void }) {
  const detailed = items.map(i => ({ ...i, product: products.find(p => p.slug === i.slug)! }));
  const subtotal = detailed.reduce((sum, x) => sum + (x.product.price ?? 0) * x.quantity, 0);
  const unknown = detailed.some(x => x.product.price == null);
  const unconfigured = detailed.some(x => !x.product.stripePriceId || !x.product.size);
  const [checkoutError, setCheckoutError] = useState("");
  const change = (slug: string, color: string | undefined, delta: number) => setItems(items.map(i => i.slug === slug && i.color === color ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i).filter(i => i.quantity));
  const remove = (slug: string, color: string | undefined) => setItems(items.filter(i => !(i.slug === slug && i.color === color)));
  return <ModalShell label="Shopping bag" onClose={onClose} className="drawer-shell"><aside className="drawer">
    <header><h2>Your Bag</h2><button onClick={onClose}>Close</button></header>
    {!items.length ? <div className="empty"><p>Your bag is ready for an intentional routine.</p><button className="button" onClick={onClose}>Continue Shopping</button></div> :
      <>{detailed.map(({ product, quantity, color }) => <div className="cart-line" key={`${product.slug}-${color ?? ""}`}><ProductArt product={product} small /><div><b>{product.name}</b><span>{product.subtitle}</span>{color && <span>Color: {color}</span>}<span>{product.size ?? "Size to be confirmed"}</span><div className="quantity"><button onClick={() => change(product.slug, color, -1)} aria-label={`Decrease ${product.name}`}>−</button><span>{quantity}</span><button onClick={() => change(product.slug, color, 1)} aria-label={`Increase ${product.name}`}>+</button></div><button className="remove" onClick={() => remove(product.slug, color)}>Remove</button></div><strong>{money(product.price == null ? null : product.price * quantity)}</strong></div>)}
      <div className="shipping-progress"><span style={{ width: `${Math.min(100, subtotal / brandConfig.shippingThreshold * 100)}%` }} /></div><p>{unknown ? "Shipping progress will appear after prices are verified." : subtotal >= brandConfig.shippingThreshold ? "You qualify for free U.S. shipping." : `${money(brandConfig.shippingThreshold - subtotal)} from free U.S. shipping.`}</p>
      <div className="subtotal"><span>Subtotal</span><strong>{unknown ? "Pending verified prices" : money(subtotal)}</strong></div>
      <p className="payment-note">Available payment options are shown securely at checkout. Discounts, shipping, and tax are validated by Stripe.</p>
      {unconfigured && <p className="config-warning">Checkout will open after Wynn Essentials verifies product prices, sizes, Stripe Price IDs, and shipping rates.</p>}
      {checkoutError && <p role="alert">{checkoutError}</p>}
      <button className="button full" disabled={unknown || unconfigured} onClick={async () => {
        setCheckoutError("");
        try {
          const response = await fetch("/api/stripe/create-checkout-session", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ items:detailed.map(x=>({productId:x.product.slug,variantId:x.product.variantId,quantity:x.quantity,...(x.color?{color:x.color}:{})})), invitationAccepted:true }) });
          const result = await response.json() as {url?:string;error?:string};
          if(!response.ok || !result.url) throw new Error(result.error || "Secure checkout is unavailable.");
          window.location.assign(result.url);
        } catch (error) { setCheckoutError(error instanceof Error ? error.message : "Secure checkout is unavailable."); }
      }}>Checkout securely with Stripe</button></>}
  </aside></ModalShell>;
}

function Search({ add, onClose, openProduct }: { add: (p: Product) => void; onClose: () => void; openProduct: (p: Product) => void }) {
  const [q, setQ] = useState("");
  const results = products.filter(p => [p.name,p.subtitle,p.category,...p.concerns,...p.styles,...p.ingredients].join(" ").toLowerCase().includes(q.toLowerCase()));
  return <ModalShell label="Search products" onClose={onClose} className="search-shell"><div className="search-modal"><header><h2>Search Wynn Essentials</h2><button onClick={onClose}>Close</button></header><label>Search products, concerns, styles, and ingredients<input autoFocus value={q} onChange={e => setQ(e.target.value)} type="search" /></label>{q && !results.length && <p>No products match “{q}”. Try a concern such as dryness or a style such as braids.</p>}<div className="search-results">{q && results.map(p=><div key={p.slug}><button className="search-name" onClick={() => openProduct(p)}>{p.name} <small>{p.subtitle}</small></button><button onClick={()=>add(p)}>Add to Cart</button></div>)}</div></div></ModalShell>;
}

function ProductDetail({ product, add, onClose, soldOut }: { product: Product; add: (p: Product, qty?: number, color?: string) => void; onClose: () => void; soldOut: boolean }) {
  const [qty, setQty] = useState(1);
  const [color, setColor] = useState("");
  const [wlEmail, setWlEmail] = useState("");
  const [wlState, setWlState] = useState<"" | "sending" | "ok" | "err">("");
  const joinWaitlist = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); if (wlState === "sending") return; setWlState("sending"); try { const r = await fetch("/api/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: wlEmail, consent: true, source: `waitlist:${product.slug}` }) }); setWlState(r.ok ? "ok" : "err"); } catch { setWlState("err"); } };
  const isHair = !product.kind;
  const needsColor = Boolean(product.colors?.length);
  const hydrateBenefits = ["Adds lightweight moisture","Helps soften dry-feeling hair","Refreshes curls and protective styles","Supports easier daily maintenance","Made for multiple textured-hair styles"];
  const accordions = {
    "Description": product.description,
    ...(product.directions ? { "How to Use": product.directions } : {}),
    ...(product.ingredients.length ? { "Ingredients": product.ingredients.join(", ") } : {}),
    ...(product.bundleIncludes?.length ? { "What’s Included": product.bundleIncludes.join(", ") } : {}),
    ...(product.colors?.length ? { "Available Colors": product.colors.join(", ") } : {}),
    ...(isHair ? {
      "Who It’s For": `Designed for routines focused on ${product.concerns.join(" and ").toLowerCase()}.`,
      "Routine Placement": `Step ${product.methodStep} of 6 in The Wynn Method.`,
      "Pairs Well With": products.filter(p => !p.kind && Math.abs(p.methodStep-product.methodStep)===1).map(p=>p.name).join(", ") || "Complete Wynn Method essentials.",
    } : {}),
  };
  return <ModalShell label={`${product.name} product details`} onClose={onClose} className="product-shell"><article className="product-modal">
    <button className="product-close" onClick={onClose}>Close</button>
    <div className="product-gallery">{product.video && <div className="product-art product-photo product-video" key="video"><video src={product.video} muted loop playsInline autoPlay preload="metadata" aria-label={`${product.name} product video`}/></div>}{(product.images?.length ? product.images : [null, null]).map((image,index)=>image ? <div className="product-art product-photo" key={image.src}><img src={image.src} alt={image.alt} width="1600" height="1600" loading={index ? "lazy" : undefined}/></div> : <ProductArt product={product} key={index}/>)}</div>
    <div className="product-info"><p className="eyebrow">{isHair ? `THE WYNN METHOD · STEP ${product.methodStep} OF 6` : product.subtitle.toUpperCase()}</p><h2>{product.name}<span>{product.subtitle}</span></h2><p className="product-price">{money(product.price)} {product.size && `· ${product.size}`}</p><p>{product.description}</p>{needsColor && <fieldset className="color-picker"><legend>Color{color ? `: ${color}` : ""}</legend>{product.colors!.map(c=><button type="button" key={c} className={color===c?"active":""} aria-pressed={color===c} onClick={()=>setColor(c)}>{c}</button>)}</fieldset>}{soldOut ? <div className="waitlist"><p className="waitlist-heading">Sold Out</p>{wlState==="ok" ? <p className="waitlist-done">You’re on the list — we’ll email you the moment {product.name} is back in stock.</p> : <form onSubmit={joinWaitlist}><label htmlFor="wl-email">Join the waitlist and we’ll email you when it’s restocked.</label><input id="wl-email" type="email" required placeholder="Enter your email" value={wlEmail} onChange={e=>setWlEmail(e.target.value)} /><button className="button full" type="submit" disabled={wlState==="sending"}>{wlState==="sending"?"Joining…":"Join the Waitlist"}</button>{wlState==="err" && <p className="waitlist-err">Something went wrong — please try again.</p>}<small>{brandConfig.consent}</small></form>}</div> : <><label>Quantity<select value={qty} onChange={e=>setQty(Number(e.target.value))}>{[1,2,3,4].map(n=><option key={n}>{n}</option>)}</select></label><button className="button full" disabled={needsColor && !color} onClick={()=>add(product,qty,color||undefined)}>{needsColor && !color ? "Select a color" : "Add to Cart"}</button></>}
      <h3>Why You’ll Love It</h3><ul className="benefit-list">{(product.featured ? hydrateBenefits : [product.benefit,"Supports a consistent routine","Created for textured-hair care"]).map(x=><li key={x}>{x}</li>)}</ul>
      <div className="accordions">{Object.entries(accordions).map(([title,body])=><details key={title}><summary>{title}</summary><p>{body}</p></details>)}</div>
    </div>
    {isHair && <section className="modal-wide method-placement"><h3>Routine Placement</h3><div>{method.map((m,i)=><span className={i+1===product.methodStep?"active":""} key={m[0]}><b>{i+1}</b>{m[0]}</span>)}</div></section>}
    <section className="modal-wide reviews"><h3>Customer Reviews</h3><p>No reviews yet. Be the first to share your Wynn Essentials experience.</p><button className="outline-button">Write a Review</button></section>
  </article></ModalShell>;
}

function RoutineFinder({ add, openProduct }: { add: (p: Product) => void; openProduct: (p: Product) => void }) {
  const questions: Array<[string, string[]]> = [
    ["How are you currently wearing your hair?",["Braids","Locs","Twists","Natural curls","Silk press","Wig or weave","Other"]],
    ["What is your main concern?",["Dryness","Breakage","Scalp discomfort","Frizz","Definition","Protective-style maintenance"]],
    ["How often do you wash?",["Weekly","Every two weeks","Monthly","Less often"]],
    ["What products are you looking for?",["Complete routine","Daily maintenance","Wash day","Styling","Scalp care"]],
  ];
  const [answers,setAnswers]=useState<string[]>([]);
  const recommendation = useMemo(()=>{
    const need=answers[3]||"Daily maintenance";
    if(need==="Complete routine") return products.filter(p=>!p.kind&&p.methodStep<=6).slice(0,6);
    if(need==="Wash day") return products.filter(p=>!p.kind&&["Cleanse","Condition","Treat"].includes(p.category));
    if(need==="Styling") return products.filter(p=>!p.kind&&p.category==="Style");
    if(need==="Scalp care") return products.filter(p=>!p.kind&&p.concerns.includes("Scalp Care"));
    return products.filter(p=>!p.kind&&(p.featured||p.category==="Oils")).slice(0,3);
  },[answers]);
  return <section id="routine-finder" className="routine-finder section"><div><p className="eyebrow">ROUTINE FINDER</p><h2>Your Hair Does Not Need Guesswork.</h2><p>Answer a few questions about your hair, current style, concerns, and routine. We’ll help identify the Wynn Essentials products that fit.</p></div>
    <form onSubmit={e=>e.preventDefault()}>{questions.map(([q,opts],i)=><fieldset key={q}><legend>{i+1}. {q}</legend><div>{opts.map(o=><label key={o}><input type="radio" name={`q${i}`} checked={answers[i]===o} onChange={()=>setAnswers(a=>{const n=[...a];n[i]=o;return n;})}/><span>{o}</span></label>)}</div></fieldset>)}</form>
    {answers.filter(Boolean).length===4 && <div className="recommendation" aria-live="polite"><h3>Your editable routine</h3><p>Based on your answers, start with these essentials. This is routine guidance, not medical advice or diagnosis.</p>{recommendation.map(p=><div key={p.slug}><button onClick={()=>openProduct(p)}>{p.name} <span>{p.subtitle}</span></button><button className="outline-button" onClick={()=>add(p)}>Add</button></div>)}</div>}
  </section>;
}

export default function WynnShop() {
  const [invitation,setInvitation]=useState<false|"auto"|"manual">(false);
  const [filter,setFilter]=useState("All");
  const [cart,setCart]=useState<CartItem[]>([]);
  const [cartOpen,setCartOpen]=useState(false);
  const [searchOpen,setSearchOpen]=useState(false);
  const [product,setProduct]=useState<Product|null>(null);
  const [footerInfo,setFooterInfo]=useState<FooterInfoKey|null>(null);
  const [notice,setNotice]=useState("");
  // Live availability from /admin/inventory OVERRIDES the catalog's own soldOut
  // flag: a slug in soldOutSlugs is closed, one in inStockSlugs is reopened, and
  // anything unlisted falls back to the catalog default. Fails open if the
  // endpoint or table is unavailable.
  const [soldOutSlugs,setSoldOutSlugs]=useState<Set<string>>(new Set());
  const [inStockSlugs,setInStockSlugs]=useState<Set<string>>(new Set());
  const soldOut=(p:Product)=>soldOutSlugs.has(p.slug)?true:inStockSlugs.has(p.slug)?false:Boolean(p.soldOut);
  useEffect(()=>{
    const hydrate = window.setTimeout(() => {
      try { const t=Number(localStorage.getItem("wynnInvitationAcceptedAt")||0); if(!t||Date.now()-t>30*864e5) setInvitation("auto"); } catch {}
      try { setCart(JSON.parse(localStorage.getItem("wynnCart")||"[]")); } catch {}
    }, 0);
    fetch("/api/inventory").then(r=>r.ok?r.json():null).then(d=>{ if(d){ if(Array.isArray(d.soldOut)) setSoldOutSlugs(new Set(d.soldOut)); if(Array.isArray(d.inStock)) setInStockSlugs(new Set(d.inStock)); } }).catch(()=>{});
    return () => window.clearTimeout(hydrate);
  },[]);
  useEffect(()=>{ try { localStorage.setItem("wynnCart",JSON.stringify(cart)); } catch {} },[cart]);
  const add=(p:Product,qty=1,color?:string)=>{ if(soldOut(p)){setNotice(`${p.name} is currently sold out.`);return;} setCart(c=>{const old=c.find(x=>x.slug===p.slug&&x.color===color);return old?c.map(x=>x.slug===p.slug&&x.color===color?{...x,quantity:x.quantity+qty}:x):[...c,{slug:p.slug,quantity:qty,...(color?{color}:{})}]});setNotice(`${p.name}${color?` (${color})`:""} added to your bag.`);};
  const openProduct=(p:Product)=>{setSearchOpen(false);setProduct(p);history.replaceState(null,"",`#product-${p.slug}`)};
  // Bulk hair has its own Premium Human Hair section below, so it is kept out of
  // the Shop the Essentials grid.
  const visible=(filter==="All"?products:products.filter(p=>p.category===filter)).filter(p=>p.kind!=="hair");
  const scroll=(id:string)=>document.getElementById(id)?.scrollIntoView({behavior:"smooth"});
  return <div className="site">
    <a className="skip-link" href="#main">Skip to content</a>
    <div className="sr-only" aria-live="polite">{notice}</div>
    {invitation && <Invitation manual={invitation==="manual"} onDone={()=>setInvitation(false)}/>}
    <Header count={cart.reduce((s,i)=>s+i.quantity,0)} openCart={()=>setCartOpen(true)} openSearch={()=>setSearchOpen(true)} viewInvite={()=>setInvitation("manual")}/>
    <main id="main">
      <section className="hero"><div className="hero-copy"><p className="eyebrow">TEXTURED-HAIR WELLNESS, MADE INTENTIONAL</p><h1 id="main-heading" tabIndex={-1}>Healthy Hair<br />Is a Practice.</h1><p>Moisture, strength, scalp, and styling essentials created for textured hair and the routines that keep it healthy.</p><div className="actions"><button className="button" onClick={()=>scroll("shop")}>Shop the Essentials</button><button className="outline-button" onClick={()=>scroll("routine-finder")}>Find My Routine</button></div><small>Made for curls, coils, braids, locs, and protective styles.</small></div><div className="hero-image"><img src="/hero-wellness-practice.jpeg" width="1206" height="1586" alt="Model surrounded by Wynn Essentials hair wellness products and styling tools" fetchPriority="high"/></div></section>
      <section className="statement section"><h2>Hair care for every part<br /><em>of your routine.</em></h2><p>Wynn Essentials offers gentle shampoo, moisture-rich conditioners, daily hydration, scalp and sealing oils, styling cream, edge control, satin accessories, and premium human hair for protective styles. Choose the products that fit your hair and build a routine around what it needs.</p><a href="#shop">Explore the Collection</a></section>
      <section id="best-sellers" className="editorial-shop section" aria-labelledby="editorial-favorites"><div className="section-heading"><div><p className="eyebrow">BEST SELLERS</p><h2 id="editorial-favorites">Colorful Care.<br/>Intentional Results.</h2></div><p>Explore customer favorites designed to cleanse, condition, hydrate, and define textured hair.</p></div><div className="editorial-grid">{[
        ["/editorial/thairap-lavender.png","ThairaP","Moisture Styling Cream","Four ThairaP styling cream jars with lavender and aloe"],
        ["/editorial/uplyft-model.jpeg","Uplyft","Moisture Rich Conditioner","Model holding Uplyft Moisture Rich Conditioner"],
        ["/editorial/hydrate-mist.png","Hydrate","Herbal Hair Mist","Hydrate Herbal Hair Mist spraying against a vivid pink background"],
        ["/editorial/lathyr-foam.jpeg","Lathyr","Gentle Cleansing Shampoo","Lathyr cleansing shampoo surrounded by rich foam"],
      ].map(([src,name,subtitle,alt])=><button className="editorial-card" key={name} onClick={()=>openProduct(products.find(p=>p.name===name)!)} aria-label={`Shop ${name}`}><img src={src} alt={alt} width="1206" height="1800" loading="lazy"/><span><b>{name}</b><small>{subtitle}</small><em>Shop now</em></span></button>)}</div></section>
      <section id="shop" className="shop section"><div className="section-heading"><p className="eyebrow">THE COLLECTION</p><h2>Shop the Essentials</h2></div><div className="filters" aria-label="Filter products">{["All","Cleanse","Condition","Treat","Moisturize","Oils","Style","Accessories","Bundles"].map(x=><button aria-pressed={filter===x} onClick={()=>setFilter(x)} key={x}>{x}</button>)}</div><div className="product-grid">{visible.map(p=><article className={`product-card${soldOut(p)?" is-sold-out":""}`} key={p.slug}><button className="art-button" onClick={()=>openProduct(p)} aria-label={`View ${p.name} details`}><ProductArt product={p}/>{soldOut(p) && <span className="sold-out-badge">Sold Out</span>}</button><div><p className="eyebrow">{p.kind ? p.category.toUpperCase() : `STEP ${p.methodStep} · ${p.category.toUpperCase()}`}</p><button className="product-title" onClick={()=>openProduct(p)}><h3>{p.name}</h3><span>{p.subtitle}</span></button><p>{p.benefit}</p><small>{p.size ?? "Size to be confirmed"}</small><strong>{money(p.price)}</strong>{soldOut(p) ? <button className="outline-button full sold-out-cta" onClick={()=>openProduct(p)}>Sold Out · Join the Waitlist</button> : p.colors?.length ? <button className="outline-button full" onClick={()=>openProduct(p)}>Select Options</button> : <button className="outline-button full" onClick={()=>add(p)}>Add to Cart</button>}</div></article>)}</div></section>
      <section id="the-wynn-method" className="method section kraft-panel"><div className="section-heading"><p className="eyebrow">ONE ROUTINE. EVERY ESSENTIAL.</p><h2>The Wynn Method</h2></div><div className="method-grid">{method.map((m,i)=><article key={m[0]}><div className="method-image"><span>{String(i+1).padStart(2,"0")}</span><ProductArt product={products.find(p=>p.methodStep===i+1)!}/></div><h3>{m[0]}</h3><p>{m[1]}</p></article>)}</div><div className="center-actions"><a className="button" href="#shop">Explore the Wynn Method</a><span>Not sure where to start?</span><a className="outline-button" href="#routine-finder">Build My Routine</a></div></section>
      <section className="campaign hydrate"><div><p className="eyebrow">HYDRATE HERBAL HAIR MIST</p><h2>Moisture Does Not Stop<br />When the Style Begins.</h2><p>Hydrate Herbal Hair Mist supports daily moisture for curls, coils, braids, locs, twists, and protective styles.</p><div className="actions"><button className="button" onClick={()=>openProduct(products[0])}>Shop Hydrate</button><button className="outline-button" onClick={()=>openProduct(products[0])}>See How to Use It</button></div><small>Lightweight moisture. No routine reset required.</small></div><ProductArt product={products[0]}/></section>
      <section id="shop-by-concern" className="category-section section"><p className="eyebrow">SHOP BY CONCERN</p><h2>What Does Your Hair Need?</h2><div>{["Dryness","Weakness and Breakage","Scalp Care","Protective Style Care","Definition and Styling"].map((x,i)=><a href="#shop" onClick={()=>setFilter(i===1?"Treat":i===2?"Oils":i===4?"Style":"All")} key={x}><span>{String(i+1).padStart(2,"0")}</span>{x}<b>Explore</b></a>)}</div></section>
      <section id="shop-by-style" className="style-section section"><p className="eyebrow">CURATED ROUTINES</p><h2>Shop by Style</h2><div>{["Braids","Locs","Twists","Natural Curls","Silk Press","Wigs and Weaves"].map(x=><a key={x} href="#routine-finder">{x}<span>Find a routine</span></a>)}</div></section>
      <section className="editorial-shop editorial-shop-dark section" aria-labelledby="editorial-everyday"><div className="section-heading"><div><p className="eyebrow">CARE IN REAL LIFE</p><h2 id="editorial-everyday">Wellness, Styled<br/>Your Way.</h2></div><p>From wash day to protective styling, tap any image to shop the product shown.</p></div><div className="editorial-grid editorial-grid-wide">
        {shoppableCare.map((item,index)=><button className="editorial-card" onClick={()=>openProduct(products.find(p=>p.slug===item.slug)!)} key={`${item.image}-${index}`} aria-label={`Shop ${item.name}`}><img src={item.image} alt={item.alt} width="1206" height="1800" loading="lazy"/><span><b>{item.name}</b><small>{item.detail}</small><em>Shop now</em></span></button>)}
      </div></section>
      <section id="essential-oils-care" className="oil-care section" aria-labelledby="essential-oils-heading">
        <div className="section-heading"><div><p className="eyebrow">SCALP · LENGTHS · ENDS</p><h2 id="essential-oils-heading">Essential Oils Care</h2></div><p>Three purposeful blends for moisture retention, scalp comfort, and stronger-looking hair. Choose the support your routine needs.</p></div>
        <div className="oil-care-videos">
          <article className="oil-care-video" aria-label="Explore Wynn Essentials oil care"><video src="/shoppable/care-video-2.mov" muted loop playsInline autoPlay preload="metadata"/><div><p className="eyebrow">YOUR OIL ROUTINE</p><h3>Grow · Relief · Nourish</h3><p>Target the scalp, support moisture, and finish your routine with intentional oil care.</p><div className="oil-care-links"><button onClick={()=>openProduct(products.find(p=>p.slug==="grow-oil")!)}>Shop Grow</button><button onClick={()=>openProduct(products.find(p=>p.slug==="relief-oil")!)}>Shop Relief</button><button onClick={()=>openProduct(products.find(p=>p.slug==="nourish-oil")!)}>Shop Nourish</button></div></div></article>
          <button className="oil-care-video" onClick={()=>openProduct(products.find(p=>p.slug==="relief-oil")!)} aria-label="Shop Relief Organic Scalp Oil"><video src="/shoppable/care-video-3.mov" muted loop playsInline autoPlay preload="metadata"/><div><p className="eyebrow">SCALP COMFORT</p><h3>Relief</h3><p>Targeted hydration for dry, itchy, or irritated areas—especially while wearing protective styles.</p><b>Shop Relief</b></div></button>
        </div>
        <div className="oil-care-products">{products.filter(p=>p.category==="Oils").map(p=><article key={p.slug}><button className="oil-care-product-image" onClick={()=>openProduct(p)} aria-label={`View ${p.name} details`}><ProductArt product={p}/></button><p className="eyebrow">{p.name==="Grow"?"GROWTH SUPPORT":p.name==="Relief"?"SCALP COMFORT":"MOISTURE SEALING"}</p><button className="product-title" onClick={()=>openProduct(p)}><h3>{p.name}</h3><span>{p.subtitle}</span></button><p>{p.benefit}</p><strong>{money(p.price)}</strong><button className="outline-button full" onClick={()=>add(p)}>Add to Cart</button></article>)}</div>
      </section>
      <section id="hair-accessories" className="owner-collection section"><div className="section-heading"><div><p className="eyebrow">OWNER-SUPPLIED COLLECTION</p><h2>Hair & Accessories</h2></div><p>Protective accessories and premium hair offerings designed to complement an intentional routine.</p></div><div className="owner-collection-grid">
        <article className="bonnet-card"><div className="bonnet-gallery">
          <img src="/collections/soft-life-bonnet-official-1.webp" alt="Soft Life Bonnet in its Wynn Essentials packaging" width="1946" height="1946" loading="lazy"/>
          <img src="/collections/soft-life-bonnet-official-2.webp" alt="Soft Life Bonnet shown on a model" width="1946" height="1946" loading="lazy"/>
          <img src="/collections/soft-life-bonnet-official-3.webp" alt="Soft Life Bonnet satin material and stretch band detail" width="1646" height="1646" loading="lazy"/>
        </div><p className="eyebrow">SATIN HAIR PROTECTION</p><h3>Soft Life Bonnet</h3><p className="bonnet-description">Helps protect braids, curls, and edges overnight while reducing friction, frizz, and moisture loss.</p><strong>$19.99</strong><span>Black · Gold · Pink · Dark Blue · Light Blue · Purple</span><button className="outline-button" onClick={()=>openProduct(products.find(p=>p.slug==="soft-life-bonnet")!)}>Shop Soft Life Bonnet</button></article>
        <article className="heritage-card"><div className="heritage-gallery">
          {[
            ["1","Heritage Hold satin scrunchies in Uptown Navy, Legacy Silver, and Reserve Noir"],
            ["2","Uptown Navy Heritage Hold satin scrunchie"],
            ["3","Legacy Silver Heritage Hold satin scrunchie"],
            ["4","Reserve Noir Heritage Hold satin scrunchie"],
            ["5","Heritage Hold satin scrunchie styling detail"],
            ["6","Heritage Hold scrunchie set packaging detail"],
            ["7","Heritage Hold satin scrunchie lifestyle detail"],
          ].map(([number,alt])=><img key={number} src={`/collections/heritage-hold-official-${number}.webp`} alt={alt} width="2048" height="2048" loading="lazy"/>)}
        </div><p className="eyebrow">GENTLE SATIN HOLD</p><h3>The Heritage Hold Satin Scrunchie Set</h3><p className="bonnet-description">A refined three-piece satin set created to secure curls, protective styles, and silk presses with less friction and tension.</p><strong>$14.99</strong><span>Uptown Navy · Legacy Silver · Reserve Noir</span><button className="outline-button" onClick={()=>openProduct(products.find(p=>p.slug==="heritage-hold-scrunchie-set")!)}>Shop the Scrunchie Set</button></article>
      </div></section>
      <section id="boho-hair" className="boho-hair section" aria-labelledby="boho-hair-heading"><div className="section-heading"><div><p className="eyebrow">PREMIUM HUMAN HAIR</p><h2 id="boho-hair-heading">Boho Hair</h2></div><p>Four signature textures in premium 18-inch human hair bulk, ready for lightweight boho braids, knotless styles, and dimensional custom installs.</p></div><div className="boho-lifestyle"><figure><img src="/collections/boho-lifestyle-street.jpeg" alt="Model with long honey-blonde boho braids and wavy ends in golden evening light" width="1126" height="1265" loading="lazy"/></figure><figure><img src="/collections/boho-lifestyle-home.jpeg" alt="Model at home running her hands through voluminous dark boho braids with wavy ends" width="1206" height="1663" loading="lazy"/></figure></div><div className="boho-grid">
        {bohoHair.map(item=>{const product=products.find(p=>p.slug===item.slug)!;return <article className="boho-card" key={item.slug}><button className="art-button" onClick={()=>openProduct(product)} aria-label={`View ${item.name} details`}><div><img src={item.image} alt={item.alt} width="1200" height="1500" loading="lazy"/><span>18″ · Natural Color</span></div></button><p className="eyebrow">BOHO BRAID HAIR</p><h3>{item.name}</h3><p>Premium human hair bulk with soft movement, natural blending, and braid-ready texture.</p><strong>{money(product.price)}</strong><button className="outline-button full" onClick={()=>add(product)}>Add to Cart</button></article>;})}
      </div></section>
      <section id="ingredients" className="ingredients section"><div className="section-heading"><p className="eyebrow">FORMULA LIBRARY</p><h2>Ingredients With Purpose</h2></div><div>{Object.entries(ingredientDescriptions).map(([name,description])=>{const photo=ingredientImages[name];const needsBackdrop=name==="Rosemary"||name==="Grapeseed Oil";return <article key={name}><div className={`ingredient-image${needsBackdrop?` ingredient-image--backdrop ${name==="Rosemary"?"ingredient-image--rosemary":"ingredient-image--grapeseed"}`:""}`}><img src={photo.src} alt={photo.alt} width="1000" height="750" loading="lazy"/></div><a className="ingredient-credit" href={photo.source} target="_blank" rel="noopener noreferrer">Photo via Wikimedia Commons</a><h3>{name}</h3><p>{description}</p><a href="#shop">View applicable products</a></article>})}</div></section>
      <section className="philosophy section"><div><p className="eyebrow">OUR FORMULATION PHILOSOPHY</p><h2>Traditional Ingredients.<br /><em>Modern Hair Wellness.</em></h2><p>Wynn Essentials combines familiar botanicals, purposeful oils, and thoughtfully designed formulas to support moisture, strength, manageability, and consistent care.</p><a href="#ingredients" className="button">Learn About Our Formulas</a></div><ol>{["Moisture Support","Strength-Focused Care","Scalp-Conscious Ingredients","Protective-Style Maintenance"].map((x,i)=><li key={x}><span>0{i+1}</span>{x}</li>)}</ol></section>
      <section id="bundle" className="bundle section"><div className="section-heading"><p className="eyebrow">THE FOUR-STEP SYSTEM</p><h2>Hair Wellness Bundle</h2><p>Your complete system for cleansing, conditioning, daily hydration, and moisture-sealing care.</p></div><div className="bundle-gallery">
        <img src="/collections/hair-wellness-bundle-official-1.webp" alt="Hair Wellness Bundle with Lathyr, Uplyft, Nourish, and Hydrate" width="1946" height="1946" loading="lazy"/>
        <img src="/collections/hair-wellness-bundle-official-2.webp" alt="Wynn Essentials Hair Wellness Bundle product arrangement" width="1946" height="1946" loading="lazy"/>
        <img src="/collections/hair-wellness-bundle-official-3.webp" alt="Lathyr, Uplyft, Nourish, and Hydrate Hair Wellness Bundle lineup" width="1646" height="1646" loading="lazy"/>
      </div><div className="bundle-products">{products.filter(p=>["Lathyr","Uplyft","Hydrate","Nourish"].includes(p.name)).sort((a,b)=>a.methodStep-b.methodStep).map(p=><div key={p.slug}><ProductArt product={p} small/><span>Included</span><b>{p.name}</b><small>{p.subtitle}</small></div>)}</div><p className="bundle-note">Cleanse with Lathyr every 7–10 days, condition with Uplyft on wash day, refresh with Hydrate as needed, and seal with Nourish Oil 2–4 times per week.</p><strong className="bundle-price">$85.99</strong><button className="button" onClick={()=>openProduct(products.find(p=>p.slug==="hair-wellness-bundle")!)}>Shop the Bundle</button></section>
      <section className="hair-campaign"><img src="/campaign-cared-for.jpeg" loading="lazy" width="1206" height="1974" alt="Model with long, glossy hair styled around Wynn Essentials Nourish Oil"/><div><h2>Hair That Looks Cared For.</h2><p>Moisture you can feel. Strength you can support. A routine you can repeat.</p><a className="button" href="#routine-finder">Find Your Routine</a></div></section>
      <section id="our-story" className="founder section">
        <div className="founder-intro"><p className="eyebrow">WHY WYNN ESSENTIALS EXISTS</p><h2>Intentional care,<br />at every stage.</h2><p>Wynn Essentials was founded in 2020 from a shared belief that textured hair deserves thoughtful care at every stage of the routine. The collection brings cleansing, conditioning, moisture, scalp care, styling support, protective-style essentials, and premium hair together so customers can build a routine that feels clear, consistent, and made for them.</p><img className="founder-story-image" src="/wynn-essentials-scarf-story.jpeg" width="1206" height="1800" loading="lazy" alt="Pink Wynn Essentials scarf featuring the brand silhouette and established 2020 pattern"/></div>
        <div className="founders-panel"><img className="founders-photo" src="/founders-patricia-karina-sheree.png" width="1536" height="1024" loading="lazy" alt="Wynn Essentials founders Patricia Wynn, Karina Wynn, and Sheree Wynn, pictured from left to right"/><p className="eyebrow">MEET THE FOUNDERS · LEFT TO RIGHT</p><h3>The Wynn Sisters</h3><p>Patricia Wynn, Karina Wynn, and Sheree Wynn are the three sisters behind Wynn Essentials. Together, they created a family-led brand that makes textured-hair care feel more intentional and less overwhelming. Their collection supports the full routine—from cleansing, conditioning, and daily moisture to scalp care, protective styling, and finishing—so every customer can care for her crown with confidence, consistency, and pride.</p><ul className="founders-list"><li>Patricia Wynn</li><li>Karina Wynn</li><li>Sheree Wynn</li></ul><ul className="founder-facts"><li>{brandConfig.founder.ownership}</li><li>{brandConfig.founder.established}</li><li>{brandConfig.founder.location}</li></ul></div>
      </section>
      <RoutineFinder add={add} openProduct={openProduct}/>
      <section className="newsletter"><p className="eyebrow">THE WYNN EDIT</p><h2>Good Hair Information<br />Belongs in Your Inbox.</h2><p>Receive routine guidance, ingredient education, product releases, and early access from Wynn Essentials.</p><form onSubmit={async (e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const form=e.currentTarget;const data=new FormData(form);const email=String(data.get("email")||"").trim();const phone=String(data.get("phone")||"").trim();const consent=data.get("consent")==="on";try{const res=await fetch("/api/subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,phone,consent})});const result=await res.json() as {ok?:boolean;error?:string};if(!res.ok||!result.ok)throw new Error(result.error||"Signup is unavailable right now.");setNotice("Thanks for joining The Wynn Edit. We'll be in touch soon.");form.reset();}catch(err){setNotice(err instanceof Error?err.message:"Signup is unavailable right now.");}}}><label>Email address<input name="email" required type="email" placeholder="you@example.com"/></label><label>Phone number (optional)<input name="phone" type="tel" placeholder="(555) 555-5555"/></label><label className="consent"><input name="consent" required type="checkbox"/> I agree to receive marketing messages.</label><button className="button">Join the List</button><small>{brandConfig.consent}</small></form></section>
    </main>
    <footer id="footer">
      <div className="footer-brand"><span className="logo"><BrandLogo /></span><p>Healthy hair is a practice.</p><small>{brandConfig.founder.ownership}<br/>{brandConfig.founder.established}<br/>{brandConfig.founder.location}</small></div>
      <div><h3>Shop</h3><a href="#shop">All Products</a><a href="#best-sellers">Best Sellers</a><a href="#bundle">Hair Wellness Bundle</a><a href="#shop-by-concern">Shop by Concern</a><a href="#shop-by-style">Shop by Style</a><a href="#boho-hair">Boho Hair</a></div>
      <div><h3>Discover</h3><a href="#the-wynn-method">The Wynn Method</a><a href="#routine-finder">Routine Finder</a><a href="#ingredients">Ingredient Library</a><a href="#essential-oils-care">Essential Oils Care</a><a href="#our-story">Our Story</a></div>
      <div><h3>Help</h3>{([["Contact","contact"],["Shipping","shipping"],["Returns","returns"],["Refunds","refunds"],["FAQ","faq"],["Track Order","track"],["Accessibility","accessibility"]] as [string,FooterInfoKey][]).map(([label,key])=><button className="footer-link" key={key} onClick={()=>setFooterInfo(key)}>{label}</button>)}</div>
      <div><h3>Legal</h3>{([["Privacy","privacy"],["Terms","terms"],["Refund Policy","refunds"],["Cookie Information","cookies"]] as [string,FooterInfoKey][]).map(([label,key])=><button className="footer-link" key={key} onClick={()=>setFooterInfo(key)}>{label}</button>)}</div>
        <div className="footer-bottom"><button className="text-button" onClick={()=>setInvitation("manual")}>View Invitation</button><div><a href="https://www.instagram.com/wynnessentials/" target="_blank" rel="noreferrer">Instagram</a><a href="https://www.tiktok.com/@wynnessentials" target="_blank" rel="noreferrer">TikTok</a><a href="mailto:wynnessentialsllc@gmail.com">Email</a><a href="tel:+12132670825">Call</a></div><span>© {new Date().getFullYear()} Wynn Essentials. All rights reserved.</span></div>
    </footer>
    {cartOpen&&<Cart items={cart} setItems={setCart} onClose={()=>setCartOpen(false)}/>}
    {searchOpen&&<Search add={add} onClose={()=>setSearchOpen(false)} openProduct={openProduct}/>}
    {product&&<ProductDetail product={product} add={add} soldOut={soldOut(product)} onClose={()=>{setProduct(null);history.replaceState(null,"",location.pathname)}}/>}
    {footerInfo&&<FooterInfo page={footerInfo} onClose={()=>setFooterInfo(null)}/>}
  </div>;
}
