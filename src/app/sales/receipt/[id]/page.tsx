"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Ban, Printer } from "lucide-react";
import { api, post } from "@/lib/client-api";
import { ReceiptDocument } from "@/components/sales/SalesDocuments";

/** A printable customer receipt (use the browser's Print → Save as PDF). */
export default function SalesReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<any>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = () => api(`/api/sales/receipts/${id}`).then(setDoc).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api("/api/auth/me").then((d: any) => setMe(d.user)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const isAdmin = me?.role === "SUPER_ADMIN" || me?.role === "ORG_ADMIN";

  if (error) return <div className="p-8 text-center text-sm text-rose-600">{error}</div>;
  if (!doc) return <div className="p-8 text-center text-sm text-slate-500">Loading…</div>;

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-2xl items-center justify-between px-4 print:hidden">
        <Link href="/sales?tab=bookings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Bookings
        </Link>
        <div className="flex gap-2">
          {isAdmin && !doc.cancelledAt && doc.booking.status === "ACTIVE" && (
            <button onClick={() => setCancelling(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50">
              <Ban className="h-4 w-4" /> Cancel receipt
            </button>
          )}
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
            <Printer className="h-4 w-4" /> Print or save PDF
          </button>
        </div>
      </div>
      {cancelling && (
        <div className="mx-auto mb-4 max-w-2xl px-4 print:hidden">
          <div className="rounded-xl border border-rose-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-700">
              Cancelling takes {doc.receiptNumber} off the instalment, so the buyer owes this amount again. The receipt stays on record, marked cancelled, and drops out of the
              GST sales register and Tally export.
            </p>
            <input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why? e.g. cheque bounced, entered twice"
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            {cancelError && <p className="mt-2 text-xs text-rose-600">{cancelError}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setCancelling(false)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
                Keep it
              </button>
              <button
                disabled={busy || reason.trim().length < 3}
                onClick={async () => {
                  setBusy(true);
                  setCancelError(null);
                  try {
                    await api(`/api/sales/receipts/${id}/cancel`, post({ reason: reason.trim() }));
                    setCancelling(false);
                    await load();
                  } catch (e: any) {
                    setCancelError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Cancel receipt
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-2xl px-4 print:max-w-none print:px-0">
        <ReceiptDocument receipt={doc} />
      </div>
    </div>
  );
}
