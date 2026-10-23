import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, CalendarClock, CheckCircle2, Camera, Receipt, Phone } from "lucide-react";
import { SalesService } from "@/services/sales-service";
import { rupees, shortDate } from "@/lib/client-api";
import { requireBuyerAccess } from "@/lib/buyer-gate";
import { BuyerSignOut } from "@/components/sales/BuyerSignOut";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your home", robots: { index: false, follow: false } };

/** The buyer's own page: payment schedule, receipts, construction progress and site photos. */
export default async function BuyerPortal({ params }: { params: { token: string } }) {
  const signedIn = await requireBuyerAccess(params.token, `/portal/${params.token}`);
  const view = await SalesService.portalView(params.token);
  if (!view) notFound();
  const { company, booking, unit, project, installments } = view;
  const paidPct = view.total ? Math.round((view.received / view.total) * 100) : 0;
  const nextDue = installments.find((i) => i.dueDate && i.receivedAmount < i.total);

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <header className="bg-slate-900 px-4 pb-16 pt-6 text-white">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-400">
            <Building2 className="h-4 w-4" /> {company.name}
          </div>
          <h1 className="mt-3 font-display text-2xl font-extrabold">Hello, {booking.customerName.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-slate-300">
            Unit {unit.unitNumber} · {unit.unitType}
            {unit.floor ? ` · Floor ${unit.floor}` : ""}
            {unit.areaSqft ? ` · ${unit.areaSqft} sq ft` : ""} · {project.name}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            Booking {booking.bookingNumber} on {shortDate(booking.bookingDate)}
          </p>
          {signedIn && <BuyerSignOut />}
        </div>
      </header>

      <main className="mx-auto -mt-10 max-w-3xl space-y-4 px-4">
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs font-semibold text-slate-500">Construction</div>
            <div className="mt-1 font-display text-2xl font-extrabold text-slate-900">{view.progress === null ? "—" : `${view.progress}%`}</div>
            <div className="mt-2 h-1.5 rounded-full bg-slate-100">
              <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${view.progress ?? 0}%` }} />
            </div>
            {project.endDate && <div className="mt-2 text-xs text-slate-500">Planned handover {shortDate(project.endDate)}</div>}
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs font-semibold text-slate-500">Paid so far</div>
            <div className="mt-1 font-display text-2xl font-extrabold text-slate-900">{rupees(view.received)}</div>
            <div className="mt-2 h-1.5 rounded-full bg-slate-100">
              <div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${paidPct}%` }} />
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {paidPct}% of {rupees(view.total)}
              {booking.gstRate ? ` incl. ${booking.gstRate}% GST` : ""}
            </div>
          </div>
          <div className={`rounded-2xl p-4 shadow-sm ring-1 ${view.dueNow > 0 ? "bg-amber-50 ring-amber-200" : "bg-white ring-slate-200"}`}>
            <div className="text-xs font-semibold text-slate-500">To pay now</div>
            <div className="mt-1 font-display text-2xl font-extrabold text-slate-900">{rupees(view.dueNow)}</div>
            <div className="mt-2 text-xs text-slate-600">
              {nextDue ? `${nextDue.label}, due ${shortDate(nextDue.dueDate)}` : "Nothing due right now"}
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-900">
            <CalendarClock className="h-4 w-4 text-slate-400" /> Payment schedule
          </h2>
          <ul className="divide-y divide-slate-100">
            {installments.map((i) => {
              const paid = i.receivedAmount >= i.total;
              return (
                <li key={i.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{i.label}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {paid
                          ? "Paid"
                          : i.dueDate
                            ? `${i.overdue ? "Was due" : "Due"} ${shortDate(i.dueDate)}`
                            : "Falls due when this stage is reached"}
                        {i.gstAmount ? ` · incl. GST ${rupees(i.gstAmount)}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-bold tabular-nums text-slate-900">{rupees(i.total)}</div>
                      <span
                        className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          paid ? "bg-emerald-50 text-emerald-700" : i.overdue ? "bg-rose-50 text-rose-700" : i.dueDate ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {paid ? <CheckCircle2 className="h-3 w-3" /> : null}
                        {paid ? "Paid" : i.receivedAmount > 0 ? `${rupees(i.total - i.receivedAmount)} left` : i.overdue ? "Overdue" : i.dueDate ? "Due" : "Later"}
                      </span>
                    </div>
                  </div>
                  {i.receipts.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {i.receipts.map((r) =>
                        r.receiptNumber ? (
                          <Link
                            key={r.id}
                            href={`/portal/${params.token}/receipt/${r.id}`}
                            className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                          >
                            <Receipt className="h-3 w-3" /> {r.receiptNumber} · {rupees(r.amount)}
                          </Link>
                        ) : (
                          <span key={r.id} className="rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-500 ring-1 ring-slate-200">
                            {shortDate(r.date)} · {rupees(r.amount)}
                          </span>
                        )
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {view.stages.length > 0 && (
          <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-900">Construction stages</h2>
            <ul className="space-y-2.5 px-4 py-3">
              {view.stages.map((s) => (
                <li key={s.name}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className={s.progressPercent >= 100 ? "font-semibold text-slate-900" : "text-slate-600"}>{s.name}</span>
                    <span className="tabular-nums text-slate-500">{s.progressPercent}%</span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-slate-100">
                    <div className={`h-1 rounded-full ${s.progressPercent >= 100 ? "bg-emerald-500" : "bg-sky-500"}`} style={{ width: `${s.progressPercent}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {view.photos.length > 0 && (
          <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-900">
              <Camera className="h-4 w-4 text-slate-400" /> Latest from site
            </h2>
            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
              {view.photos.map((p) => (
                <figure key={`${p.updateId}-${p.n}`} className="overflow-hidden rounded-xl bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/portal/${params.token}/photo/${p.updateId}/${p.n}`} alt={p.stage} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  <figcaption className="px-2 py-1.5 text-[11px] text-slate-600">
                    <span className="font-semibold text-slate-800">{p.stage}</span> · {shortDate(p.at)}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        <footer className="pt-2 text-center text-xs text-slate-500">
          {company.phone ? (
            <a href={`tel:${company.phone}`} className="inline-flex items-center gap-1 font-semibold text-slate-700">
              <Phone className="h-3.5 w-3.5" /> Questions? Call {company.phone}
            </a>
          ) : (
            <>Questions? Call our office.</>
          )}
          <div className="mt-1">This page is private to you. Please do not share the link.</div>
        </footer>
      </main>
    </div>
  );
}
