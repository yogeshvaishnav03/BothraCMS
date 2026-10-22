"use client";

import React, { useCallback, useEffect, useState } from "react";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Field, Modal, StatTile, inputCls } from "@/components/ui/Modal";
import { ContactActions } from "@/components/ui/ContactActions";
import { api, post, rupees, shortDate, toPaise } from "@/lib/client-api";
import { canUser } from "@/lib/permissions";
import { cn } from "@/lib/cn";
import { AlertTriangle, ChevronDown, Clock, Fuel, MapPin, Plus, Truck, Undo2, Wrench } from "lucide-react";

const CATEGORIES: Record<string, string> = {
  EARTHMOVING: "Earthmoving",
  LIFTING: "Lifting",
  CONCRETE: "Concrete",
  SHUTTERING: "Shuttering",
  POWER: "Power",
  VEHICLE: "Vehicle",
  TOOLS: "Tools",
  OTHER: "Other",
};
const STATUS: Record<string, { label: string; pill: string }> = {
  AVAILABLE: { label: "In yard", pill: "bg-slate-100 text-slate-600 ring-slate-200" },
  IN_USE: { label: "Working", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  UNDER_REPAIR: { label: "Under repair", pill: "bg-rose-50 text-rose-700 ring-rose-200" },
  RETURNED: { label: "Returned", pill: "bg-slate-50 text-slate-400 ring-slate-200" },
};
const LOGS = [
  { id: "USAGE", label: "Hours run", icon: Clock },
  { id: "FUEL", label: "Fuel", icon: Fuel },
  { id: "MAINTENANCE", label: "Service / repair", icon: Wrench },
  { id: "BREAKDOWN", label: "Breakdown", icon: AlertTriangle },
  { id: "MOVE", label: "Move", icon: MapPin },
] as const;
const unitLabel: Record<string, string> = { HOUR: "hour", DAY: "day", MONTH: "month" };

function AddModal({ projects, vendors, onClose, onSaved }: { projects: any[]; vendors: any[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ code: "", name: "", category: "EARTHMOVING", ownership: "OWNED", vendorPartyId: "", hireRate: "", hireRateUnit: "DAY", currentProjectId: "", nextServiceDue: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hired = f.ownership === "HIRED";
  return (
    <Modal
      title="Add a machine"
      icon={Truck}
      onClose={onClose}
      error={error}
      saving={saving}
      onSubmit={async () => {
        setSaving(true);
        setError(null);
        try {
          await api(
            "/api/equipment",
            post({
              code: f.code,
              name: f.name,
              category: f.category,
              ownership: f.ownership,
              vendorPartyId: hired ? f.vendorPartyId || null : null,
              hireRate: hired ? toPaise(f.hireRate) : null,
              hireRateUnit: hired ? f.hireRateUnit : null,
              currentProjectId: f.currentProjectId || null,
              nextServiceDue: f.nextServiceDue || null,
            })
          );
          onSaved();
        } catch (e: any) {
          setError(e.message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label="Code">
          <input required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="JCB-01" className={cn(inputCls, "uppercase")} />
        </Field>
        <Field label="Name" className="col-span-2">
          <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="JCB 3DX backhoe loader" className={inputCls} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className={inputCls}>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Owned or hired">
          <select value={f.ownership} onChange={(e) => setF({ ...f, ownership: e.target.value })} className={inputCls}>
            <option value="OWNED">Our own</option>
            <option value="HIRED">Hired</option>
          </select>
        </Field>
      </div>
      {hired && (
        <div className="grid grid-cols-3 gap-3 rounded-xl bg-amber-50/60 p-3">
          <Field label="Hired from" className="col-span-3">
            <select value={f.vendorPartyId} onChange={(e) => setF({ ...f, vendorPartyId: e.target.value })} className={inputCls}>
              <option value="">Choose vendor…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Hire rate (₹)" className="col-span-2">
            <input required type="number" min="1" value={f.hireRate} onChange={(e) => setF({ ...f, hireRate: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Per">
            <select value={f.hireRateUnit} onChange={(e) => setF({ ...f, hireRateUnit: e.target.value })} className={inputCls}>
              <option value="HOUR">Hour</option>
              <option value="DAY">Day</option>
              <option value="MONTH">Month</option>
            </select>
          </Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="At project">
          <select value={f.currentProjectId} onChange={(e) => setF({ ...f, currentProjectId: e.target.value })} className={inputCls}>
            <option value="">In the yard</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Next service due">
          <input type="date" value={f.nextServiceDue} onChange={(e) => setF({ ...f, nextServiceDue: e.target.value })} className={inputCls} />
        </Field>
      </div>
    </Modal>
  );
}

function LogModal({ eq, projects, canManage, onClose, onSaved }: { eq: any; projects: any[]; canManage: boolean; onClose: () => void; onSaved: (msg: string) => void }) {
  const [kind, setKind] = useState<string>("USAGE");
  const [f, setF] = useState({ hours: "", fuelLitres: "", cost: "", operator: "", note: "", projectId: eq.currentProjectId || "", nextServiceDue: "", logDate: new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kinds = LOGS.filter((l) => l.id !== "MOVE" || canManage);
  return (
    <Modal
      title={`${eq.name} (${eq.code})`}
      icon={Truck}
      onClose={onClose}
      error={error}
      saving={saving}
      submitLabel="Save"
      onSubmit={async () => {
        setSaving(true);
        setError(null);
        try {
          await api(
            `/api/equipment/${eq.id}/logs`,
            post({
              kind,
              logDate: f.logDate,
              projectId: f.projectId || null,
              hours: f.hours ? Number(f.hours) : null,
              fuelLitres: f.fuelLitres ? Number(f.fuelLitres) : null,
              cost: f.cost ? toPaise(f.cost) : null,
              operator: f.operator || null,
              note: f.note || null,
              nextServiceDue: kind === "MAINTENANCE" ? f.nextServiceDue || null : undefined,
            })
          );
          onSaved(kind === "BREAKDOWN" ? "Breakdown logged. The office has been alerted." : "Saved.");
        } catch (e: any) {
          setError(e.message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        {kinds.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setKind(k.id)}
            className={cn("flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-bold ring-1", kind === k.id ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200")}
          >
            <k.icon className="h-4 w-4" /> {k.label}
          </button>
        ))}
      </div>
      {kind !== "MOVE" && (
        <Field label="Date">
          <input type="date" value={f.logDate} onChange={(e) => setF({ ...f, logDate: e.target.value })} className={inputCls} />
        </Field>
      )}
      {kind === "USAGE" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hours run">
            <input required type="number" step="0.5" min="0.5" max="24" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Operator">
            <input value={f.operator} onChange={(e) => setF({ ...f, operator: e.target.value })} className={inputCls} />
          </Field>
          {eq.ownership === "HIRED" && eq.hireRate && (
            <p className="col-span-2 text-xs text-slate-500">
              Hire adds {rupees(eq.hireRate)} per {unitLabel[eq.hireRateUnit]}
              {eq.hireRateUnit === "HOUR" && f.hours ? ` = ${rupees(Math.round(eq.hireRate * Number(f.hours)))}` : ""}.
            </p>
          )}
        </div>
      )}
      {kind === "FUEL" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Litres">
            <input required type="number" step="0.5" min="0.5" value={f.fuelLitres} onChange={(e) => setF({ ...f, fuelLitres: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Cost (₹)">
            <input type="number" min="0" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} className={inputCls} />
          </Field>
        </div>
      )}
      {kind === "MAINTENANCE" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cost (₹)">
            <input type="number" min="0" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Next service due">
            <input type="date" value={f.nextServiceDue} onChange={(e) => setF({ ...f, nextServiceDue: e.target.value })} className={inputCls} />
          </Field>
        </div>
      )}
      {kind === "MOVE" && (
        <Field label="Send to">
          <select value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })} className={inputCls}>
            <option value="">Back to the yard</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label={kind === "BREAKDOWN" ? "What went wrong?" : "Note"}>
        <input required={kind === "BREAKDOWN"} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={inputCls} />
      </Field>
    </Modal>
  );
}

export default function EquipmentPage() {
  const [me, setMe] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [logging, setLogging] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => api("/api/equipment").then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) setOpen(id);
    load();
    api("/api/auth/me").then((d: any) => setMe(d.user)).catch(() => {});
    api<any>("/api/projects").then((d) => setProjects(Array.isArray(d) ? d : d?.projects || [])).catch(() => {});
    api<any[]>("/api/parties").then((d) => setVendors((d || []).filter((p: any) => p.partyType !== "CONTRACTOR"))).catch(() => {});
  }, [load]);

  const s = data?.summary;
  const list = (data?.equipment || []).filter((e: any) => !filter || (filter === "SERVICE" ? e.serviceDue : filter === "HIRED" ? e.ownership === "HIRED" && e.status !== "RETURNED" : e.status === filter));
  const canLog = canUser(me, "tasks:write");

  return (
    <Shell>
      <div className="space-y-5">
        <PageHeader icon={Truck} title="Equipment" subtitle="Where every machine is, hours run, fuel, repairs and hire charges.">
          {data?.canManage && (
            <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-brand px-4 py-2 text-sm font-bold text-slate-950 shadow-glow">
              <Plus className="h-4 w-4" /> Add machine
            </button>
          )}
        </PageHeader>

        {error && <Alert tone="error" onDismiss={() => setError(null)}>{error}</Alert>}
        {notice && <Alert tone="success" onDismiss={() => setNotice(null)}>{notice}</Alert>}

        {s && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile value={s.inUse} label="Working on site" tone="emerald" hint={`of ${s.total} machines`} />
            <StatTile value={s.underRepair} label="Under repair" tone={s.underRepair ? "rose" : "slate"} />
            <StatTile value={s.hired} label="Hired machines" tone="amber" />
            <StatTile value={s.serviceDue} label="Service due" tone={s.serviceDue ? "rose" : "slate"} />
            <StatTile value={rupees(s.monthCost)} label="Running cost this month" hint="Hire, fuel and repairs" />
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {[
            { id: "", label: "All" },
            { id: "IN_USE", label: "Working" },
            { id: "AVAILABLE", label: "In yard" },
            { id: "UNDER_REPAIR", label: "Under repair" },
            { id: "HIRED", label: "Hired" },
            { id: "SERVICE", label: "Service due" },
          ].map((t) => (
            <button key={t.id} onClick={() => setFilter(t.id)} className={cn("rounded-full px-3.5 py-1.5 text-xs font-bold", filter === t.id ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>
              {t.label}
            </button>
          ))}
        </div>

        {!data ? (
          <div className="skeleton h-64 rounded-2xl" />
        ) : list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No machines here.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {list.map((e: any) => {
              const st = STATUS[e.status] || STATUS.AVAILABLE;
              const isOpen = open === e.id;
              return (
                <div key={e.id} className={cn("rounded-2xl border bg-white shadow-xs", e.status === "UNDER_REPAIR" ? "border-rose-200" : "border-slate-200/80")}>
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", e.ownership === "HIRED" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-600")}>
                        <Truck className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-slate-900">{e.name}</h3>
                          <span className="font-mono text-xs text-slate-500">{e.code}</span>
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold ring-1", st.pill)}>{st.label}</span>
                          {e.serviceDue && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white">Service due</span>}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {CATEGORIES[e.category]} ·{" "}
                          {e.ownership === "HIRED" ? (
                            <>
                              hired{e.vendor && ` from ${e.vendor.name}`} at {rupees(e.hireRate)}/{unitLabel[e.hireRateUnit]}
                            </>
                          ) : (
                            "own machine"
                          )}
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-slate-700">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" /> {e.currentProjectName || "In the yard"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl bg-slate-50 p-2.5">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">This month</div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        { v: e.month.daysUsed, l: "days" },
                        { v: e.month.hours, l: "hours" },
                        { v: `${e.month.fuelLitres} L`, l: "fuel" },
                        { v: rupees(e.month.cost), l: "cost" },
                      ].map((x) => (
                        <div key={x.l}>
                          <div className="text-sm font-bold tabular-nums text-slate-900">{x.v}</div>
                          <div className="text-[11px] text-slate-500">{x.l}</div>
                        </div>
                      ))}
                    </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {canLog && e.status !== "RETURNED" && (
                        <button onClick={() => setLogging(e)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">
                          Log entry
                        </button>
                      )}
                      {data.canManage && e.ownership === "HIRED" && e.status !== "RETURNED" && (
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Return ${e.name} to the hire company?`)) return;
                            try {
                              await api(`/api/equipment/${e.id}/return`, post({}));
                              setNotice(`${e.name} marked returned.`);
                              load();
                            } catch (err: any) {
                              setError(err.message);
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                        >
                          <Undo2 className="h-3.5 w-3.5" /> Return
                        </button>
                      )}
                      {e.vendor?.phone && <ContactActions phone={e.vendor.phone} message={`About ${e.name} (${e.code})`} size="sm" />}
                      <button onClick={() => setOpen(isOpen ? null : e.id)} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
                        Log book <ChevronDown className={cn("h-4 w-4 transition", isOpen && "rotate-180")} />
                      </button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t border-slate-100 px-4 py-3">
                      {e.logs.length === 0 ? (
                        <p className="text-sm text-slate-500">Nothing logged yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {e.logs.map((l: any) => {
                            const k = LOGS.find((x) => x.id === l.kind) || LOGS[0];
                            return (
                              <li key={l.id} className="flex items-start gap-2.5 text-sm">
                                <k.icon className={cn("mt-0.5 h-4 w-4 shrink-0", l.kind === "BREAKDOWN" ? "text-rose-500" : "text-slate-400")} />
                                <div className="min-w-0 flex-1">
                                  <span className="font-medium text-slate-800">
                                    {l.kind === "USAGE" ? `${l.hours} hrs` : l.kind === "FUEL" ? `${l.fuelLitres} L diesel` : l.kind === "MOVE" ? `Moved to ${l.projectName || "yard"}` : k.label}
                                  </span>
                                  {l.operator && <span className="text-slate-500"> · {l.operator}</span>}
                                  {l.note && <span className="text-slate-500"> · {l.note}</span>}
                                  <div className="text-xs text-slate-400">
                                    {shortDate(l.logDate)}
                                    {l.projectName && l.kind !== "MOVE" && ` · ${l.projectName}`}
                                  </div>
                                </div>
                                {l.cost > 0 && <span className="text-sm font-semibold tabular-nums text-slate-700">{rupees(l.cost)}</span>}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {adding && <AddModal projects={projects} vendors={vendors} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setNotice("Machine added."); load(); }} />}
      {logging && <LogModal eq={logging} projects={projects} canManage={!!data?.canManage} onClose={() => setLogging(null)} onSaved={(m) => { setLogging(null); setNotice(m); load(); }} />}
    </Shell>
  );
}
