"use client";
import { useEffect } from "react";
export default function SuccessClient({ confirmed }: { confirmed: boolean }) {
  useEffect(() => { if (confirmed) localStorage.removeItem("wynnCart"); }, [confirmed]);
  return null;
}
