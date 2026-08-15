"use client";

import { useState, type FormEvent } from "react";
import { brandConfig } from "../../data";

// Inline restock waitlist for the dedicated product page. Mirrors the modal's
// join-waitlist flow (POST /api/subscribe with a "waitlist:<slug>" source) so a
// sold-out product page can capture signups on its own, without bouncing the
// shopper back to the storefront modal.
export default function WaitlistForm({ slug, name }: { slug: string; name: string }) {
  const [email, setEmail] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [state, setState] = useState<"" | "sending" | "ok" | "err">("");

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    try {
      // `consent` carries the OPTIONAL newsletter opt-in only. It is not what
      // authorises the restock email — that is the waitlist request itself — so
      // leaving the box unticked still puts her on the list.
      const r = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent: optIn, source: `waitlist:${slug}` }),
      });
      setState(r.ok ? "ok" : "err");
    } catch {
      setState("err");
    }
  };

  return (
    <div className="waitlist">
      <p className="waitlist-heading">Sold Out</p>
      {state === "ok" ? (
        <p className="waitlist-done">You&rsquo;re on the list — we&rsquo;ll email you the moment {name} is back in stock.</p>
      ) : (
        <form onSubmit={submit}>
          <label htmlFor="wl-email">Join the waitlist and we&rsquo;ll email you when it&rsquo;s restocked.</label>
          <input id="wl-email" type="email" required placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="waitlist-optin" htmlFor="wl-optin">
            <input id="wl-optin" type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
            <span>{brandConfig.waitlistMarketingOptIn}</span>
          </label>
          <button className="button full" type="submit" disabled={state === "sending"}>{state === "sending" ? "Joining…" : "Join the Waitlist"}</button>
          {state === "err" && <p className="waitlist-err" role="alert">Something went wrong — please try again.</p>}
          <small>{brandConfig.waitlistConsent}</small>
        </form>
      )}
    </div>
  );
}
