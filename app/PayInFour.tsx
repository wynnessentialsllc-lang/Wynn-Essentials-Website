"use client";

import { useEffect, useRef, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";

// Stripe's Payment Method Messaging Element: a compliant, drop-in "pay in 4 /
// installments" message that shows real per-installment amounts and provider
// logos (Klarna, Afterpay, Affirm) based on the price. Rendered on product
// surfaces so shoppers see the option before checkout.
//
// Requires NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY. If it's unset (or the price is
// missing), the component renders nothing — never breaks the page.
const PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

let stripePromise: Promise<Stripe | null> | null = null;
const getStripe = () => (stripePromise ??= PK ? loadStripe(PK) : Promise.resolve(null));

type MountableElement = { mount: (el: HTMLElement) => void; unmount: () => void };

export default function PayInFour({ price }: { price: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!PK || price == null || price <= 0 || !ref.current) return;
    let element: MountableElement | null = null;
    let cancelled = false;
    (async () => {
      const stripe = await getStripe();
      if (!stripe || cancelled || !ref.current) return;
      try {
        const elements = stripe.elements();
        // `paymentMethodMessaging` isn't in every version's element-type union,
        // so create it through a loosely typed call.
        const create = elements.create as unknown as (type: string, options: Record<string, unknown>) => MountableElement;
        element = create("paymentMethodMessaging", {
          amount: Math.round(price * 100),
          currency: "USD",
          countryCode: "US",
          paymentMethodTypes: ["klarna", "afterpay_clearpay", "affirm"],
        });
        element.mount(ref.current);
        if (!cancelled) setReady(true);
      } catch {
        // A messaging failure is non-critical — leave the slot empty.
      }
    })();
    return () => { cancelled = true; try { element?.unmount(); } catch {} };
  }, [price]);

  if (!PK || price == null || price <= 0) return null;
  return <div className={`pay-in-four${ready ? " is-ready" : ""}`} ref={ref} />;
}
