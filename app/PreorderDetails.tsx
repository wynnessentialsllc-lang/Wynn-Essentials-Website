"use client";

import { useEffect, useState } from "react";
import { PREORDER_POLICY } from "../lib/preorder";

type Countdown = { days: string; hours: string; minutes: string; seconds: string };

const pacificParts = (date: Date) => Object.fromEntries(
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric",
    hourCycle: "h23", weekday: "short",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
);

function pacificNoonUtc(year: number, month: number, day: number) {
  let guess = Date.UTC(year, month - 1, day, 12);
  for (let i = 0; i < 2; i += 1) {
    const actual = pacificParts(new Date(guess));
    const shownAsUtc = Date.UTC(Number(actual.year), Number(actual.month) - 1, Number(actual.day), Number(actual.hour), Number(actual.minute), Number(actual.second));
    guess += Date.UTC(year, month - 1, day, 12) - shownAsUtc;
  }
  return guess;
}

function nextCutoff(now = new Date()) {
  const pt = pacificParts(now);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(pt.weekday);
  let daysAhead = (5 - weekday + 7) % 7;
  if (daysAhead === 0 && Number(pt.hour) >= 12) daysAhead = 7;
  const date = new Date(Date.UTC(Number(pt.year), Number(pt.month) - 1, Number(pt.day) + daysAhead));
  return pacificNoonUtc(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function remaining(): Countdown {
  const total = Math.max(0, Math.floor((nextCutoff() - Date.now()) / 1000));
  return {
    days: String(Math.floor(total / 86400)).padStart(2, "0"),
    hours: String(Math.floor((total % 86400) / 3600)).padStart(2, "0"),
    minutes: String(Math.floor((total % 3600) / 60)).padStart(2, "0"),
    seconds: String(total % 60).padStart(2, "0"),
  };
}

function Icon({ type }: { type: "order" | "processing" | "preparing" | "quality" | "shipping" }) {
  const paths = {
    order: <><rect x="8" y="12" width="32" height="27" rx="3"/><path d="M15 7v10M33 7v10M8 21h32M27 35c2-6 8-8 13-5 5 0 8 4 8 8H25c0-1 1-2 2-3Z"/></>,
    processing: <path d="M9 34c0-6 5-11 11-11 2-8 13-10 18-3 7 0 11 5 11 11 0 5-4 9-9 9H16c-4 0-7-2-7-6Z"/>,
    preparing: <><path d="m9 18 21-10 21 10-21 11L9 18Zm0 0v25l21 10 21-10V18M30 29v24"/><path d="m19 36 5 2v6l-5-2v-6Zm23-2-7 3"/></>,
    quality: <><path d="M10 23 30 13l20 10-20 10-20-10Zm3 5v17l17 8 17-8V28M30 33v20"/><path d="m40 8 2 4 4 2-4 2-2 4-2-4-4-2 4-2 2-4Z"/></>,
    shipping: <><path d="M6 18h29v23H6zM35 25h9l8 9v7H35M15 45a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm29 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M17 24c3-4 9 0 5 4l-5 5-5-5c-4-4 2-8 5-4Z"/></>,
  };
  return <svg viewBox="0 0 60 60" aria-hidden="true">{paths[type]}</svg>;
}

const steps = [
  { type: "order" as const, title: "1. ORDER", copy: "Place your order before Friday at 12 PM PT." },
  { type: "processing" as const, title: "2. PROCESSING", copy: "We process all pre-orders every Friday." },
  { type: "preparing" as const, title: "3. PREPARING", copy: "Please allow 7–13 days for processing." },
  { type: "quality" as const, title: "4. QUALITY CHECK", copy: "We inspect, prep and package your hair with care." },
  { type: "shipping" as const, title: "5. ON THE WAY", copy: "Your order ships and tracking is sent to you!" },
];

export default function PreorderDetails({ compact = false }: { compact?: boolean }) {
  const [countdown, setCountdown] = useState<Countdown>({ days: "--", hours: "--", minutes: "--", seconds: "--" });
  useEffect(() => {
    const update = () => setCountdown(remaining());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return <section className={`preorder-experience${compact ? " preorder-experience--compact" : ""}`} aria-label="Pre-order details">
    <div className="preorder-batch">
      <div className="preorder-countdown">
        <p className="preorder-kicker">CURRENT PRE-ORDER BATCH</p>
        <p className="preorder-closes">Pre-orders close in:</p>
        <div className="preorder-clock" aria-live="off">
          {Object.entries(countdown).map(([label, value]) => <span key={label}><b>{value}</b><small>{label === "hours" ? "HRS" : label === "minutes" ? "MINS" : label === "seconds" ? "SECS" : "DAYS"}</small></span>)}
        </div>
      </div>
      <div className="preorder-cutoff"><Icon type="order"/><div><strong>{PREORDER_POLICY.cutoff}</strong><p>{PREORDER_POLICY.batch}</p></div></div>
    </div>
    <div className="preorder-process">
      <h3><span>✦</span> HOW PRE-ORDERS WORK <span>✦</span></h3>
      <div className="preorder-steps">{steps.map((step, index) => <div className="preorder-step" key={step.title}><div className="preorder-step-icon"><Icon type={step.type}/></div><strong>{step.title}</strong><p>{step.copy}</p>{index < steps.length - 1 && <span className="preorder-arrow" aria-hidden="true">→</span>}</div>)}</div>
    </div>
  </section>;
}
