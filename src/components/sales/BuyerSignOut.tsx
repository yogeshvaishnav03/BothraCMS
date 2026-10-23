"use client";

import { LogOut } from "lucide-react";

/** Signs the buyer out on this phone and back to the sign-in page. */
export function BuyerSignOut() {
  return (
    <button
      onClick={async () => {
        await fetch("/api/portal/sign-out", { method: "POST" }).catch(() => null);
        window.location.href = "/portal/sign-in";
      }}
      className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/20"
    >
      <LogOut className="h-3.5 w-3.5" /> Sign out
    </button>
  );
}
