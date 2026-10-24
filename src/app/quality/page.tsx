"use client";

import React, { useCallback, useEffect, useState } from "react";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Field, Modal, StatTile, Tabs, inputCls } from "@/components/ui/Modal";
import { PhotoPicker, PickedPhoto, splitPhotos } from "@/components/ui/PhotoPicker";
import { submitOrQueue } from "@/lib/offline-queue";
import { ContactActions } from "@/components/ui/ContactActions";
import { api, post, shortDate } from "@/lib/client-api";
import { canUser } from "@/lib/permissions";
import { cn } from "@/lib/cn";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ClipboardCheck, ClipboardList, Copy, HardHat, MinusCircle, Pencil, Plus, RotateCcw, ShieldAlert, ShieldCheck, Trash2, X, XCircle } from "lucide-react";

type Tab = "issues" | "inspections" | "checklists";

const KIND: Record<string, { label: string; pill: string; safety: boolean }> = {
  NCR: { label: "Quality defect", pill: "bg-blue-50 text-blue-700 ring-blue-200", safety: false },
  OBSERVATION: { label: "Observation", pill: "bg-slate-100 text-slate-600 ring-slate-200", safety: false },
  SAFETY_INCIDENT: { label: "Safety incident", pill: "bg-rose-600 text-white ring-rose-600", safety: true },
  NEAR_MISS: { label: "Near miss", pill: "bg-orange-50 text-orange-700 ring-orange-200", safety: true },
  UNSAFE_ACT: { label: "Unsafe act", pill: "bg-amber-50 text-amber-800 ring-amber-200", safety: true },
};
const SEVERITY: Record<string, string> = { LOW: "text-slate-500", MEDIUM: "text-amber-600", HIGH: "text-orange-600", CRITICAL: "text-rose-600" };

function InspectionModal({ projects, checklists, onClose, onSaved }: { projects: any[]; checklists: any[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [template, setTemplate] = useState(checklists[0]?.key || "");
  const [location, setLocation] = useState("");
  const [results, setResults] = useState<Record<number, { result: string; note: string }>>({});
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = checklists.find((c) => c.key === template);
  const set = (i: number, patch: Partial<{ result: string; note: string }>) => setResults({ ...results, [i]: { ...{ result: "PASS", note: "" }, ...results[i], ...patch } });

  return (
    <Modal
      wide
      title="Run a checklist"
      icon={ClipboardCheck}
      onClose={onClose}
      error={error}
      saving={saving}
      submitLabel="Save inspection"
      onSubmit={async () => {
        const missing = list.items.findIndex((_: string, i: number) => !results[i]);
        if (missing >= 0) return setError(`Mark "${list.items[missing]}" as OK, not OK or not needed.`);
        setSaving(true);
        setError(null);
        try {
          const { urls, pending } = splitPhotos(photos, { entityType: "QUALITY", projectId });
          const r = await submitOrQueue<any>({
            label: `${list.name || "Checklist"}${location ? `, ${location}` : ""}`,
            url: "/api/quality/inspections",
            body: {
              projectId,
              template,
              location: location || null,
              items: list.items.map((label: string, i: number) => ({ label, result: results[i].result, note: results[i].note || null })),
              photoUrls: urls,
            },
            photos: pending,
            photoField: "photoUrls",
          });
          if (r.queued) return onSaved("No signal, so the inspection is saved on this phone. It will be sent when you are back online.");
          const d = r.data;
          onSaved(d.issuesOpened ? `Inspection saved. ${d.issuesOpened} point${d.issuesOpened > 1 ? "s" : ""} failed and ${d.issuesOpened > 1 ? "were" : "was"} sent to the project manager to fix.` : "Inspection passed and saved.");
        } catch (e: any) {
          setError(e.message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Project">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputCls}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Checklist">
          <select
            value={template}
            onChange={(e) => {
              setTemplate(e.target.value);
              setResults({});
            }}
            className={inputCls}
          >
            {checklists.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Where">
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="3rd floor slab, grid A–C" className={inputCls} />
        </Field>
      </div>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {list?.items.map((item: string, i: number) => {
          const r = results[i];
          return (
            <div key={item} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-sm text-slate-800">{item}</span>
                {[
                  { v: "PASS", label: "OK", icon: CheckCircle2, on: "bg-emerald-600 text-white" },
                  { v: "FAIL", label: "Not OK", icon: XCircle, on: "bg-rose-600 text-white" },
                  { v: "NA", label: "N/A", icon: MinusCircle, on: "bg-slate-600 text-white" },
                ].map((b) => (
                  <button
                    key={b.v}
                    type="button"
                    onClick={() => set(i, { result: b.v })}
                    className={cn("inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold ring-1 ring-slate-200", r?.result === b.v ? b.on : "bg-white text-slate-600 hover:bg-slate-50")}
                  >
                    <b.icon className="h-3.5 w-3.5" /> {b.label}
                  </button>
                ))}
              </div>
              {r?.result === "FAIL" && (
                <input value={r.note} onChange={(e) => set(i, { note: e.target.value })} placeholder="What is wrong?" className="mt-2 w-full rounded-lg border border-rose-200 bg-rose-50/40 px-3 py-1.5 text-sm" />
              )}
            </div>
          );
        })}
      </div>
      <PhotoPicker value={photos} onChange={setPhotos} entityType="QUALITY" projectId={projectId} />
    </Modal>
  );
}

/** Write a checklist, or change a copy of a built-in one. */
function ChecklistModal({ start, onClose, onSaved }: { start: any; onClose: () => void; onSaved: (msg: string) => void }) {
  const copying = start?.builtIn;
  const [name, setName] = useState(start ? (copying ? `${start.name}` : start.name) : "");
  const [kind, setKind] = useState<"QUALITY" | "SAFETY">(start?.kind || "QUALITY");
  const [items, setItems] = useState<string[]>(start?.items?.length ? [...start.items] : ["", "", ""]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setItem = (i: number, v: string) => setItems(items.map((x, j) => (j === i ? v : x)));
  const move = (i: number, d: number) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setItems(next);
  };
  return (
    <Modal
      wide
      title={copying ? `Change "${start.name}"` : start ? "Edit checklist" : "New checklist"}
      icon={ClipboardList}
      onClose={onClose}
      error={error}
      saving={saving}
      submitLabel="Save checklist"
      onSubmit={async () => {
        const points = items.map((x) => x.trim()).filter(Boolean);
        if (!points.length) return setError("Add at least one point to check.");
        setSaving(true);
        setError(null);
        try {
          const body = { name, kind, items: points };
          if (start && !copying) await api(`/api/quality/checklists/${start.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          else await api("/api/quality/checklists", post({ ...body, replacesKey: copying ? start.key : null }));
          onSaved(copying ? `Your version of "${name}" replaces the built-in one for everyone.` : `"${name}" saved. Site staff can run it from Run checklist.`);
        } catch (e: any) {
          setError(e.message);
        } finally {
          setSaving(false);
        }
      }}
    >
      {copying && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Your copy replaces the built-in checklist for your company. Remove your copy any time to get the original back.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Field label="Name">
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tiling check" className={inputCls} />
          </Field>
        </div>
        <Field label="Type">
          <select value={kind} onChange={(e) => setKind(e.target.value as any)} className={inputCls}>
            <option value="QUALITY">Quality</option>
            <option value="SAFETY">Safety</option>
          </select>
          <p className="mt-1 text-[11px] text-slate-500">{kind === "SAFETY" ? "A failed point opens an unsafe act." : "A failed point opens a quality defect."}</p>
        </Field>
      </div>
      <div>
        <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Points to check ({items.filter((x) => x.trim()).length})</div>
        <div className="space-y-1.5">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-6 text-right text-xs font-bold tabular-nums text-slate-400">{i + 1}</span>
              <input
                value={it}
                onChange={(e) => setItem(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setItems([...items.slice(0, i + 1), "", ...items.slice(i + 1)]);
                  }
                }}
                placeholder="e.g. Tiles soaked, joints 3 mm with spacers"
                maxLength={200}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              />
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label="Move up">
                <ArrowUp className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label="Move down">
                <ArrowDown className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setItems(items.length > 1 ? items.filter((_, j) => j !== i) : [""])} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove point">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setItems([...items, ""])} disabled={items.length >= 40} className="mt-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-40">
          <Plus className="h-4 w-4" /> Add a point
        </button>
      </div>
    </Modal>
  );
}

function ReportModal({ projects, onClose, onSaved }: { projects: any[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const [form, setForm] = useState({ projectId: projects[0]?.id || "", kind: "SAFETY_INCIDENT", severity: "HIGH", title: "", description: "", location: "", injuredCount: "0", dueDate: "" });
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title="Report an issue"
      icon={ShieldAlert}
      onClose={onClose}
      error={error}
      saving={saving}
      submitLabel="Report"
      onSubmit={async () => {
        setSaving(true);
        setError(null);
        try {
          const { urls, pending } = splitPhotos(photos, { entityType: "QUALITY", projectId: form.projectId });
          const r = await submitOrQueue<any>({
            label: `Issue: ${form.title || KIND[form.kind].label}`,
            url: "/api/quality/issues",
            body: { ...form, injuredCount: Number(form.injuredCount) || 0, description: form.description || null, location: form.location || null, dueDate: form.dueDate || null, photoUrls: urls },
            photos: pending,
            photoField: "photoUrls",
          });
          if (r.queued) return onSaved("No signal, so the issue is saved on this phone. It will be reported when you are back online.");
          const d = r.data;
          onSaved(`${d.issueNumber} reported. The project manager${KIND[form.kind].safety ? " and admins have" : " has"} been alerted.`);
        } catch (e: any) {
          setError(e.message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {Object.entries(KIND).map(([k, v]) => (
          <button
            key={k}
            type="button"
            onClick={() => setForm({ ...form, kind: k, severity: k === "SAFETY_INCIDENT" ? "HIGH" : "MEDIUM" })}
            className={cn("rounded-xl px-2 py-2 text-xs font-bold ring-1", form.kind === k ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200")}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Project">
          <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className={inputCls}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="How serious">
          <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className={inputCls}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </Field>
      </div>
      <Field label="What happened?">
        <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Worker slipped from scaffolding, 2nd floor" className={inputCls} />
      </Field>
      <Field label="Details">
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className={inputCls} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Where">
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Tower A, east side" className={inputCls} />
        </Field>
        {form.kind === "SAFETY_INCIDENT" ? (
          <Field label="People injured">
            <input type="number" min="0" value={form.injuredCount} onChange={(e) => setForm({ ...form, injuredCount: e.target.value })} className={inputCls} />
          </Field>
        ) : (
          <Field label="Fix by">
            <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={inputCls} />
          </Field>
        )}
      </div>
      <PhotoPicker value={photos} onChange={setPhotos} entityType="QUALITY" projectId={form.projectId} />
    </Modal>
  );
}

function ResolveModal({ issue, onClose, onSaved }: { issue: any; onClose: () => void; onSaved: () => void }) {
  const [resolution, setResolution] = useState("");
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title={`Fix ${issue.issueNumber}`}
      icon={CheckCircle2}
      onClose={onClose}
      error={error}
      saving={saving}
      submitLabel="Mark fixed"
      onSubmit={async () => {
        setSaving(true);
        setError(null);
        try {
          await api(`/api/quality/issues/${issue.id}/resolve`, post({ resolution, photoUrls: photos.map((p) => p.url) }));
          onSaved();
        } catch (e: any) {
          setError(e.message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <p className="text-sm font-semibold text-slate-800">{issue.title}</p>
      <Field label="What was done?">
        <textarea required value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3} placeholder="e.g. Cover blocks added, checked again by engineer" className={inputCls} />
      </Field>
      <PhotoPicker value={photos} onChange={setPhotos} entityType="QUALITY" projectId={issue.projectId} label="Add 'after' photos" />
    </Modal>
  );
}

function Thumbs({ urls, onOpen }: { urls: string[]; onOpen: (u: string) => void }) {
  if (!urls.length) return null;
  return (
    <div className="mt-2 flex gap-1.5">
      {urls.map((u) => (
        <button key={u} onClick={() => onOpen(u)} className="h-12 w-12 overflow-hidden rounded-lg border border-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt="" className="h-full w-full object-cover" />
        </button>
      ))}
    </div>
  );
}

export default function QualityPage() {
  const [me, setMe] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("issues");
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState("OPEN");
  const [kind, setKind] = useState("");
  const [issues, setIssues] = useState<any>(null);
  const [inspections, setInspections] = useState<any[] | null>(null);
  const [checklists, setChecklists] = useState<any[]>([]);
  const [modal, setModal] = useState<"inspect" | "report" | null>(null);
  const [editing, setEditing] = useState<any | undefined>(undefined);
  const [resolving, setResolving] = useState<any>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sp = new URLSearchParams();
    if (projectId) sp.set("projectId", projectId);
    try {
      const [i, ins] = await Promise.all([
        api(`/api/quality/issues?${sp}&status=${status}&kind=${kind}`),
        api(`/api/quality/inspections?${sp}`),
      ]);
      setIssues(i);
      setInspections(ins);
    } catch (e: any) {
      setError(e.message);
    }
  }, [projectId, status, kind]);

  const loadChecklists = () => api<any[]>("/api/quality/checklists").then(setChecklists).catch(() => {});

  const removeChecklist = async (c: any) => {
    if (!confirm(c.replacesKey ? `Remove your version of "${c.name}"? The built-in one comes back.` : `Remove "${c.name}"? Inspections already done keep their points.`)) return;
    try {
      await api(`/api/quality/checklists/${c.id}`, { method: "DELETE" });
      setNotice(`"${c.name}" removed.`);
      loadChecklists();
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("tab") === "inspections" || sp.get("tab") === "checklists") setTab(sp.get("tab") as Tab);
    if (sp.get("projectId")) setProjectId(sp.get("projectId")!);
    if (sp.get("kind") === "SAFETY" || sp.get("kind") === "QUALITY") setKind(sp.get("kind")!);
    if (sp.get("id")) {
      setHighlight(sp.get("id"));
      setStatus("");
    }
    api("/api/auth/me").then((d: any) => setMe(d.user)).catch(() => {});
    api<any>("/api/projects").then((d) => setProjects(Array.isArray(d) ? d : d?.projects || [])).catch(() => {});
    loadChecklists();
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const verify = async (issue: any, action: "CLOSE" | "REOPEN") => {
    const note = action === "REOPEN" ? window.prompt("Why reopen it?") : null;
    if (action === "REOPEN" && !note) return;
    try {
      await api(`/api/quality/issues/${issue.id}/verify`, post({ action, note }));
      setNotice(action === "CLOSE" ? `${issue.issueNumber} closed.` : `${issue.issueNumber} reopened.`);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const canWrite = canUser(me, "tasks:write");
  const isManager = me && ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER"].includes(me.role);
  const s = issues?.summary;

  return (
    <Shell>
      <div className="space-y-5">
        <PageHeader icon={HardHat} title="Quality & Safety" subtitle="Checklists before work is covered up, and every defect or incident followed until it is fixed.">
          {canWrite && (
            <>
              <button onClick={() => setModal("inspect")} disabled={!projects.length} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                <ClipboardCheck className="h-4 w-4" /> Run checklist
              </button>
              <button onClick={() => setModal("report")} disabled={!projects.length} className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50">
                <ShieldAlert className="h-4 w-4" /> Report issue
              </button>
            </>
          )}
        </PageHeader>

        {error && <Alert tone="error" onDismiss={() => setError(null)}>{error}</Alert>}
        {notice && <Alert tone="success" onDismiss={() => setNotice(null)}>{notice}</Alert>}

        {s && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className={cn("col-span-2 rounded-2xl p-4 text-white shadow-lg lg:col-span-1", s.daysSinceIncident === null || s.daysSinceIncident > 30 ? "bg-emerald-600" : "bg-gradient-chrome")}>
              <ShieldCheck className="h-5 w-5 opacity-80" />
              <div className="mt-1 font-display text-3xl font-extrabold tabular-nums">{s.daysSinceIncident ?? "—"}</div>
              <div className="text-xs opacity-80">{s.daysSinceIncident === null ? "No safety incidents recorded" : "days since the last safety incident"}</div>
            </div>
            <StatTile value={s.openSafety} label="Open safety issues" tone={s.openSafety ? "rose" : "slate"} />
            <StatTile value={s.openQuality} label="Open quality defects" tone={s.openQuality ? "amber" : "slate"} />
            <StatTile value={s.overdue} label="Past their fix-by date" tone={s.overdue ? "rose" : "slate"} />
            <StatTile value={s.passRate30d === null ? "—" : `${s.passRate30d}%`} label="Checklists passed (30 days)" tone="emerald" hint={`${s.inspections30d} inspections`} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "issues", label: "Defects & incidents", count: s ? s.openQuality + s.openSafety : undefined },
              { id: "inspections", label: "Checklists done", count: inspections?.length },
              { id: "checklists", label: "Checklists", count: checklists.length || undefined },
            ]}
          />
          <div className="ml-auto flex flex-wrap gap-2">
            {tab === "checklists" && isManager && (
              <button onClick={() => setEditing(null)} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-sm font-bold text-white hover:bg-slate-800">
                <Plus className="h-4 w-4" /> New checklist
              </button>
            )}
            {tab === "issues" && (
              <>
                <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm">
                  <option value="">Quality and safety</option>
                  <option value="QUALITY">Quality only</option>
                  <option value="SAFETY">Safety only</option>
                </select>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm">
                  <option value="OPEN">Open</option>
                  <option value="DONE">Fixed / closed</option>
                  <option value="">All</option>
                </select>
              </>
            )}
            {tab !== "checklists" && (
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm">
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {tab === "issues" &&
          (!issues ? (
            <div className="skeleton h-64 rounded-2xl" />
          ) : issues.issues.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Nothing here. Good work.</div>
          ) : (
            <div className="space-y-3">
              {issues.issues.map((i: any) => {
                const k = KIND[i.kind] || KIND.OBSERVATION;
                return (
                  <div key={i.id} className={cn("rounded-2xl border bg-white p-4 shadow-xs", highlight === i.id ? "border-amber-400 ring-2 ring-amber-200" : "border-slate-200/80", i.kind === "SAFETY_INCIDENT" && i.status === "OPEN" && "border-l-4 border-l-rose-600")}>
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-bold text-slate-600">{i.issueNumber}</span>
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold ring-1", k.pill)}>{k.label}</span>
                          <span className={cn("text-[11px] font-bold uppercase", SEVERITY[i.severity])}>{i.severity.toLowerCase()}</span>
                          {i.status !== "OPEN" && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">{i.status === "CLOSED" ? "Closed" : "Fixed, to verify"}</span>
                          )}
                          {i.overdue && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">
                              <AlertTriangle className="h-3 w-3" /> Overdue
                            </span>
                          )}
                        </div>
                        <h3 className="mt-1.5 font-semibold text-slate-900">{i.title}</h3>
                        <p className="text-xs text-slate-500">
                          {i.project.name}
                          {i.location && ` · ${i.location}`} · reported by {i.reportedByName} {shortDate(i.createdAt)}
                          {i.injuredCount > 0 && <span className="font-bold text-rose-600"> · {i.injuredCount} injured</span>}
                        </p>
                        {i.description && <p className="mt-1.5 text-sm text-slate-600">{i.description}</p>}
                        <Thumbs urls={i.photoUrls} onOpen={setLightbox} />
                        {i.resolution && (
                          <div className="mt-2 rounded-xl bg-emerald-50/70 p-2.5 text-sm text-emerald-900">
                            <b>{i.resolvedByName || "Fixed"}:</b> {i.resolution}
                            <Thumbs urls={i.resolutionPhotoUrls} onOpen={setLightbox} />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {i.assignee && (
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>
                              To fix: <b className="text-slate-700">{i.assignee.name}</b>
                              {i.dueDate && i.status === "OPEN" && ` by ${shortDate(i.dueDate)}`}
                            </span>
                            <ContactActions phone={i.assignee.phone} chatUserId={i.assignedTo} message={`${i.issueNumber}: ${i.title}`} size="sm" />
                          </div>
                        )}
                        <div className="flex gap-1.5">
                          {i.status === "OPEN" && canWrite && (
                            <button onClick={() => setResolving(i)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Mark fixed
                            </button>
                          )}
                          {i.status === "RESOLVED" && isManager && (
                            <button onClick={() => verify(i, "CLOSE")} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">
                              Accept and close
                            </button>
                          )}
                          {i.status !== "OPEN" && isManager && (
                            <button onClick={() => verify(i, "REOPEN")} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
                              <RotateCcw className="h-3.5 w-3.5" /> Reopen
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

        {tab === "inspections" &&
          (!inspections ? (
            <div className="skeleton h-64 rounded-2xl" />
          ) : inspections.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No checklists run yet.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {inspections.map((ins) => (
                <div key={ins.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-slate-900">{ins.title}</h3>
                      <p className="text-xs text-slate-500">
                        {ins.project.name}
                        {ins.location && ` · ${ins.location}`} · {ins.inspectedByName} · {shortDate(ins.createdAt)}
                      </p>
                    </div>
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", ins.result === "PASSED" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white")}>
                      {ins.result === "PASSED" ? "Passed" : `${ins.failed} failed`}
                    </span>
                  </div>
                  <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="bg-emerald-500" style={{ width: `${(ins.passed / ins.items.length) * 100}%` }} />
                    <div className="bg-rose-500" style={{ width: `${(ins.failed / ins.items.length) * 100}%` }} />
                  </div>
                  <ul className="mt-3 space-y-1">
                    {ins.items
                      .filter((it: any) => it.result === "FAIL")
                      .map((it: any) => (
                        <li key={it.label} className="flex gap-2 text-sm text-rose-700">
                          <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {it.label}
                          {it.note && <span className="text-slate-500">: {it.note}</span>}
                        </li>
                      ))}
                  </ul>
                  <Thumbs urls={ins.photoUrls} onOpen={setLightbox} />
                </div>
              ))}
            </div>
          ))}

        {tab === "checklists" && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {checklists.map((c) => (
              <div key={c.key} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900">{c.name}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                      <span className={cn("rounded-full px-2 py-0.5 ring-1", c.kind === "SAFETY" ? "bg-orange-50 text-orange-700 ring-orange-200" : "bg-blue-50 text-blue-700 ring-blue-200")}>{c.kind === "SAFETY" ? "Safety" : "Quality"}</span>
                      <span className={cn("rounded-full px-2 py-0.5 ring-1", c.builtIn ? "bg-slate-50 text-slate-500 ring-slate-200" : "bg-amber-50 text-amber-800 ring-amber-200")}>{c.builtIn ? "Built in" : c.replacesKey ? "Your version" : "Yours"}</span>
                      <span className="text-slate-400">{c.items.length} points</span>
                    </div>
                  </div>
                  {isManager && (
                    <div className="flex shrink-0 gap-1">
                      {c.builtIn ? (
                        <button onClick={() => setEditing(c)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                          <Copy className="h-3.5 w-3.5" /> Change
                        </button>
                      ) : (
                        <>
                          <button onClick={() => setEditing(c)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </button>
                          <button onClick={() => removeChecklist(c)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${c.name}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <ol className="mt-3 list-decimal space-y-0.5 pl-5 text-sm text-slate-600">
                  {c.items.map((it: string) => (
                    <li key={it}>{it}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing !== undefined && <ChecklistModal start={editing} onClose={() => setEditing(undefined)} onSaved={(m) => { setEditing(undefined); setNotice(m); loadChecklists(); }} />}
      {modal === "inspect" && <InspectionModal projects={projects} checklists={checklists} onClose={() => setModal(null)} onSaved={(m) => { setModal(null); setNotice(m); load(); }} />}
      {modal === "report" && <ReportModal projects={projects} onClose={() => setModal(null)} onSaved={(m) => { setModal(null); setNotice(m); load(); }} />}
      {resolving && <ResolveModal issue={resolving} onClose={() => setResolving(null)} onSaved={() => { setResolving(null); setNotice("Marked fixed. A manager will check and close it."); load(); }} />}
      {lightbox && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/90 p-4" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-xl" />
        </div>
      )}
    </Shell>
  );
}
