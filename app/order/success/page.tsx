import Link from "next/link";
import type Stripe from "stripe";
import { getStripe } from "../../../lib/stripe";
import SuccessClient from "../SuccessClient";

export default async function OrderSuccess({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id } = await searchParams;
  if (!session_id || !/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(session_id)) return <OrderState title="We could not verify this order." copy="Please check your Stripe receipt or contact Wynn Essentials for assistance." />;
  let session: Stripe.Checkout.Session | null = null;
  try { session = await getStripe().checkout.sessions.retrieve(session_id, { expand: ["line_items"] }); } catch {}
  if (!session) return <OrderState title="We could not verify this order yet." copy="Please use your Stripe receipt as confirmation and contact Wynn Essentials if you need assistance." />;
  const confirmed = session.payment_status === "paid" || session.payment_status === "no_payment_required";
  return <main className="order-page"><SuccessClient confirmed={confirmed} value={session.amount_total == null ? null : session.amount_total / 100} currency={(session.currency || "usd").toUpperCase()} orderRef={session.metadata?.internalOrderReference || session.id}/><p className="eyebrow">WYNN ESSENTIALS ORDER</p><h1>{confirmed ? "Your order is confirmed." : "Your payment is processing."}</h1><p>{confirmed ? "We’ve sent your receipt and order details to your email." : "We’ll confirm your order after Stripe reports a successful payment."}</p><dl><div><dt>Order reference</dt><dd>{session.metadata?.internalOrderReference || "Pending"}</dd></div><div><dt>Email</dt><dd>{session.customer_details?.email || "Provided securely at checkout"}</dd></div><div><dt>Amount paid</dt><dd>{session.amount_total == null ? "Pending" : new Intl.NumberFormat("en-US",{style:"currency",currency:(session.currency||"usd").toUpperCase()}).format(session.amount_total/100)}</dd></div>{session.line_items?.data.map(item=><div key={item.id}><dt>{item.description}</dt><dd>Quantity {item.quantity}</dd></div>)}</dl><div className="actions"><Link className="button" href="/">Continue Shopping</Link><Link className="outline-button" href="/#ingredients">View Hair Care Guidance</Link></div></main>;
}
function OrderState({title,copy}:{title:string;copy:string}){return <main className="order-page"><p className="eyebrow">WYNN ESSENTIALS ORDER</p><h1>{title}</h1><p>{copy}</p><Link className="button" href="/">Continue Shopping</Link></main>}
