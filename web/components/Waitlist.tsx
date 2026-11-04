"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { X_URL } from "./SocialIcons";

const TYPES = ["Ebooks and digital goods", "Food and drinks", "Retail shop", "Services", "Events and tickets", "Other"];

export function Waitlist() {
  const [shownAt] = useState(() => Date.now());
  const [email, setEmail] = useState("");
  const [type, setType] = useState(TYPES[0]!);
  const [hp, setHp] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | string>("idle");
  const { data, refetch } = useQuery({ queryKey: ["waitlist"], queryFn: () => api<{ count: number }>("/waitlist", { auth: false }) });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("busy");
    try {
      await api("/waitlist", { method: "POST", auth: false, json: { email, businessType: type, website: hp, shownAt } });
      setState("done");
      refetch();
    } catch (err) {
      setState(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <div className="card p-6 sm:p-8" id="waitlist" data-testid="waitlist">
      <h2 className="h-display text-2xl sm:text-3xl">Selling something? Join the seller list</h2>
      <p className="mt-2 text-ink-soft">Tell us what you sell. We&apos;ll help you set up your shop and hear what you need next.</p>
      {data && data.count > 0 && <p className="mt-2 text-sm font-semibold" data-testid="waitlist-count">{data.count} {data.count === 1 ? "seller has" : "sellers have"} joined.</p>}
      {state === "done" ? (
        <p role="status" className="mt-4 rounded-xl bg-[#d9f5e6] px-3 py-2 font-semibold">Thanks! You&apos;re on the list.</p>
      ) : (
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label="Email" className="min-w-0 rounded-full border-2 border-ink bg-white px-4 py-2" />
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Business type" className="min-w-0 rounded-full border-2 border-ink bg-white px-4 py-2">
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <input tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={hp} onChange={(e) => setHp(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" />
          <button type="submit" disabled={state === "busy"} className="btn btn-ink disabled:opacity-60">{state === "busy" ? "Saving…" : "Join"}</button>
        </form>
      )}
      {state !== "idle" && state !== "busy" && state !== "done" && <p role="alert" className="mt-2 text-sm">{state}</p>}
      <p className="mt-4 text-sm">
        Questions? <a href={X_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">Talk to us on X ↗</a>
      </p>
    </div>
  );
}
