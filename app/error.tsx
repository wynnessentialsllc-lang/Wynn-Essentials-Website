"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface the error for monitoring without exposing detail to the shopper.
    console.error(error);
  }, [error]);

  return (
    <div className="status-page">
      <Link className="status-brand" href="/">WYNN ESSENTIALS<span>Healthy Hair Is a Practice</span></Link>
      <p className="eyebrow">Something went wrong</p>
      <h1>We hit a snag on our end.</h1>
      <p>This one&rsquo;s on us, not you. Give it another try — and if it keeps happening, email <a href="mailto:wynnessentialsllc@gmail.com">wynnessentialsllc@gmail.com</a>.</p>
      <div className="status-actions">
        <button className="button" type="button" onClick={reset}>Try again</button>
        <Link className="outline-button" href="/">Back to home</Link>
      </div>
    </div>
  );
}
