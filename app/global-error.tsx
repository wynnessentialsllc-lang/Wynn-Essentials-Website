"use client";

// Renders only when the root layout itself fails, so it replaces <html>/<body>
// and cannot rely on globals.css — styles are inlined and kept minimal.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#FCFBF8", color: "#111", fontFamily: "Georgia, 'Times New Roman', serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "24px" }}>
        <div style={{ maxWidth: "30rem" }}>
          <p style={{ fontFamily: "Arial, sans-serif", fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "#8a7f6d", margin: 0 }}>Wynn Essentials</p>
          <h1 style={{ fontSize: 34, fontWeight: 400, margin: "12px 0 10px" }}>We hit a snag.</h1>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: "#4a463f", margin: "0 0 22px" }}>Please refresh the page. If it keeps happening, email wynnessentialsllc@gmail.com.</p>
          <button type="button" onClick={reset} style={{ minHeight: 48, padding: "0 26px", background: "#c8aa82", color: "#111", border: 0, borderRadius: 2, fontWeight: 700, cursor: "pointer" }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
