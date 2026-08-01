"use client";

import { useState } from "react";

export type Bar = { label: string; value: number; breakdown?: Record<string, number> };

// A larger, clickable bar chart. Tapping a bar selects it and reveals the exact
// value plus an optional breakdown, which is far easier to read than the old
// tiny always-on labels.
function BarChart({ data, unit, labelEvery = 1 }: { data: Bar[]; unit: string; labelEvery?: number }) {
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const sel = selected != null ? data[selected] : null;

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "1rem 1rem 0.75rem" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 210, overflowX: "auto", paddingBottom: 4 }}>
        {data.map((d, i) => {
          const active = selected === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(active ? null : i)}
              title={`${d.label}: ${d.value} ${unit}`}
              aria-pressed={active}
              style={{ flex: "1 0 auto", minWidth: 16, height: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, marginBottom: 3, color: active ? "var(--black)" : "var(--muted)", opacity: d.value || active ? 1 : 0 }}>{d.value || (active ? 0 : "")}</span>
              <div style={{ width: "80%", maxWidth: 36, height: `${(d.value / max) * 100}%`, minHeight: d.value ? 4 : 0, background: active ? "var(--black)" : "var(--kraft-dark)", borderRadius: "3px 3px 0 0", transition: "background .15s" }} />
              <span style={{ fontSize: 10, opacity: 0.6, marginTop: 5, whiteSpace: "nowrap" }}>{i % labelEvery === 0 || active ? d.label : ""}</span>
            </button>
          );
        })}
      </div>

      <div style={{ borderTop: "1px solid var(--line)", marginTop: 8, paddingTop: 10, minHeight: 46 }}>
        {sel ? (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem 1.1rem", fontSize: 13 }}>
            <strong style={{ fontSize: 15 }}>{sel.label}</strong>
            <span><b>{sel.value}</b> {unit}</span>
            {sel.breakdown && Object.entries(sel.breakdown).map(([k, v]) => (
              <span key={k} style={{ opacity: 0.75 }}>{k}: <b>{v}</b></span>
            ))}
            <button type="button" onClick={() => setSelected(null)} style={{ marginLeft: "auto", border: "none", background: "none", textDecoration: "underline", cursor: "pointer", fontSize: 12, opacity: 0.7 }}>Clear</button>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>Tap any bar to see its exact count and a breakdown.</p>
        )}
      </div>
    </div>
  );
}

export default function TrafficCharts({ daily, hourly, dailyLabelEvery }: { daily: Bar[]; hourly: Bar[]; dailyLabelEvery: number }) {
  return (
    <>
      <h2 style={{ fontSize: "1.4rem", margin: "0 0 0.6rem" }}>Visitors per day</h2>
      <div style={{ marginBottom: "2rem" }}><BarChart data={daily} unit="visitors" labelEvery={dailyLabelEvery} /></div>

      <h2 style={{ fontSize: "1.4rem", margin: "0 0 0.6rem" }}>Visitors by hour of day</h2>
      <p style={{ opacity: 0.7, marginTop: 0 }}>When people tend to visit (all days combined, shown in the server&rsquo;s time zone, 0&ndash;23h).</p>
      <div style={{ marginBottom: "2rem" }}><BarChart data={hourly} unit="visitors" labelEvery={2} /></div>
    </>
  );
}
