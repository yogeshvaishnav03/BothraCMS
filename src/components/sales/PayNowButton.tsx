"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";

/** "Pay now" on the buyer's page: makes a Razorpay link for the instalment and opens it. */
export function PayNowButton({ token, installmentId, label }: { token: string; installmentId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-2 text-right">
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch(`/api/portal/${token}/pay`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ installmentId }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json?.data?.url) throw new Error(json?.error?.message || "Could not start the payment. Try again.");
            window.location.href = json.data.url;
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />} {label}
      </button>
      {error && <div className="mt-1 text-[11px] text-rose-600">{error}</div>}
    </div>
  );
}
