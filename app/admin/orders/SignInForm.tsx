"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

// Only the sign-in form is a client component. No order data is ever passed
// across this boundary, so customer records never reach the browser bundle.
export default function SignInForm() {
  const [error, action, pending] = useActionState(signIn, null);
  return (
    <>
      <p className="eyebrow">FULFILLMENT</p>
      <h1>Sign in</h1>
      <p>This view contains customer order and shipping details.</p>
      <form action={action} style={{ display: "grid", gap: "0.75rem", maxWidth: "22rem" }}>
        <label htmlFor="token">Access token</label>
        <input id="token" name="token" type="password" autoComplete="current-password" required autoFocus />
        <button className="button" type="submit" disabled={pending}>{pending ? "Checking…" : "Sign in"}</button>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </>
  );
}
