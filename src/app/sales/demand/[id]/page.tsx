"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { api } from "@/lib/client-api";
import { DemandLetter } from "@/components/sales/SalesDocuments";

/** A printable demand letter (use the browser's Print → Save as PDF). */
export default function DemandLetterPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api(`/api/sales/installments/${id}/letter`).then(setDoc).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="p-8 text-center text-sm text-rose-600">{error}</div>;
  if (!doc) return <div className="p-8 text-center text-sm text-slate-500">Loading…</div>;

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-2xl items-center justify-between px-4 print:hidden">
        <Link href="/sales?tab=bookings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Bookings
        </Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
          <Printer className="h-4 w-4" /> Print or save PDF
        </button>
      </div>
      <div className="mx-auto max-w-2xl px-4 print:max-w-none print:px-0">
        <DemandLetter letter={doc} today={new Date(Date.now() + 19_800_000).toISOString().slice(0, 10)} />
      </div>
    </div>
  );
}
