"use client";

import { useEffect, useState } from "react";

// A lightweight, site-wide cookie/storage notice. The store is US-only and uses
// essential storage (bag, favorites, secure checkout), so this is a clear notice
// with an acknowledge action rather than a consent gate. The choice is remembered
// in localStorage so it shows once.
export default function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try { if (!localStorage.getItem("wynnCookieConsent")) setShow(true); } catch {}
  }, []);

  const dismiss = (value: "accepted" | "dismissed") => {
    try { localStorage.setItem("wynnCookieConsent", value); } catch {}
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="cookie-banner" role="dialog" aria-label="Cookie notice" aria-live="polite">
      <p className="cookie-copy">
        We use essential cookies and browser storage to run the shop, remember your bag and favorites, and process secure payments. See <strong>Cookie Information</strong> in our footer for details.
      </p>
      <div className="cookie-actions">
        <button type="button" className="button" onClick={() => dismiss("accepted")}>Got it</button>
      </div>
    </div>
  );
}
