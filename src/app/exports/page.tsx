"use client";

import React, { useEffect, useMemo, useState } from "react";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Field, StatTile, inputCls } from "@/components/ui/Modal";
import { api, rupees } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { Download, FileSpreadsheet, FileCode2, Landmark } from "lucide-react";

const ist = () => new Date(Date.now() + 19_800_000);
const key = (d: Date) => d.toISOString().slice(0, 10);

/** Common ranges an accountant asks for: this month, last month, this quarter, this financial year. */
function presets() {
  const now = ist();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const monthStart = (yy: number, mm: number) => key(new Date(Date.UTC(yy, mm, 1)));
  const monthEnd = (yy: number, mm: number) => key(new Date(Date.UTC(yy, mm + 1, 0)));
  const q = Math.floor(((m + 9) % 12) / 3); // Indian FY quarters start in April
  const qStartMonth = (3 + q * 3) % 12;
  const qYear = m < 3 && qStartMonth >= 3 ? y - 1 : y;
  const fyStart = m < 3 ? y - 1 : y;
  return [
    { id: "this-month", label: "This month", from: monthStart(y, m), to: key(now) },
    { id: "last-month", label: "Last month", from: monthStart(m === 0 ? y - 1 : y, (m + 11) % 12), to: monthEnd(m === 0 ? y - 1 : y, (m + 11) % 12) },
    { id: "quarter", label: `Q${q + 1} this year`, from: monthStart(qYear, qStartMonth), to: key(now) },
    { id: "fy", label: `FY ${fyStart}-${String(fyStart + 1).slice(2)}`, from: `${fyStart}-04-01`, to: key(now) },
  ];
}

type Part = "bills" | "payments" | "receipts";

export default function ExportsPage() {
  const ranges = useMemo(presets, []);
  const [from, setFrom] = useState(ranges[0].from);
  const [to, setTo] = useState(ranges[0].to);
  const [parts, setParts] = useState<Record<Part, boolean>>({ bills: true, payments: true, receipts: true });
  const [summary, setSummary] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!from || !to || from > to) return;
    setSummary(null);
    api(`/api/exports/summary?from=${from}&to=${to}`).then(setSummary).catch((e) => setError(e.message));
  }, [from, to]);

  const qs = `from=${from}&to=${to}`;
  const activeRange = ranges.find((r) => r.from === from && r.to === to)?.id;
  const chosen = (Object.keys(parts) as Part[]).filter((p) => parts[p]);
  const download = (href: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <Shell>
      <div className="space-y-5">
        <PageHeader icon={Landmark} title="Accounts Export" subtitle="Download bills, payments, and receipts to share with your accountant or import into Tally." />
        {error && <Alert tone="error" onDismiss={() => setError(null)}>{error}</Alert>}

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex flex-wrap gap-1.5">
            {ranges.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setFrom(r.from);
                  setTo(r.to);
                }}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-bold transition",
                  activeRange === r.id ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="mt-3 grid max-w-md grid-cols-2 gap-3">
            <Field label="From">
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
            </Field>
            <Field label="To">
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputCls} />
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile value={summary ? rupees(summary.bills.amount) : "…"} label={`Supplier bills (${summary?.bills.count ?? "…"})`} />
          <StatTile value={summary ? rupees(summary.payments.amount) : "…"} label={`Payments made (${summary?.payments.count ?? "…"})`} tone="rose" />
          <StatTile value={summary ? rupees(summary.receipts.amount) : "…"} label={`Received from customers (${summary?.receipts.count ?? "…"})`} tone="emerald" />
          <StatTile value={summary ? rupees(summary.receipts.gst) : "…"} label="GST collected on receipts" tone="amber" hint={summary ? `on ${rupees(summary.receipts.taxable)} taxable` : undefined} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center gap-2">
              <FileCode2 className="h-5 w-5 text-amber-500" />
              <h2 className="font-display font-bold text-slate-900">Tally import file</h2>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              One XML file with the vouchers and the ledgers they use. In Tally Prime: Gateway of Tally → Import → Vouchers, and pick this file. Ledgers that already exist are left as they are.
            </p>
            <div className="mt-3 space-y-2 text-sm">
              {(
                [
                  ["bills", "Supplier bills as Purchase vouchers"],
                  ["payments", "Payments as Payment vouchers (wages and salaries included)"],
                  ["receipts", "Customer receipts as a Sales invoice (with CGST/SGST) and a Receipt"],
                ] as [Part, string][]
              ).map(([p, label]) => (
                <label key={p} className="flex items-start gap-2">
                  <input type="checkbox" checked={parts[p]} onChange={(e) => setParts({ ...parts, [p]: e.target.checked })} className="mt-0.5 rounded border-slate-300" />
                  <span className="text-slate-700">{label}</span>
                </label>
              ))}
            </div>
            <button
              disabled={chosen.length === 0}
              onClick={() => download(`/api/exports/tally?${qs}&parts=${chosen.join(",")}`)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              <Download className="h-4 w-4" /> Download for Tally
            </button>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              <h2 className="font-display font-bold text-slate-900">Sheets for GST & Bank Accounts</h2>
            </div>
            <p className="mt-1 text-sm text-slate-600">Spreadsheets (CSV) that open in Excel. Send them to your accountant for monthly GST returns.</p>
            <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {[
                { kind: "gst-sales", title: "GST sales register", hint: "Each customer receipt with taxable value, CGST and SGST (for GSTR-1 and 3B)" },
                { kind: "purchases", title: "Purchase register", hint: "Supplier bills with GSTIN, to match input credit in GSTR-2B" },
                { kind: "payments", title: "Payments list", hint: "All completed payments, to match with your bank statement" },
              ].map((r) => (
                <li key={r.kind} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900">{r.title}</div>
                    <div className="text-xs text-slate-500">{r.hint}</div>
                  </div>
                  <button onClick={() => download(`/api/exports/${r.kind}?${qs}`)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                    <Download className="h-3.5 w-3.5" /> CSV
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </Shell>
  );
}
