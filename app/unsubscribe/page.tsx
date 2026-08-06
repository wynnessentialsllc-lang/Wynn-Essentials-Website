import type { Metadata } from "next";
import InfoPage from "../InfoPage";
import { verifyUnsubscribe, normalizeEmail } from "../../lib/unsubscribe";

export const metadata: Metadata = {
  title: "Unsubscribe",
  description: "Manage your Wynn Essentials email preferences.",
  robots: { index: false, follow: false },
};

// Landing page for the unsubscribe link in marketing emails. The link only lands
// here (a GET), and nothing is changed until the visitor confirms with the POST
// button below — so an email client or scanner pre-fetching the link can't
// unsubscribe anyone by accident. The API route does the actual opt-out.
export default async function Unsubscribe({ searchParams }: { searchParams: Promise<{ e?: string; t?: string; state?: string }> }) {
  const { e = "", t = "", state } = await searchParams;
  const email = normalizeEmail(e);

  if (state === "done") {
    return (
      <InfoPage title="Unsubscribed" lead="You've been removed from Wynn Essentials marketing emails.">
        <p>You will no longer receive newsletters or promotional emails from us. You may still receive transactional messages related to an order you place (like receipts and shipping updates).</p>
        <p>Changed your mind? You can re-subscribe anytime from the footer of our <a href="/">homepage</a>.</p>
      </InfoPage>
    );
  }

  if (state === "error") {
    return (
      <InfoPage title="Something went wrong" lead="We couldn't process that request just now.">
        <p>Please try again in a moment, or email <a href="mailto:wynnessentialsllc@gmail.com?subject=Unsubscribe">wynnessentialsllc@gmail.com</a> with the subject line "Unsubscribe" and we'll remove you promptly.</p>
      </InfoPage>
    );
  }

  const valid = !!email && verifyUnsubscribe(email, t);
  if (!valid) {
    return (
      <InfoPage title="Unsubscribe" lead="This unsubscribe link is invalid or has expired.">
        <p>To be removed from our marketing emails, please email <a href="mailto:wynnessentialsllc@gmail.com?subject=Unsubscribe">wynnessentialsllc@gmail.com</a> with the subject line "Unsubscribe" and we'll take care of it.</p>
      </InfoPage>
    );
  }

  return (
    <InfoPage title="Unsubscribe" lead="Confirm you'd like to stop receiving Wynn Essentials marketing emails.">
      <p>You're about to unsubscribe <strong>{email}</strong> from our newsletters and promotional emails. Transactional emails about your orders are not affected.</p>
      <form method="post" action="/api/unsubscribe" style={{ marginTop: "24px" }}>
        <input type="hidden" name="e" value={email} />
        <input type="hidden" name="t" value={t} />
        <button className="button" type="submit">Unsubscribe me</button>
      </form>
    </InfoPage>
  );
}
