"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Field, Modal, StatTile, Tabs, inputCls } from "@/components/ui/Modal";
import { canUser } from "@/lib/permissions";
import { api, post, patch, put, rupees, shortDate, toPaise } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { BadgeCheck, Banknote, Calculator, CheckCircle2, FileText, HandCoins, Loader2, Pencil, Wallet } from "lucide-react";

type Tab = "RUN" | "SALARIES" | "ADVANCES";

const thisMonth = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 7);
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

const STEPS = [
  { id: "DRAFT", label: "Worked out", hint: "Check days, add bonus or deductions" },
  { id: "APPROVED", label: "Approved", hint: "An admin has signed off" },
  { id: "PAID", label: "Paid", hint: "Payments recorded in Finance" },
];

function days(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function EditLineModal({ line, onClose, onSaved }: { line: any; onClose: () => void; onSaved: (run: any) => void }) {
  const [bonus, setBonus] = useState(line.bonus ? String(line.bonus / 100) : "");
  const [deduction, setDeduction] = useState(line.otherDeduction ? String(line.otherDeduction / 100) : "");
  const [tds, setTds] = useState(line.tds ? String(line.tds / 100) : "");
  const [tdsAuto, setTdsAuto] = useState(!line.tdsManual);
  const [note, setNote] = useState(line.note || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title={`Adjust pay: ${line.personName}`}
      icon={Pencil}
      onClose={onClose}
      error={error}
      saving={saving}
      onSubmit={async () => {
        setSaving(true);
        setError(null);
        try {
          const d = await api(`/api/payroll/lines/${line.id}`, patch({ bonus: toPaise(bonus), otherDeduction: toPaise(deduction), tds: line.personType === "STAFF" && tdsAuto ? null : toPaise(tds), note: note || null }));
          onSaved(d.run);
        } catch (e: any) {
          setError(e.message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
        {days(line.payableDays)} payable days · base {rupees(line.basePay)}
        {line.overtimePay > 0 && ` · overtime ${rupees(line.overtimePay)}`}
        {line.advanceDeduction > 0 && ` · advance recovered ${rupees(line.advanceDeduction)}`}
        {line.pfEmployee > 0 && ` · PF ${rupees(line.pfEmployee)}`}
        {line.esiEmployee > 0 && ` · ESI ${rupees(line.esiEmployee)}`}
        {line.professionalTax > 0 && ` · PT ${rupees(line.professionalTax)}`}
      </div>
      <div className={`grid gap-3 ${line.personType === "STAFF" ? "grid-cols-3" : "grid-cols-2"}`}>
        <Field label="Bonus / incentive (₹)">
          <input type="number" min="0" step="1" value={bonus} onChange={(e) => setBonus(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Other deduction (₹)">
          <input type="number" min="0" step="1" value={deduction} onChange={(e) => setDeduction(e.target.value)} className={inputCls} />
        </Field>
        {line.personType === "STAFF" && (
          <Field label="TDS (₹)">
            <input type="number" min="0" step="1" value={tds} disabled={tdsAuto} onChange={(e) => setTds(e.target.value)} className={cn(inputCls, tdsAuto && "bg-slate-50 text-slate-500")} />
          </Field>
        )}
      </div>
      {line.personType === "STAFF" && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={tdsAuto} onChange={(e) => setTdsAuto(e.target.checked)} className="rounded border-slate-300" />
            Work out TDS from their tax regime and pay so far this year
          </label>
          <a href={`/payroll/tax/${line.personId}`} className="font-semibold text-amber-700 hover:underline">
            Tax for the year →
          </a>
        </div>
      )}
      <Field label="Note on the payslip">
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Festival bonus, canteen deduction" className={inputCls} />
      </Field>
    </Modal>
  );
}

function PayModal({ run, onClose, onPaid }: { run: any; onClose: () => void; onPaid: (run: any) => void }) {
  const [method, setMethod] = useState("NEFT_RTGS");
  const [account, setAccount] = useState("");
  const [date, setDate] = useState(new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paying = run.lines.filter((l: any) => l.net > 0).length;
  return (
    <Modal
      title={`Pay ${monthLabel(run.month)}`}
      icon={Banknote}
      onClose={onClose}
      error={error}
      saving={saving}
      submitLabel={`Record ${paying} payments`}
      onSubmit={async () => {
        setSaving(true);
        setError(null);
        try {
          const d = await api(`/api/payroll/${run.month}/pay`, post({ method, payingAccount: account || null, paymentDate: date }));
          onPaid(d.run);
        } catch (e: any) {
          setError(e.message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <p className="text-sm text-slate-600">
        This records one payment of <b>{rupees(run.totalNet)}</b> in total, split across {paying} people. Labour wages go to each worker&apos;s project under the Labour budget head.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Paid by">
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
            <option value="NEFT_RTGS">Bank transfer (NEFT/RTGS)</option>
            <option value="UPI">UPI</option>
            <option value="CASH">Cash</option>
            <option value="CHEQUE">Cheque</option>
          </select>
        </Field>
        <Field label="Payment date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <Field label="Paid from account (optional)">
        <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="e.g. HDFC current account" className={inputCls} />
      </Field>
    </Modal>
  );
}

function AdvanceModal({ people, onClose, onSaved }: { people: any[]; onClose: () => void; onSaved: () => void }) {
  const [person, setPerson] = useState("");
  const [amount, setAmount] = useState("");
  const [givenOn, setGivenOn] = useState(new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title="Give an advance"
      icon={HandCoins}
      onClose={onClose}
      error={error}
      saving={saving}
      onSubmit={async () => {
        const [personType, personId] = person.split(":");
        if (!personId) return setError("Pick who took the advance.");
        setSaving(true);
        setError(null);
        try {
          await api("/api/payroll/advances", post({ personType, personId, amount: toPaise(amount), givenOn, note: note || null }));
          onSaved();
        } catch (e: any) {
          setError(e.message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <Field label="Person">
        <select required value={person} onChange={(e) => setPerson(e.target.value)} className={inputCls}>
          <option value="">Choose…</option>
          <optgroup label="Site workers">
            {people.filter((p) => p.personType === "LABOUR").map((p) => (
              <option key={p.personId} value={`LABOUR:${p.personId}`}>
                {p.name} ({p.label.toLowerCase()})
              </option>
            ))}
          </optgroup>
          <optgroup label="Staff">
            {people.filter((p) => p.personType === "STAFF").map((p) => (
              <option key={p.personId} value={`STAFF:${p.personId}`}>
                {p.name} ({p.label})
              </option>
            ))}
          </optgroup>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)">
          <input required type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Given on">
          <input type="date" value={givenOn} onChange={(e) => setGivenOn(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <Field label="Note">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Medical emergency" className={inputCls} />
      </Field>
      <p className="text-xs text-slate-500">It is taken back from the next payroll, as long as the pay covers it.</p>
    </Modal>
  );
}

function SalaryRow({ s, canEdit, onSaved }: { s: any; canEdit: boolean; onSaved: (staff: any[]) => void }) {
  const [salary, setSalary] = useState(s.monthlySalary ? String(s.monthlySalary / 100) : "");
  const [pf, setPf] = useState<boolean>(s.pfApplicable);
  const [esi, setEsi] = useState<boolean>(s.esiApplicable);
  const [uan, setUan] = useState(s.uan || "");
  const [esic, setEsic] = useState(s.esicNumber || "");
  const [regime, setRegime] = useState<string>(s.taxRegime || "NEW");
  const [declared, setDeclared] = useState(s.taxDeclared ? String(s.taxDeclared / 100) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty =
    toPaise(salary) !== s.monthlySalary ||
    pf !== s.pfApplicable ||
    esi !== s.esiApplicable ||
    uan !== (s.uan || "") ||
    esic !== (s.esicNumber || "") ||
    regime !== (s.taxRegime || "NEW") ||
    toPaise(declared) !== (s.taxDeclared || 0);
  const esiOver = esi && toPaise(salary) > 21_000_00;
  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-2.5">
        <div className="font-semibold text-slate-900">{s.name}</div>
        <div className="text-xs text-slate-500">{s.jobTitle || s.role.replace(/_/g, " ").toLowerCase()}</div>
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-500">{s.bankAccountMasked ? `${s.bankAccountMasked} · ${s.ifsc || ""}` : "—"}</td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-700">
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" disabled={!canEdit} checked={pf} onChange={(e) => setPf(e.target.checked)} className="rounded border-slate-300" /> PF
          </label>
          <label className="inline-flex items-center gap-1.5" title="ESI applies while the monthly salary is ₹21,000 or less">
            <input type="checkbox" disabled={!canEdit} checked={esi} onChange={(e) => setEsi(e.target.checked)} className="rounded border-slate-300" /> ESI
          </label>
          {pf && (
            <input
              disabled={!canEdit}
              value={uan}
              onChange={(e) => setUan(e.target.value.replace(/\D/g, "").slice(0, 12))}
              placeholder="UAN (12 digits)"
              className="w-32 rounded-lg border border-slate-200 px-2 py-1 text-xs tabular-nums disabled:bg-slate-50"
            />
          )}
          {esi && (
            <input
              disabled={!canEdit}
              value={esic}
              onChange={(e) => setEsic(e.target.value.replace(/\D/g, "").slice(0, 17))}
              placeholder="ESIC number"
              className="w-32 rounded-lg border border-slate-200 px-2 py-1 text-xs tabular-nums disabled:bg-slate-50"
            />
          )}
        </div>
        {esiOver && <div className="mt-1 text-[11px] text-amber-700">Above ₹21,000, so no ESI is deducted.</div>}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-700">
          <select disabled={!canEdit} value={regime} onChange={(e) => setRegime(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs disabled:bg-slate-50" title="Income-tax regime the person has chosen, for TDS">
            <option value="NEW">New tax regime</option>
            <option value="OLD">Old tax regime</option>
          </select>
          {regime === "OLD" && (
            <input
              disabled={!canEdit}
              type="number"
              min="0"
              value={declared}
              onChange={(e) => setDeclared(e.target.value)}
              placeholder="Declared deductions ₹/yr"
              title="80C beyond PF, 80D, HRA and the like, after their limits"
              className="w-40 rounded-lg border border-slate-200 px-2 py-1 text-xs tabular-nums disabled:bg-slate-50"
            />
          )}
          {s.monthlySalary > 0 && (
            <a href={`/payroll/tax/${s.id}`} className="font-semibold text-amber-700 hover:underline">
              Tax for the year
            </a>
          )}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center justify-end gap-2">
          <span className="text-slate-400">₹</span>
          <input
            disabled={!canEdit}
            type="number"
            min="0"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            placeholder="Not set"
            className="w-32 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm tabular-nums disabled:bg-slate-50"
          />
          {canEdit && (
            <button
              disabled={!dirty || saving}
              onClick={async () => {
                setSaving(true);
                setError(null);
                try {
                  onSaved((await api(`/api/payroll/salaries/${s.id}`, put({ monthlySalary: toPaise(salary), pfApplicable: pf, esiApplicable: esi, uan: uan || null, esicNumber: esic || null, taxRegime: regime, taxDeclared: regime === "OLD" ? toPaise(declared) : 0 }))).staff);
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setSaving(false);
                }
              }}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-30"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
            </button>
          )}
        </div>
        {error && <div className="mt-1 text-right text-xs text-rose-600">{error}</div>}
      </td>
    </tr>
  );
}

function WorkerRow({ w, canEdit, onSaved }: { w: any; canEdit: boolean; onSaved: (workers: any[]) => void }) {
  const [pf, setPf] = useState<boolean>(w.pfApplicable);
  const [esi, setEsi] = useState<boolean>(w.esiApplicable);
  const [uan, setUan] = useState(w.uan || "");
  const [esic, setEsic] = useState(w.esicNumber || "");
  const [account, setAccount] = useState("");
  const [ifsc, setIfsc] = useState(w.ifsc || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = pf !== w.pfApplicable || esi !== w.esiApplicable || uan !== (w.uan || "") || esic !== (w.esicNumber || "") || account !== "" || ifsc !== (w.ifsc || "");
  const field = "rounded-lg border border-slate-200 px-2 py-1 text-xs tabular-nums disabled:bg-slate-50";
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-4 py-2.5">
        <div className="font-semibold text-slate-900">{w.name}</div>
        <div className="text-xs text-slate-500">
          {w.workerType.replace(/_/g, " ").toLowerCase()} · {w.dailyWageRate ? `₹${(w.dailyWageRate / 100).toLocaleString("en-IN")}/day` : "no wage set"}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap gap-1.5">
          <input
            disabled={!canEdit}
            value={account}
            onChange={(e) => setAccount(e.target.value.replace(/\D/g, "").slice(0, 20))}
            placeholder={w.bankAccountMasked || "Account no."}
            className={cn(field, "w-32")}
          />
          <input disabled={!canEdit} value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase().slice(0, 11))} placeholder="IFSC" className={cn(field, "w-28")} />
        </div>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-700">
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" disabled={!canEdit} checked={pf} onChange={(e) => setPf(e.target.checked)} className="rounded border-slate-300" /> PF
          </label>
          <label className="inline-flex items-center gap-1.5" title="ESI applies while 26 days' wages are ₹21,000 or less">
            <input type="checkbox" disabled={!canEdit} checked={esi} onChange={(e) => setEsi(e.target.checked)} className="rounded border-slate-300" /> ESI
          </label>
          {pf && <input disabled={!canEdit} value={uan} onChange={(e) => setUan(e.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="UAN (12 digits)" className={cn(field, "w-32")} />}
          {esi && <input disabled={!canEdit} value={esic} onChange={(e) => setEsic(e.target.value.replace(/\D/g, "").slice(0, 17))} placeholder="ESIC number" className={cn(field, "w-32")} />}
        </div>
        {error && <div className="mt-1 text-xs text-rose-600">{error}</div>}
      </td>
      <td className="px-4 py-2.5 text-right">
        {canEdit && (
          <button
            disabled={!dirty || saving}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                const body: any = { pfApplicable: pf, esiApplicable: esi, uan: uan || null, esicNumber: esic || null, ifsc: ifsc || null };
                if (account) body.bankAccount = account;
                onSaved((await api(`/api/payroll/workers/${w.id}`, put(body))).workers);
                setAccount("");
              } catch (e: any) {
                setError(e.message);
              } finally {
                setSaving(false);
              }
            }}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-30"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </button>
        )}
      </td>
    </tr>
  );
}

export default function PayrollPage() {
  const [me, setMe] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("RUN");
  const [month, setMonth] = useState(thisMonth());
  const [run, setRun] = useState<any>(undefined);
  const [runs, setRuns] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [advances, setAdvances] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [paying, setPaying] = useState(false);
  const [giving, setGiving] = useState(false);
  const [gaps, setGaps] = useState<{ pf: string[]; esi: string[] } | null>(null);
  const [settings, setSettings] = useState<{ ptState: string; states: { key: string; name: string }[] } | null>(null);

  const canWrite = canUser(me, "payroll:write");
  const isAdmin = me?.role === "SUPER_ADMIN" || me?.role === "ORG_ADMIN";

  const loadRun = useCallback(async () => {
    try {
      const d = await api(`/api/payroll?month=${month}`);
      setRun(d.run);
      setRuns(d.runs);
      setGaps(d.gaps || null);
    } catch (e: any) {
      setError(e.message);
      setRun(null);
    }
  }, [month]);

  const loadSide = useCallback(async () => {
    try {
      const [s, a, st] = await Promise.all([api("/api/payroll/salaries"), api("/api/payroll/advances"), api("/api/payroll/settings")]);
      setSettings(st);
      setStaff(s.staff);
      setWorkers(s.workers || []);
      setPeople(s.people);
      setAdvances(a);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    api("/api/auth/me").then((d: any) => setMe(d.user)).catch(() => {});
    loadSide();
  }, [loadSide]);
  useEffect(() => {
    setRun(undefined);
    loadRun();
  }, [loadRun]);

  const act = async (fn: () => Promise<any>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      const d = await fn();
      if (d?.run !== undefined) setRun(d.run);
      setNotice(message);
      loadSide();
      api(`/api/payroll`).then((x) => setRuns(x.runs)).catch(() => {});
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const stepIndex = run ? STEPS.findIndex((s) => s.id === run.status) : -1;
  const labour = run?.lines.filter((l: any) => l.personType === "LABOUR") || [];
  const staffLines = run?.lines.filter((l: any) => l.personType === "STAFF") || [];
  const openAdvances = advances.filter((a) => !a.recoveredRunId);

  return (
    <Shell>
      <div className="space-y-5">
        <PageHeader icon={Wallet} title="Payroll" subtitle="Wages and salaries worked out from attendance, with advances taken back automatically.">
          {tab === "RUN" && (
            <input type="month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" />
          )}
          {tab === "ADVANCES" && canWrite && (
            <button onClick={() => setGiving(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-brand px-4 py-2 text-sm font-bold text-slate-950 shadow-glow">
              <HandCoins className="h-4 w-4" /> Give advance
            </button>
          )}
        </PageHeader>

        {error && <Alert tone="error" onDismiss={() => setError(null)}>{error}</Alert>}
        {notice && <Alert tone="success" onDismiss={() => setNotice(null)}>{notice}</Alert>}

        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "RUN", label: "Monthly payroll" },
            { id: "SALARIES", label: "Staff salaries", count: staff.filter((s) => s.monthlySalary > 0).length },
            { id: "ADVANCES", label: "Advances", count: openAdvances.length },
          ]}
        />

        {tab === "RUN" && (
          <>
            {run === undefined ? (
              <div className="skeleton h-64 rounded-2xl" />
            ) : !run ? (
              <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-8 text-center">
                <Calculator className="mx-auto h-10 w-10 text-amber-500" />
                <h3 className="mt-3 font-display text-lg font-bold text-slate-900">No payroll for {monthLabel(month)} yet</h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
                  Workers are paid their daily wage for each day marked present on site, half for a half day, plus overtime after 8 hours. Staff get their monthly salary,
                  less unpaid absences.
                </p>
                {canWrite && (
                  <button
                    disabled={busy}
                    onClick={() => act(() => api("/api/payroll", post({ month })), `Payroll for ${monthLabel(month)} worked out.`)}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-5 py-2.5 text-sm font-bold text-slate-950 shadow-glow disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />} Work out payroll
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <ol className="flex flex-1 flex-wrap items-center gap-2">
                      {STEPS.map((s, i) => (
                        <li key={s.id} className="flex items-center gap-2">
                          <span
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                              i <= stepIndex ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"
                            )}
                          >
                            {i <= stepIndex ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                          </span>
                          <span className="text-sm">
                            <span className={cn("font-bold", i <= stepIndex ? "text-slate-900" : "text-slate-400")}>{s.label}</span>
                            <span className="hidden text-xs text-slate-400 lg:inline"> · {s.hint}</span>
                          </span>
                          {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-slate-200" />}
                        </li>
                      ))}
                    </ol>
                    <div className="flex flex-wrap gap-2">
                      {run.status === "DRAFT" && canWrite && (
                        <button
                          disabled={busy}
                          onClick={() => act(() => api("/api/payroll", post({ month })), "Payroll refreshed from the latest attendance.")}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Refresh from attendance
                        </button>
                      )}
                      {run.status === "DRAFT" && isAdmin && (
                        <button
                          disabled={busy}
                          onClick={() => act(() => api(`/api/payroll/${month}/approve`, post({})), "Payroll approved. It can be paid now. PF, ESI, PT and TDS are added to Finance as bills owed, with their due dates.")}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          <BadgeCheck className="h-4 w-4" /> Approve
                        </button>
                      )}
                      {run.status !== "DRAFT" && canWrite && (
                        <a href={`/api/payroll/${month}/bank-file`} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                          <FileText className="h-4 w-4" /> Bank transfer file
                        </a>
                      )}
                      {run.status !== "DRAFT" && canWrite && run.statutory?.pfEmployee > 0 && (
                        <a href={`/api/payroll/${month}/statutory-file?kind=pf-ecr`} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                          <FileText className="h-4 w-4" /> PF ECR file
                        </a>
                      )}
                      {run.status !== "DRAFT" && canWrite && run.statutory?.esiEmployee > 0 && (
                        <a href={`/api/payroll/${month}/statutory-file?kind=esi`} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                          <FileText className="h-4 w-4" /> ESI file
                        </a>
                      )}
                      {run.status === "APPROVED" && canWrite && canUser(me, "finance:write") && (
                        <button onClick={() => setPaying(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-brand px-3 py-2 text-xs font-bold text-slate-950">
                          <Banknote className="h-4 w-4" /> Mark as paid
                        </button>
                      )}
                    </div>
                  </div>
                  {run.approvedByName && (
                    <p className="mt-2 text-xs text-slate-500">
                      Approved by {run.approvedByName} on {shortDate(run.approvedAt)}
                      {run.paidAt && ` · paid ${shortDate(run.paidAt)}`}
                    </p>
                  )}
                  {gaps && (gaps.pf.length > 0 || gaps.esi.length > 0) && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {gaps.pf.length > 0 && <>No UAN for {gaps.pf.join(", ")}, so they are left out of the PF file. </>}
                      {gaps.esi.length > 0 && <>No ESIC number for {gaps.esi.join(", ")}, so they are left out of the ESI file. </>}
                      Add them under Salaries or Workforce.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <StatTile value={run.lines.length} label="People paid" hint={`${labour.length} workers · ${staffLines.length} staff`} />
                  <StatTile value={rupees(run.totalGross)} label="Gross pay" />
                  <StatTile
                    value={rupees(run.totalDeductions)}
                    label="Deductions"
                    tone="rose"
                    hint={
                      run.statutory && run.statutory.pfEmployee + run.statutory.esiEmployee + run.statutory.professionalTax + run.statutory.tds > 0
                        ? `PF ${rupees(run.statutory.pfEmployee)} · ESI ${rupees(run.statutory.esiEmployee)} · PT ${rupees(run.statutory.professionalTax)}${run.statutory.tds ? ` · TDS ${rupees(run.statutory.tds)}` : ""}`
                        : "Advances and other"
                    }
                  />
                  <StatTile value={rupees(run.totalNet)} label="Net to pay" tone="emerald" />
                </div>
                {run.statutory && run.statutory.pfEmployer + run.statutory.esiEmployer > 0 && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm shadow-xs">
                    <span className="font-semibold text-slate-900">To deposit this month</span>
                    <span className="text-slate-600">
                      PF {rupees(run.statutory.pfEmployee + run.statutory.pfEmployer)} <span className="text-xs text-slate-400">(staff {rupees(run.statutory.pfEmployee)} + company {rupees(run.statutory.pfEmployer)}) by the 15th</span>
                    </span>
                    {run.statutory.esiEmployee + run.statutory.esiEmployer > 0 && (
                      <span className="text-slate-600">
                        ESI {rupees(run.statutory.esiEmployee + run.statutory.esiEmployer)} <span className="text-xs text-slate-400">by the 15th</span>
                      </span>
                    )}
                    {run.statutory.professionalTax > 0 && <span className="text-slate-600">Professional tax {rupees(run.statutory.professionalTax)}</span>}
                    {run.statutory.tds > 0 && <span className="text-slate-600">TDS {rupees(run.statutory.tds)} by the 7th</span>}
                  </div>
                )}

                {[
                  { title: "Site workers", rows: labour, labour: true },
                  { title: "Staff", rows: staffLines, labour: false },
                ]
                  .filter((g) => g.rows.length > 0)
                  .map((g) => (
                    <div key={g.title} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
                      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                        <h3 className="font-display font-bold text-slate-900">{g.title}</h3>
                        <span className="text-xs text-slate-500">{rupees(g.rows.reduce((s: number, l: any) => s + l.net, 0))} net</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[860px] text-sm">
                          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            <tr>
                              <th className="px-4 py-2 text-left">Name</th>
                              <th className="px-3 py-2 text-right">{g.labour ? "Days" : "Paid days"}</th>
                              {g.labour ? <th className="px-3 py-2 text-right">OT hrs</th> : <th className="px-3 py-2 text-right">Leave</th>}
                              <th className="px-3 py-2 text-right">{g.labour ? "Wage/day" : "Salary"}</th>
                              <th className="px-3 py-2 text-right">Earned</th>
                              <th className="px-3 py-2 text-right">Bonus</th>
                              <th className="px-3 py-2 text-right">Deductions</th>
                              <th className="px-3 py-2 text-right">Net pay</th>
                              <th className="px-3 py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {g.rows.map((l: any) => (
                              <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                                <td className="px-4 py-2.5">
                                  <div className="font-semibold text-slate-900">{l.personName}</div>
                                  <div className="text-xs text-slate-500">
                                    {(l.roleLabel || "").toLowerCase()}
                                    {l.projectName && ` · ${l.projectName}`}
                                  </div>
                                  {l.note && <div className="text-xs italic text-slate-500">{l.note}</div>}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">
                                  {days(l.payableDays)}
                                  {l.halfDays > 0 && <div className="text-[11px] text-slate-400">{l.halfDays} half</div>}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{g.labour ? l.overtimeHours || "—" : l.leaveDays || "—"}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{rupees(l.rate)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{rupees(l.basePay + l.overtimePay)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{l.bonus ? rupees(l.bonus) : "—"}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums text-rose-600">
                                  {(() => {
                                    const statutory = l.pfEmployee + l.esiEmployee + l.professionalTax + l.tds;
                                    const all = l.advanceDeduction + l.otherDeduction + statutory;
                                    return (
                                      <>
                                        {all ? rupees(all) : "—"}
                                        {l.advanceDeduction > 0 && <div className="text-[11px] text-slate-400">advance {rupees(l.advanceDeduction)}</div>}
                                        {statutory > 0 && (
                                          <div className="text-[11px] text-slate-400">
                                            {[l.pfEmployee && `PF ${rupees(l.pfEmployee)}`, l.esiEmployee && `ESI ${rupees(l.esiEmployee)}`, l.professionalTax && `PT ${rupees(l.professionalTax)}`, l.tds && `TDS ${rupees(l.tds)}`]
                                              .filter(Boolean)
                                              .join(" · ")}
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}
                                </td>
                                <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-900">{rupees(l.net)}</td>
                                <td className="px-3 py-2.5">
                                  <div className="flex justify-end gap-1">
                                    {run.status === "DRAFT" && canWrite && (
                                      <button onClick={() => setEditing(l)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Bonus or deduction">
                                        <Pencil className="h-4 w-4" />
                                      </button>
                                    )}
                                    <Link href={`/payroll/payslip/${l.id}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Payslip">
                                      <FileText className="h-4 w-4" />
                                    </Link>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                {run.lines.length === 0 && (
                  <Alert tone="info">Nobody had attendance or a salary set for {monthLabel(month)}. Set staff salaries in the Staff salaries tab.</Alert>
                )}
              </>
            )}

            {runs.length > 0 && (
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Earlier months</h3>
                <div className="flex flex-wrap gap-2">
                  {runs.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setMonth(r.month)}
                      className={cn("rounded-xl px-3 py-2 text-left text-xs ring-1", r.month === month ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50")}
                    >
                      <div className="font-bold">{monthLabel(r.month)}</div>
                      <div className={r.month === month ? "text-slate-300" : "text-slate-500"}>
                        {rupees(r.totalNet)} · {r.status.toLowerCase()}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === "SALARIES" && (
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-sm text-slate-600">
              <span>Monthly salary for staff with a login. Site workers are paid by their daily wage, set on the Workforce page, and their PF and ESI are below.</span>
              {settings && (
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  Professional tax
                  <select
                    disabled={!canWrite}
                    value={settings.ptState}
                    onChange={async (e) => {
                      try {
                        const d = await api("/api/payroll/settings", put({ ptState: e.target.value }));
                        setSettings({ ...settings, ptState: d.ptState });
                        setNotice("Professional tax state saved. Refresh a draft payroll to apply it.");
                      } catch (err: any) {
                        setError(err.message);
                      }
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                  >
                    {settings.states.map((st) => (
                      <option key={st.key} value={st.key}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Staff member</th>
                    <th className="px-4 py-2 text-left">Bank</th>
                    <th className="px-4 py-2 text-left">PF / ESI</th>
                    <th className="px-4 py-2 text-right">Monthly salary</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <SalaryRow key={s.id} s={s} canEdit={canWrite} onSaved={(list) => { setStaff(list); setNotice(`Salary saved for ${s.name}.`); }} />
                  ))}
                </tbody>
              </table>
            </div>
            {workers.length > 0 && (
              <>
                <div className="border-y border-slate-100 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
                  <span className="font-bold text-slate-900">Site workers.</span> Tick PF or ESI for workers who are covered. PF is 12% of wages up to ₹15,000 a month; ESI is 0.75%
                  from the worker and 3.25% from you while 26 days&apos; wages are ₹21,000 or less. Professional tax is not cut from daily wages.
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-2 text-left">Worker</th>
                        <th className="px-4 py-2 text-left">Bank</th>
                        <th className="px-4 py-2 text-left">PF / ESI</th>
                        <th className="px-4 py-2 text-right" />
                      </tr>
                    </thead>
                    <tbody>
                      {workers.map((w) => (
                        <WorkerRow key={w.id} w={w} canEdit={canWrite} onSaved={(list) => { setWorkers(list); setNotice(`Saved for ${w.name}. Refresh a draft payroll to apply it.`); }} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "ADVANCES" && (
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Person</th>
                    <th className="px-4 py-2 text-left">Given</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-left">Taken back</th>
                  </tr>
                </thead>
                <tbody>
                  {advances.map((a) => (
                    <tr key={a.id} className="border-t border-slate-100">
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-slate-900">{a.personName}</div>
                        <div className="text-xs text-slate-500">{a.personType === "LABOUR" ? "Site worker" : "Staff"}{a.note && ` · ${a.note}`}</div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{shortDate(a.givenOn)}</td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums">{rupees(a.amount)}</td>
                      <td className="px-4 py-2.5">
                        {a.recoveredIn ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">{monthLabel(a.recoveredIn)} payroll</span>
                        ) : (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">Open</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {advances.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-500">No advances given yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {editing && <EditLineModal line={editing} onClose={() => setEditing(null)} onSaved={(r) => { setRun(r); setEditing(null); }} />}
      {paying && run && <PayModal run={run} onClose={() => setPaying(false)} onPaid={(r) => { setRun(r); setPaying(false); setNotice("Payments recorded. They now show in Finance and the Day Book."); }} />}
      {giving && <AdvanceModal people={people} onClose={() => setGiving(false)} onSaved={() => { setGiving(false); setNotice("Advance recorded."); loadSide(); }} />}
    </Shell>
  );
}
