"use client";

import { useActionState, useState } from "react";
import { signIn } from "./actions";

// Only the sign-in form is a client component. No order data is ever passed
// across this boundary, so customer records never reach the browser bundle.
export default function SignInForm() {
  const [error, action, pending] = useActionState(signIn, null);
  const [show, setShow] = useState(false);
  return (
    <>
      <p className="eyebrow">FULFILLMENT</p>
      <h1>Sign in</h1>
      <p>This view contains customer order and shipping details.</p>
      <form action={action} style={{ display: "grid", gap: "0.75rem", maxWidth: "22rem" }}>
        <label htmlFor="token">Access token</label>
        <div style={{ position: "relative", display: "flex" }}>
          <input
            id="token"
            name="token"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            autoFocus
            style={{ width: "100%", paddingRight: "2.75rem" }}
          />
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            aria-pressed={show}
            aria-label={show ? "Hide access token" : "Show access token"}
            title={show ? "Hide access token" : "Show access token"}
            style={{
              position: "absolute",
              right: "0.35rem",
              top: "50%",
              transform: "translateY(-50%)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0.35rem",
              color: "inherit",
              opacity: 0.65,
            }}
          >
            {show ? (
              // eye-off
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.47M6.06 6.06A13.35 13.35 0 0 0 2 11s3.5 7 10 7a9 9 0 0 0 4-.94M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            ) : (
              // eye
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem", fontWeight: "normal" }}>
          <input type="checkbox" name="remember" value="1" style={{ width: "auto", margin: 0 }} />
          Keep me signed in on this device for 30 days
        </label>
        <button className="button" type="submit" disabled={pending}>{pending ? "Checking…" : "Sign in"}</button>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </>
  );
}
