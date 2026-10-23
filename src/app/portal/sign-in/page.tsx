"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Building2, ChevronRight, Home, Loader2, Smartphone } from "lucide-react";
import { api, post } from "@/lib/client-api";

interface HomeRow {
  token: string;
  bookingNumber: string;
  customerName: string;
  unitNumber: string;
  unitType: string;
  project: string;
  company: string;
}

/** Only our own portal pages are allowed as the place to go after signing in. */
const safeNext = (next: string | null) => (next && /^\/portal\/[A-Za-z0-9_-]{20,}(\/receipt\/[A-Za-z0-9-]+)?$/.test(next) ? next : null);

function SignIn() {
  const next = safeNext(useSearchParams().get("next"));
  const [step, setStep] = useState<"PHONE" | "CODE" | "HOMES">("PHONE");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [homes, setHomes] = useState<HomeRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeBox = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const askCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ sentTo: string }>("/api/portal/sign-in", post({ phone }));
      setSentTo(r.sentTo);
      setStep("CODE");
      setCode("");
      setWait(30);
      setTimeout(() => codeBox.current?.focus(), 50);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const check = async (typed = code) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ homes: HomeRow[] }>("/api/portal/sign-in/verify", post({ phone, code: typed }));
      const own = next && r.homes.some((h) => next.startsWith(`/portal/${h.token}`));
      if (own) return void (window.location.href = next!);
      if (r.homes.length === 1) return void (window.location.href = `/portal/${r.homes[0].token}`);
      setHomes(r.homes);
      setStep("HOMES");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 px-4 pb-20 pt-8 text-white">
        <div className="mx-auto max-w-md">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-400">
            <Building2 className="h-4 w-4" /> Your home
          </div>
          <h1 className="mt-3 font-display text-2xl font-extrabold">{step === "HOMES" ? "Your homes" : "Sign in"}</h1>
          <p className="mt-1 text-sm text-slate-300">
            {step === "HOMES" ? "Pick one to see its payments and construction." : "Use the mobile number on your booking. We will send you a 6-digit code."}
          </p>
        </div>
      </header>

      <main className="mx-auto -mt-12 max-w-md px-4 pb-12">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          {error && <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">{error}</p>}

          {step === "PHONE" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                askCode();
              }}
              className="space-y-4"
            >
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Mobile number</span>
                <div className="mt-1.5 flex items-center rounded-xl ring-1 ring-slate-300 focus-within:ring-2 focus-within:ring-amber-500">
                  <span className="pl-3 text-base text-slate-500">+91</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    autoFocus
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, "").slice(0, 12))}
                    placeholder="98290 12345"
                    className="w-full rounded-xl bg-transparent px-2 py-3 text-base outline-none"
                  />
                </div>
              </label>
              <button
                disabled={busy || phone.replace(/\D/g, "").length < 10}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-3 text-base font-bold text-white disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Smartphone className="h-5 w-5" />} Send code
              </button>
            </form>
          )}

          {step === "CODE" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                check();
              }}
              className="space-y-4"
            >
              <p className="text-sm text-slate-600">
                We sent a code to <b className="text-slate-900">{sentTo}</b> on WhatsApp or SMS. It works for 10 minutes.
              </p>
              <input
                ref={codeBox}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(v);
                  if (v.length === 6) check(v);
                }}
                placeholder="••••••"
                aria-label="6-digit code"
                className="w-full rounded-xl px-3 py-3 text-center font-mono text-2xl tracking-[0.5em] ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button disabled={busy || code.length !== 6} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-3 text-base font-bold text-white disabled:opacity-50">
                {busy && <Loader2 className="h-5 w-5 animate-spin" />} Sign in
              </button>
              <div className="flex items-center justify-between text-sm">
                <button type="button" onClick={() => setStep("PHONE")} className="inline-flex items-center gap-1 font-semibold text-slate-600">
                  <ArrowLeft className="h-4 w-4" /> Change number
                </button>
                <button type="button" disabled={wait > 0 || busy} onClick={askCode} className="font-semibold text-amber-700 disabled:text-slate-400">
                  {wait > 0 ? `Send again in ${wait}s` : "Send again"}
                </button>
              </div>
            </form>
          )}

          {step === "HOMES" && (
            <ul className="-my-2 divide-y divide-slate-100">
              {homes.map((h) => (
                <li key={h.token}>
                  <Link href={`/portal/${h.token}`} className="flex items-center gap-3 py-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                      <Home className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-900">
                        Unit {h.unitNumber} · {h.project}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {h.unitType} · Booking {h.bookingNumber} · {h.company}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">Number changed? Ask the sales office to update it on your booking.</p>
      </main>
    </div>
  );
}

export default function BuyerSignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
