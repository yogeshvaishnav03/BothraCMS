"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Field, Modal, StatTile, Tabs, inputCls } from "@/components/ui/Modal";
import { ContactActions, WhatsAppIcon } from "@/components/ui/ContactActions";
import { whatsappLink } from "@/lib/contact-links";
import Link from "next/link";
import { api, post, rupees, shortDate, toPaise } from "@/lib/client-api";
import { formatCompactINR } from "@/lib/formatters";
import { canUser } from "@/lib/permissions";
import { cn } from "@/lib/cn";
import { BellRing, Building, CalendarClock, ChevronDown, ExternalLink, FileText, Handshake, IndianRupee, KeyRound, LayoutGrid, Link2, Plus, Receipt, Target, UserPlus, Zap } from "lucide-react";

type Tab = "leads" | "units" | "bookings";

const STAGES = [
  { id: "NEW", label: "New", tone: "bg-slate-400" },
  { id: "CONTACTED", label: "Contacted", tone: "bg-blue-500" },
  { id: "SITE_VISIT", label: "Site visit", tone: "bg-violet-500" },
  { id: "NEGOTIATION", label: "Negotiation", tone: "bg-amber-500" },
  { id: "BOOKED", label: "Booked", tone: "bg-emerald-500" },
  { id: "LOST", label: "Lost", tone: "bg-rose-400" },
];
const SOURCES: Record<string, string> = { WALK_IN: "Walk-in", REFERRAL: "Referral", WEBSITE: "Website", PORTAL: "Property portal", NEWSPAPER: "Newspaper", SOCIAL: "Social media", BROKER: "Broker", OTHER: "Other" };
const UNIT_STATUS: Record<string, { label: string; tile: string }> = {
  AVAILABLE: { label: "Available", tile: "bg-white ring-emerald-300 hover:bg-emerald-50 text-slate-900" },
  HOLD: { label: "On hold", tile: "bg-amber-50 ring-amber-300 text-amber-900" },
  BOOKED: { label: "Booked", tile: "bg-blue-600 ring-blue-600 text-white" },
  SOLD: { label: "Fully paid", tile: "bg-slate-800 ring-slate-800 text-white" },
};
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
/** Usual GST on an under-construction unit; the office can change it per booking. */
const gstFor = (unitType?: string) => (unitType === "SHOP" || unitType === "OFFICE" ? 12 : unitType === "PLOT" ? 0 : 5);
const firstName = (n: string) => n.split(" ")[0];
const demandMessage = (b: any, i: any, portal?: string | null) =>
  `Namaste ${firstName(b.customerName)}, construction of ${b.unit.project.name} has reached the stage for "${i.label}". ` +
  `${rupees(i.total - i.receivedAmount)} is due for unit ${b.unit.unitNumber} by ${shortDate(i.dueDate)}.` +
  (portal ? ` See your schedule, receipts and site photos here: ${portal}` : "") +
  ` Thank you.`;

function LeadModal({ projects, onClose, onSaved }: { projects: any[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", source: "WALK_IN", projectId: projects[0]?.id || "", interest: "", budget: "", nextFollowUp: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title="New enquiry"
      icon={UserPlus}
      onClose={onClose}
      error={error}
      saving={saving}
      onSubmit={async () => {
        setSaving(true);
        setError(null);
        try {
          await api(
            "/api/sales/leads",
            post({ ...f, email: f.email || null, projectId: f.projectId || null, interest: f.interest || null, budget: f.budget ? toPaise(Number(f.budget) * 100000) : null, nextFollowUp: f.nextFollowUp || null, note: f.note || null })
          );
          onSaved();
        } catch (e: any) {
          setError(e.message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Mobile">
          <input required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="98290 12345" className={inputCls} />
        </Field>
        <Field label="Came from">
          <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} className={inputCls}>
            {Object.entries(SOURCES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Project">
          <select value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })} className={inputCls}>
            <option value="">Any</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Looking for">
          <input value={f.interest} onChange={(e) => setF({ ...f, interest: e.target.value })} placeholder="3BHK, east facing" className={inputCls} />
        </Field>
        <Field label="Budget (₹ lakh)">
          <input type="number" min="0" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Follow up on">
          <input type="date" value={f.nextFollowUp} onChange={(e) => setF({ ...f, nextFollowUp: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Email">
          <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={inputCls} />
        </Field>
      </div>
      <Field label="Note">
        <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={inputCls} />
      </Field>
    </Modal>
  );
}

function LeadDetail({ lead, units, plans, onClose, onSaved }: { lead: any; units: any[]; plans: any[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const [kind, setKind] = useState("CALL");
  const [note, setNote] = useState("");
  const [stage, setStage] = useState(lead.stage);
  const [nextFollowUp, setNext] = useState(lead.nextFollowUp || "");
  const [lostReason, setLostReason] = useState("");
  const [booking, setBooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (booking) return <BookModal units={units.filter((u) => u.status === "AVAILABLE" && (!lead.projectId || u.projectId === lead.projectId))} plans={plans} lead={lead} onClose={() => setBooking(false)} onSaved={onSaved} />;
  return (
    <Modal
      wide
      title={lead.name}
      icon={Target}
      onClose={onClose}
      error={error}
      saving={saving}
      submitLabel="Save update"
      onSubmit={async () => {
        if (!note.trim()) return setError("Write what was discussed.");
        setSaving(true);
        setError(null);
        try {
          await api(`/api/sales/leads/${lead.id}/activity`, post({ kind, note, stage, nextFollowUp: nextFollowUp || null, lostReason: lostReason || null }));
          onSaved("Lead updated.");
        } catch (e: any) {
          setError(e.message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3">
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-semibold text-slate-900">{lead.phone}</div>
          <div className="text-xs text-slate-500">
            {SOURCES[lead.source]} · {lead.interest || "No preference yet"}
            {lead.budget ? ` · budget ${formatCompactINR(lead.budget)}` : ""}
            {lead.projectName && ` · ${lead.projectName}`}
          </div>
        </div>
        <ContactActions phone={lead.phone} message={`Namaste ${lead.name.split(" ")[0]}, `} size="sm" />
        {lead.stage !== "BOOKED" && lead.stage !== "LOST" && (
          <button type="button" onClick={() => setBooking(true)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">
            <KeyRound className="h-3.5 w-3.5" /> Book a unit
          </button>
        )}
      </div>
      {lead.stage !== "BOOKED" && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {[
              ["CALL", "Call"],
              ["WHATSAPP", "WhatsApp"],
              ["SITE_VISIT", "Site visit"],
              ["MEETING", "Meeting"],
              ["NOTE", "Note"],
            ].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={cn("rounded-full px-3 py-1 text-xs font-bold ring-1", kind === k ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200")}>
                {l}
              </button>
            ))}
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What was discussed?" className={inputCls} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stage">
              <select value={stage} onChange={(e) => setStage(e.target.value)} className={inputCls}>
                {STAGES.filter((s) => s.id !== "BOOKED").map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            {stage === "LOST" ? (
              <Field label="Why lost?">
                <input required value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="Bought elsewhere, budget…" className={inputCls} />
              </Field>
            ) : (
              <Field label="Next follow-up">
                <input type="date" value={nextFollowUp} onChange={(e) => setNext(e.target.value)} className={inputCls} />
              </Field>
            )}
          </div>
        </>
      )}
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">History</div>
        <ol className="space-y-2 border-l-2 border-slate-200 pl-4">
          {lead.activities.map((a: any) => (
            <li key={a.id} className="text-sm">
              <span className="font-semibold text-slate-800">{a.kind === "STAGE" ? "Stage" : a.kind.replace("_", " ").toLowerCase()}</span>
              <span className="text-slate-600">: {a.note}</span>
              <div className="text-xs text-slate-400">
                {a.byName} · {shortDate(a.createdAt)}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Modal>
  );
}

function BookModal({ units, plans, lead, unit, onClose, onSaved }: { units: any[]; plans: any[]; lead?: any; unit?: any; onClose: () => void; onSaved: (msg: string) => void }) {
  const [unitId, setUnitId] = useState(unit?.id || units[0]?.id || "");
  const chosen = unit || units.find((u) => u.id === unitId);
  const [f, setF] = useState({ customerName: lead?.name || "", customerPhone: lead?.phone || "", customerEmail: lead?.email || "", agreementValue: chosen ? String(chosen.price / 100) : "", plan: plans[0]?.key || "", bookingDate: today(), gstRate: String(gstFor(chosen?.unitType)) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = plans.find((p) => p.key === f.plan);
  return (
    <Modal
      title={`Book ${chosen ? chosen.unitNumber : "a unit"}`}
      icon={KeyRound}
      onClose={onClose}
      error={error}
      saving={saving}
      submitLabel="Confirm booking"
      onSubmit={async () => {
        setSaving(true);
        setError(null);
        try {
          const b = await api("/api/sales/bookings", post({ unitId: chosen?.id, leadId: lead?.id || null, ...f, customerEmail: f.customerEmail || null, agreementValue: toPaise(f.agreementValue), gstRate: Number(f.gstRate || 0) }));
          onSaved(`Booked. Booking number ${b.bookingNumber}, payment schedule created.`);
        } catch (e: any) {
          setError(e.message);
        } finally {
          setSaving(false);
        }
      }}
    >
      {!unit && (
        <Field label="Unit">
          <select
            required
            value={unitId}
            onChange={(e) => {
              setUnitId(e.target.value);
              const u = units.find((x) => x.id === e.target.value);
              if (u) setF({ ...f, agreementValue: String(u.price / 100), gstRate: String(gstFor(u.unitType)) });
            }}
            className={inputCls}
          >
            {units.length === 0 && <option value="">No units available</option>}
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.unitNumber} · {u.unitType} · {u.project.name} · {formatCompactINR(u.price)}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Customer name">
          <input required value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Mobile">
          <input required value={f.customerPhone} onChange={(e) => setF({ ...f, customerPhone: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Agreement value (₹)">
          <input required type="number" min="1" value={f.agreementValue} onChange={(e) => setF({ ...f, agreementValue: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Booking date">
          <input type="date" value={f.bookingDate} onChange={(e) => setF({ ...f, bookingDate: e.target.value })} className={inputCls} />
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <Field label="Payment plan">
          <select value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })} className={inputCls}>
            {plans.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="GST %">
          <select value={f.gstRate} onChange={(e) => setF({ ...f, gstRate: e.target.value })} className={inputCls}>
            {["0", "1", "5", "12", "18"].map((r) => (
              <option key={r} value={r}>
                {r}%
              </option>
            ))}
          </select>
        </Field>
      </div>
      {plan && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
          {plan.steps.map((s: any) => (
            <li key={s.label} className="flex justify-between px-3 py-1.5">
              <span className="text-slate-700">
                {s.label}
                <span className="ml-1 text-xs text-slate-400">{s.due === null ? "(when reached)" : s.due === 0 ? "(now)" : `(in ${s.due} days)`}</span>
              </span>
              <span className="tabular-nums text-slate-900">
                {s.percent}% · {rupees(Math.round((toPaise(f.agreementValue) * s.percent) / 100))}
                {Number(f.gstRate) > 0 && <span className="ml-1 text-xs text-slate-400">+ GST</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function UnitsModal({ projects, onClose, onSaved }: { projects: any[]; onClose: () => void; onSaved: (n: number) => void }) {
  const [f, setF] = useState({ projectId: projects[0]?.id || "", prefix: "A-", from: "101", to: "104", unitType: "3BHK", floor: "", areaSqft: "", price: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const numbers = useMemo(() => {
    const a = Number(f.from);
    const b = Number(f.to || f.from);
    if (!Number.isInteger(a) || !Number.isInteger(b) || b < a || b - a > 200) return [];
    return Array.from({ length: b - a + 1 }, (_, i) => `${f.prefix}${a + i}`);
  }, [f.prefix, f.from, f.to]);
  return (
    <Modal
      title="Add units for sale"
      icon={Building}
      onClose={onClose}
      error={error}
      saving={saving}
      submitLabel={`Add ${numbers.length} unit${numbers.length === 1 ? "" : "s"}`}
      onSubmit={async () => {
        setSaving(true);
        setError(null);
        try {
          const d = await api("/api/sales/units", post({ projectId: f.projectId, unitNumbers: numbers, unitType: f.unitType, floor: f.floor || null, areaSqft: f.areaSqft ? Number(f.areaSqft) : null, price: toPaise(f.price) }));
          onSaved(d.added);
        } catch (e: any) {
          setError(e.message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <Field label="Project">
        <select value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })} className={inputCls}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Prefix">
          <input value={f.prefix} onChange={(e) => setF({ ...f, prefix: e.target.value })} className={inputCls} />
        </Field>
        <Field label="From number">
          <input required type="number" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className={inputCls} />
        </Field>
        <Field label="To number">
          <input type="number" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className={inputCls} />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-slate-500">{numbers.length ? `${numbers[0]}${numbers.length > 1 ? ` to ${numbers[numbers.length - 1]}` : ""}` : "Check the numbers"}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <select value={f.unitType} onChange={(e) => setF({ ...f, unitType: e.target.value })} className={inputCls}>
            {["1BHK", "2BHK", "3BHK", "4BHK", "VILLA", "PLOT", "SHOP", "OFFICE"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Floor">
          <input value={f.floor} onChange={(e) => setF({ ...f, floor: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Area (sq ft)">
          <input type="number" value={f.areaSqft} onChange={(e) => setF({ ...f, areaSqft: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Price each (₹)">
          <input required type="number" min="0" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} className={inputCls} />
        </Field>
      </div>
    </Modal>
  );
}

function ReceiveModal({ inst, onClose, onSaved }: { inst: any; onClose: () => void; onSaved: (r: { receiptId: string; receiptNumber: string }) => void }) {
  const [f, setF] = useState({ amount: String((inst.total - inst.receivedAmount) / 100), date: today(), mode: "NEFT_RTGS", reference: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title={`Receive: ${inst.label}`}
      icon={IndianRupee}
      onClose={onClose}
      error={error}
      saving={saving}
      submitLabel="Record receipt"
      onSubmit={async () => {
        setSaving(true);
        setError(null);
        try {
          onSaved(await api(`/api/sales/installments/${inst.id}/receive`, post({ ...f, amount: toPaise(f.amount), reference: f.reference || null })));
        } catch (e: any) {
          setError(e.message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)">
          <input required type="number" min="1" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Date">
          <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Mode">
          <select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })} className={inputCls}>
            <option value="NEFT_RTGS">NEFT / RTGS</option>
            <option value="UPI">UPI</option>
            <option value="CHEQUE">Cheque</option>
            <option value="HOME_LOAN">Home loan disbursal</option>
            <option value="CASH">Cash</option>
          </select>
        </Field>
        <Field label="UTR / cheque no.">
          <input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} className={inputCls} />
        </Field>
      </div>
      {inst.gstAmount > 0 && <p className="text-xs text-slate-500">This instalment is {rupees(inst.amount)} plus GST {rupees(inst.gstAmount)}. The receipt splits what you enter between the two.</p>}
    </Modal>
  );
}

export default function SalesPage() {
  const [me, setMe] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("leads");
  const [projects, setProjects] = useState<any[]>([]);
  const [leads, setLeads] = useState<any>(null);
  const [units, setUnits] = useState<any[] | null>(null);
  const [bookings, setBookings] = useState<any>(null);
  const [projectFilter, setProjectFilter] = useState("");
  const [modal, setModal] = useState<null | "lead" | "units" | "book">(null);
  const [lead, setLead] = useState<any>(null);
  const [bookUnit, setBookUnit] = useState<any>(null);
  const [receiving, setReceiving] = useState<any>(null);
  const [openBooking, setOpenBooking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<React.ReactNode>(null);
  const [portal, setPortal] = useState<Record<string, string>>({});
  const [showDemands, setShowDemands] = useState(false);

  const load = useCallback(async () => {
    try {
      const [l, u, b] = await Promise.all([api("/api/sales/leads"), api("/api/sales/units"), api("/api/sales/bookings")]);
      setLeads(l);
      setUnits(u);
      setBookings(b);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("tab");
    if (t === "units" || t === "bookings") setTab(t);
    if (sp.get("id") && t === "bookings") setOpenBooking(sp.get("id"));
    if (sp.get("demands")) setShowDemands(true);
    api("/api/auth/me").then((d: any) => setMe(d.user)).catch(() => {});
    api<any>("/api/projects").then((d) => setProjects(Array.isArray(d) ? d : d?.projects || [])).catch(() => {});
    load();
  }, [load]);

  const done = (msg: React.ReactNode) => {
    setModal(null);
    setLead(null);
    setBookUnit(null);
    setReceiving(null);
    setNotice(msg);
    load();
  };
  const canWrite = canUser(me, "sales:write");
  const canReceive = canUser(me, "finance:write");
  const plans = bookings?.plans || [];
  const shownUnits = (units || []).filter((u) => !projectFilter || u.projectId === projectFilter);
  const unitsByProject = shownUnits.reduce((m: Record<string, any[]>, u) => ((m[u.project.name] = m[u.project.name] || []).push(u), m), {});
  const bs = bookings?.summary;
  // Demands raised (by a stage finishing or by hand) that the buyer has not paid anything against yet.
  const demands = (bookings?.bookings || [])
    .filter((b: any) => b.status === "ACTIVE")
    .flatMap((b: any) => b.installments.filter((i: any) => i.demandRaisedAt && i.dueDate && i.receivedAmount === 0 && i.sortOrder > 1).map((i: any) => ({ b, i })));

  const portalLink = async (b: any, reset = false) => {
    try {
      const d = await api(`/api/sales/bookings/${b.id}/portal`, post({ reset }));
      const url = `${window.location.origin}${d.path}`;
      setPortal((p) => ({ ...p, [b.id]: url }));
      navigator.clipboard?.writeText(url).catch(() => {});
      return url;
    } catch (e: any) {
      setError(e.message);
      return null;
    }
  };

  return (
    <Shell>
      <div className="space-y-5">
        <PageHeader icon={Handshake} title="Sales" subtitle="Enquiries, unit inventory, bookings and customer payments.">
          {canWrite && tab === "leads" && (
            <button onClick={() => setModal("lead")} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-brand px-4 py-2 text-sm font-bold text-slate-950 shadow-glow">
              <UserPlus className="h-4 w-4" /> New enquiry
            </button>
          )}
          {canWrite && tab === "units" && (
            <button onClick={() => setModal("units")} disabled={!projects.length} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-brand px-4 py-2 text-sm font-bold text-slate-950 shadow-glow">
              <Plus className="h-4 w-4" /> Add units
            </button>
          )}
          {canWrite && tab === "bookings" && (
            <button onClick={() => setModal("book")} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-brand px-4 py-2 text-sm font-bold text-slate-950 shadow-glow">
              <KeyRound className="h-4 w-4" /> New booking
            </button>
          )}
        </PageHeader>

        {error && <Alert tone="error" onDismiss={() => setError(null)}>{error}</Alert>}
        {notice && <Alert tone="success" onDismiss={() => setNotice(null)}>{notice}</Alert>}

        {bs && units && leads && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile value={leads.leads.filter((l: any) => !["BOOKED", "LOST"].includes(l.stage)).length} label="Live enquiries" hint={`${leads.followUpsDue} follow-ups due`} tone="blue" />
            <StatTile value={`${units.filter((u) => u.status === "AVAILABLE").length}/${units.length}`} label="Units available" />
            <StatTile value={formatCompactINR(bs.salesValue)} label={`Booked (${bs.bookings} units)`} tone="emerald" />
            <StatTile value={formatCompactINR(bs.received)} label="Collected from customers" />
            <StatTile value={formatCompactINR(bs.overdue)} label="Overdue from customers" tone={bs.overdue ? "rose" : "slate"} hint={bs.overdueCustomers ? `${bs.overdueCustomers} customers` : undefined} />
          </div>
        )}

        {demands.length > 0 && canWrite && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
            <button onClick={() => setShowDemands(!showDemands)} className="flex w-full items-center gap-2 text-left text-sm">
              <Zap className="h-4 w-4 text-amber-600" />
              <span className="font-semibold text-amber-900">
                {demands.length} customer demand{demands.length === 1 ? "" : "s"} raised and not yet paid
              </span>
              <span className="text-xs text-amber-800">Send the letter and a WhatsApp to each buyer</span>
              <ChevronDown className={cn("ml-auto h-4 w-4 text-amber-700 transition", showDemands && "rotate-180")} />
            </button>
            {showDemands && (
              <ul className="mt-2 divide-y divide-amber-100 rounded-xl bg-white">
                {demands.map(({ b, i }: any) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm">
                    <span className="font-mono font-bold text-slate-900">{b.unit.unitNumber}</span>
                    <span className="font-semibold text-slate-800">{b.customerName}</span>
                    <span className="text-slate-500">
                      {i.label} · {rupees(i.total)} due {shortDate(i.dueDate)}
                      {i.demandAuto && " · raised when the stage was finished"}
                    </span>
                    <span className="ml-auto flex gap-1.5">
                      <Link href={`/sales/demand/${i.id}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50">
                        <FileText className="h-3.5 w-3.5" /> Letter
                      </Link>
                      <button
                        onClick={async () => {
                          const url = portal[b.id] || (await portalLink(b));
                          const link = whatsappLink(b.customerPhone, demandMessage(b, i, url));
                          if (link) window.open(link, "_blank", "noopener");
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white"
                      >
                        <WhatsAppIcon className="h-3.5 w-3.5" /> Send
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "leads", label: "Enquiries", count: leads?.leads.filter((l: any) => !["BOOKED", "LOST"].includes(l.stage)).length },
            { id: "units", label: "Units", count: units?.length },
            { id: "bookings", label: "Bookings & collections", count: bookings?.bookings.filter((b: any) => b.status === "ACTIVE").length },
          ]}
        />

        {tab === "leads" &&
          (!leads ? (
            <div className="skeleton h-64 rounded-2xl" />
          ) : (
            <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
              <div className="grid min-w-[1100px] grid-cols-6 gap-3">
                {STAGES.map((st) => {
                  const col = leads.leads.filter((l: any) => l.stage === st.id);
                  return (
                    <div key={st.id} className="rounded-2xl bg-slate-100/70 p-2">
                      <div className="mb-2 flex items-center gap-2 px-1.5 pt-1">
                        <span className={cn("h-2 w-2 rounded-full", st.tone)} />
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-600">{st.label}</span>
                        <span className="ml-auto text-xs font-bold text-slate-400">{col.length}</span>
                      </div>
                      <div className="space-y-2">
                        {col.map((l: any) => (
                          <button key={l.id} onClick={() => setLead(l)} className={cn("w-full rounded-xl bg-white p-3 text-left shadow-xs ring-1 transition hover:ring-amber-300", l.followUpDue ? "ring-amber-300" : "ring-slate-200")}>
                            <div className="truncate text-sm font-semibold text-slate-900">{l.name}</div>
                            <div className="truncate text-xs text-slate-500">{l.interest || SOURCES[l.source]}</div>
                            {l.budget && <div className="mt-1 text-xs font-semibold text-slate-700">{formatCompactINR(l.budget)}</div>}
                            {l.nextFollowUp && st.id !== "BOOKED" && st.id !== "LOST" && (
                              <div className={cn("mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold", l.followUpDue ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500")}>
                                {l.followUpDue ? <BellRing className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />} {shortDate(l.nextFollowUp)}
                              </div>
                            )}
                            {st.id === "LOST" && l.lostReason && <div className="mt-1 text-[11px] italic text-slate-400">{l.lostReason}</div>}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

        {tab === "units" &&
          (!units ? (
            <div className="skeleton h-64 rounded-2xl" />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm">
                  <option value="">All projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                  {Object.entries(UNIT_STATUS).map(([k, v]) => (
                    <span key={k} className="flex items-center gap-1.5">
                      <span className={cn("h-3 w-3 rounded ring-1", v.tile)} /> {v.label}
                    </span>
                  ))}
                </div>
              </div>
              {Object.keys(unitsByProject).length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No units added yet.</div>}
              {Object.entries(unitsByProject).map(([name, list]) => (
                <div key={name} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                  <div className="mb-3 flex items-center gap-2">
                    <LayoutGrid className="h-4 w-4 text-amber-500" />
                    <h3 className="font-display font-bold text-slate-900">{name}</h3>
                    <span className="text-xs text-slate-500">
                      {list.filter((u) => u.status === "AVAILABLE").length} of {list.length} available
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
                    {list.map((u) => {
                      const st = UNIT_STATUS[u.status];
                      return (
                        <button
                          key={u.id}
                          onClick={() => {
                            if (u.status === "AVAILABLE" && canWrite) setBookUnit(u);
                            else if (u.booking) {
                              setTab("bookings");
                              setOpenBooking(u.booking.id);
                            }
                          }}
                          title={u.booking ? `${u.booking.customerName} · ${u.booking.bookingNumber}` : st.label}
                          className={cn("rounded-xl p-2.5 text-left ring-1 transition", st.tile)}
                        >
                          <div className="font-mono text-sm font-bold">{u.unitNumber}</div>
                          <div className="text-[11px] opacity-75">
                            {u.unitType}
                            {u.areaSqft ? ` · ${u.areaSqft} sqft` : ""}
                          </div>
                          <div className="mt-1 truncate text-[11px] font-semibold">{u.booking ? u.booking.customerName : formatCompactINR(u.price)}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          ))}

        {tab === "bookings" &&
          (!bookings ? (
            <div className="skeleton h-64 rounded-2xl" />
          ) : bookings.bookings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No bookings yet.</div>
          ) : (
            <div className="space-y-3">
              {bookings.bookings.map((b: any) => {
                const isOpen = openBooking === b.id;
                const pct = b.total ? Math.round((b.received / b.total) * 100) : 0;
                return (
                  <div key={b.id} className={cn("rounded-2xl border bg-white shadow-xs", b.overdueAmount > 0 ? "border-rose-200" : "border-slate-200/80", b.status === "CANCELLED" && "opacity-60")}>
                    <button onClick={() => setOpenBooking(isOpen ? null : b.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 p-4 text-left">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold text-slate-900">{b.unit.unitNumber}</span>
                          <span className="font-semibold text-slate-900">{b.customerName}</span>
                          {b.status === "CANCELLED" && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">Cancelled</span>}
                          {b.overdueAmount > 0 && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white">{rupees(b.overdueAmount)} overdue</span>}
                        </div>
                        <div className="text-xs text-slate-500">
                          {b.bookingNumber} · {b.unit.project.name} · booked {shortDate(b.bookingDate)}
                          {b.nextDue && ` · next ${b.nextDue.label.toLowerCase()} ${shortDate(b.nextDue.dueDate)}`}
                        </div>
                      </div>
                      <div className="w-full sm:w-64">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-700">{rupees(b.received)} received</span>
                          <span className="text-slate-500">
                            of {rupees(b.total)}
                            {b.gstRate ? ` incl. ${b.gstRate}% GST` : ""}
                          </span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <ChevronDown className={cn("h-4 w-4 text-slate-400 transition", isOpen && "rotate-180")} />
                    </button>
                    {isOpen && (
                      <div className="border-t border-slate-100 px-4 pb-4 pt-2">
                        <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
                          {b.status === "ACTIVE" && canWrite && (
                            <div className="mr-auto flex flex-wrap items-center gap-1.5">
                              {portal[b.id] ? (
                                <>
                                  <a href={portal[b.id]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50">
                                    <ExternalLink className="h-3.5 w-3.5" /> Open buyer page
                                  </a>
                                  <a
                                    href={whatsappLink(b.customerPhone, `Namaste ${firstName(b.customerName)}, here is your private page for unit ${b.unit.unitNumber}: payment schedule, receipts and site photos. ${portal[b.id]}`) || "#"}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white"
                                  >
                                    <WhatsAppIcon className="h-3.5 w-3.5" /> Send link
                                  </a>
                                  <button
                                    onClick={async () => {
                                      if (window.confirm("Make a new link? The old link will stop working.")) {
                                        await portalLink(b, true);
                                        setNotice("New buyer link made and copied. The old link no longer works.");
                                      }
                                    }}
                                    className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
                                  >
                                    Reset link
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={async () => {
                                    if (await portalLink(b)) setNotice("Buyer page link copied. Send it on WhatsApp so they can see their schedule, receipts and site photos.");
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                                >
                                  <Link2 className="h-3.5 w-3.5" /> {b.hasPortal ? "Buyer page link" : "Make buyer page"}
                                </button>
                              )}
                            </div>
                          )}
                          <ContactActions
                            phone={b.customerPhone}
                            message={
                              b.overdueAmount > 0
                                ? `Namaste ${b.customerName.split(" ")[0]}, a gentle reminder that ${rupees(b.overdueAmount)} is due for unit ${b.unit.unitNumber} at ${b.unit.project.name}. Thank you.`
                                : `Namaste ${b.customerName.split(" ")[0]}, `
                            }
                            size="sm"
                          />
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[640px] text-sm">
                            <thead className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                              <tr>
                                <th className="py-1.5 text-left">Instalment</th>
                                <th className="py-1.5 text-left">Due</th>
                                <th className="py-1.5 text-right">Amount</th>
                                <th className="py-1.5 text-right">Received</th>
                                <th className="py-1.5" />
                              </tr>
                            </thead>
                            <tbody>
                              {b.installments.map((i: any) => {
                                const paid = i.receivedAmount >= i.total;
                                return (
                                  <tr key={i.id} className="border-t border-slate-100 align-top">
                                    <td className="py-2 text-slate-800">
                                      {i.label} <span className="text-xs text-slate-400">{i.percent}%</span>
                                      {!i.dueDate && b.status === "ACTIVE" && (
                                        <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                                          <Zap className="h-3 w-3 text-amber-500" />
                                          {canWrite && b.stages.length > 0 ? (
                                            <select
                                              value={i.linkedStage?.explicit ? i.linkedStage.id : ""}
                                              onChange={async (e) => {
                                                try {
                                                  await api(`/api/sales/installments/${i.id}/stage`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ milestoneId: e.target.value || null }) });
                                                  load();
                                                } catch (err: any) {
                                                  setError(err.message);
                                                }
                                              }}
                                              className="max-w-[16rem] rounded border-0 bg-transparent p-0 text-[11px] text-slate-600 focus:ring-0"
                                            >
                                              <option value="">{i.linkedStage && !i.linkedStage.explicit ? `Auto: when "${i.linkedStage.name}" is done` : "Not linked to a stage"}</option>
                                              {b.stages.map((m: any) => (
                                                <option key={m.id} value={m.id}>
                                                  When &quot;{m.name}&quot; is done ({m.progressPercent}%)
                                                </option>
                                              ))}
                                            </select>
                                          ) : (
                                            <span>{i.linkedStage ? `Raised when "${i.linkedStage.name}" is done (${i.linkedStage.progressPercent}%)` : "Raise by hand when reached"}</span>
                                          )}
                                        </div>
                                      )}
                                      {i.receipts.length > 0 && (
                                        <div className="mt-1 flex flex-wrap gap-1">
                                          {i.receipts.map((r: any) =>
                                            r.receiptNumber ? (
                                              <Link key={r.id} href={`/sales/receipt/${r.id}`} className="inline-flex items-center gap-1 rounded bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100">
                                                <Receipt className="h-3 w-3" /> {r.receiptNumber} · {rupees(r.amount)}
                                              </Link>
                                            ) : (
                                              <span key={r.id} className="rounded bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-500 ring-1 ring-slate-200">
                                                {shortDate(r.date)} · {rupees(r.amount)}
                                              </span>
                                            )
                                          )}
                                        </div>
                                      )}
                                    </td>
                                    <td className={cn("py-2", i.overdue ? "font-bold text-rose-600" : "text-slate-600")}>
                                      {i.dueDate ? shortDate(i.dueDate) : <span className="text-slate-400">When stage is reached</span>}
                                      {i.demandAuto && <div className="text-[11px] font-normal text-amber-700">raised automatically</div>}
                                    </td>
                                    <td className="py-2 text-right tabular-nums">
                                      {rupees(i.total)}
                                      {i.gstAmount > 0 && <div className="text-[11px] text-slate-400">incl. GST {rupees(i.gstAmount)}</div>}
                                    </td>
                                    <td className={cn("py-2 text-right tabular-nums", paid ? "text-emerald-700" : "text-slate-700")}>{i.receivedAmount ? rupees(i.receivedAmount) : "—"}</td>
                                    <td className="py-2 text-right">
                                      {b.status === "ACTIVE" && !paid && (
                                        <div className="flex justify-end gap-1.5">
                                          {!i.dueDate && canWrite && (
                                            <button
                                              onClick={async () => {
                                                try {
                                                  const d = await api(`/api/sales/installments/${i.id}/demand`, post({}));
                                                  setNotice(
                                                    <>
                                                      Demand raised, due {shortDate(d.dueDate)}.{" "}
                                                      <Link href={`/sales/demand/${i.id}`} className="font-bold underline">
                                                        Print the demand letter
                                                      </Link>
                                                    </>
                                                  );
                                                  load();
                                                } catch (e: any) {
                                                  setError(e.message);
                                                }
                                              }}
                                              className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-bold text-amber-800 hover:bg-amber-50"
                                            >
                                              Raise demand
                                            </button>
                                          )}
                                          {i.dueDate && (
                                            <Link href={`/sales/demand/${i.id}`} title="Demand letter" className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50">
                                              <FileText className="h-3.5 w-3.5" />
                                            </Link>
                                          )}
                                          {canReceive && i.dueDate && (
                                            <button onClick={() => setReceiving(i)} className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white">
                                              Receive
                                            </button>
                                          )}
                                        </div>
                                      )}
                                      {paid && <span className="text-xs font-bold text-emerald-600">Paid</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
      </div>

      {modal === "lead" && <LeadModal projects={projects} onClose={() => setModal(null)} onSaved={() => done("Enquiry added.")} />}
      {modal === "units" && <UnitsModal projects={projects} onClose={() => setModal(null)} onSaved={(n) => done(`${n} units added.`)} />}
      {modal === "book" && <BookModal units={(units || []).filter((u) => u.status === "AVAILABLE")} plans={plans} onClose={() => setModal(null)} onSaved={done} />}
      {bookUnit && <BookModal units={[]} unit={bookUnit} plans={plans} onClose={() => setBookUnit(null)} onSaved={done} />}
      {lead && <LeadDetail lead={lead} units={units || []} plans={plans} onClose={() => setLead(null)} onSaved={done} />}
      {receiving && (
        <ReceiveModal
          inst={receiving}
          onClose={() => setReceiving(null)}
          onSaved={(r) =>
            done(
              <>
                Receipt {r.receiptNumber} recorded.{" "}
                <Link href={`/sales/receipt/${r.receiptId}`} className="font-bold underline">
                  Print receipt
                </Link>
              </>
            )
          }
        />
      )}
    </Shell>
  );
}
