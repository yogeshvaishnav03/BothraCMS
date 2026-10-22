"use client";

import React, { useCallback, useEffect, useState } from "react";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Field, Modal, StatTile, inputCls } from "@/components/ui/Modal";
import { FileUpload } from "@/components/ui/FileUpload";
import { api, post, shortDate } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { CheckCircle2, ChevronDown, ExternalLink, FilePlus2, Layers, Search, ShieldCheck, Upload, XCircle } from "lucide-react";

const DISCIPLINES: Record<string, { label: string; dot: string }> = {
  ARCHITECTURAL: { label: "Architectural", dot: "bg-amber-500" },
  STRUCTURAL: { label: "Structural", dot: "bg-blue-500" },
  ELECTRICAL: { label: "Electrical", dot: "bg-yellow-400" },
  PLUMBING: { label: "Plumbing", dot: "bg-cyan-500" },
  HVAC: { label: "HVAC", dot: "bg-violet-500" },
  LANDSCAPE: { label: "Landscape", dot: "bg-emerald-500" },
  OTHER: { label: "Other", dot: "bg-slate-400" },
};

const REV_STATUS: Record<string, { label: string; pill: string }> = {
  FOR_APPROVAL: { label: "For approval", pill: "bg-amber-50 text-amber-800 ring-amber-200" },
  APPROVED: { label: "Approved", pill: "bg-blue-50 text-blue-700 ring-blue-200" },
  GFC: { label: "Good for construction", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  SUPERSEDED: { label: "Superseded", pill: "bg-slate-100 text-slate-500 ring-slate-200" },
  REJECTED: { label: "Sent back", pill: "bg-rose-50 text-rose-700 ring-rose-200" },
};

function Pill({ status }: { status: string }) {
  const s = REV_STATUS[status] || REV_STATUS.FOR_APPROVAL;
  return <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ring-1", s.pill)}>{s.label}</span>;
}

function NewDrawingModal({ projects, defaultProject, onClose, onSaved }: { projects: any[]; defaultProject: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ projectId: defaultProject || projects[0]?.id || "", number: "", title: "", discipline: "ARCHITECTURAL", notes: "" });
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title="Add a drawing"
      icon={FilePlus2}
      onClose={onClose}
      error={error}
      saving={saving}
      submitLabel="Add as R0"
      onSubmit={async () => {
        setSaving(true);
        setError(null);
        try {
          await api("/api/drawings", post({ ...form, fileUrl: file?.url || null, fileName: file?.name || null, notes: form.notes || null }));
          onSaved();
        } catch (e: any) {
          setError(e.message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <Field label="Project">
        <select required value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className={inputCls}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Drawing number">
          <input required value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="STR-GF-101" className={cn(inputCls, "uppercase")} />
        </Field>
        <Field label="Discipline">
          <select value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value })} className={inputCls}>
            {Object.entries(DISCIPLINES).map(([k, d]) => (
              <option key={k} value={k}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Title">
        <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ground floor slab reinforcement" className={inputCls} />
      </Field>
      <FileUpload value={file} onChange={setFile} entityType="DRAWING" projectId={form.projectId} category="DRAWING" label="Attach drawing (PDF or image)" />
      <Field label="Notes">
        <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. From consultant, 12 Oct" className={inputCls} />
      </Field>
    </Modal>
  );
}

function RevisionModal({ drawing, onClose, onSaved }: { drawing: any; onClose: () => void; onSaved: (rev: string) => void }) {
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title={`New revision of ${drawing.number}`}
      icon={Upload}
      onClose={onClose}
      error={error}
      saving={saving}
      submitLabel="Upload revision"
      onSubmit={async () => {
        if (!file) return setError("Attach the revised drawing.");
        setSaving(true);
        setError(null);
        try {
          const d = await api(`/api/drawings/${drawing.id}/revisions`, post({ fileUrl: file.url, fileName: file.name, notes: notes || null }));
          onSaved(d.revision);
        } catch (e: any) {
          setError(e.message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <p className="text-sm text-slate-600">{drawing.title}</p>
      <FileUpload value={file} onChange={setFile} entityType="DRAWING" projectId={drawing.project.id} category="DRAWING" />
      <Field label="What changed?">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="e.g. Beam B4 depth increased to 600 mm" className={inputCls} />
      </Field>
    </Modal>
  );
}

export default function DrawingsPage() {
  const [data, setData] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [revising, setRevising] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sp = new URLSearchParams();
    if (projectId) sp.set("projectId", projectId);
    if (discipline) sp.set("discipline", discipline);
    if (q.trim()) sp.set("q", q.trim());
    try {
      setData(await api(`/api/drawings?${sp}`));
    } catch (e: any) {
      setError(e.message);
    }
  }, [projectId, discipline, q]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) setOpen(id);
    api<any>("/api/projects").then((d) => setProjects(Array.isArray(d) ? d : d?.projects || [])).catch(() => {});
  }, []);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const review = async (rev: any, action: "APPROVE" | "ISSUE" | "REJECT") => {
    let note: string | null = null;
    if (action === "REJECT") {
      note = window.prompt("What needs to change?");
      if (!note) return;
    }
    try {
      await api(`/api/drawing-revisions/${rev.id}/review`, post({ action, note }));
      setNotice(action === "ISSUE" ? `${rev.revision} issued for construction. The site team has been told.` : action === "APPROVE" ? `${rev.revision} approved.` : `${rev.revision} sent back.`);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const s = data?.summary;

  return (
    <Shell>
      <div className="space-y-5">
        <PageHeader icon={Layers} title="Drawings Register" subtitle="Every drawing with its revisions, so site always builds from the current one.">
          {data?.canUpload && (
            <button onClick={() => setAdding(true)} disabled={projects.length === 0} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-brand px-4 py-2 text-sm font-bold text-slate-950 shadow-glow disabled:opacity-50">
              <FilePlus2 className="h-4 w-4" /> Add drawing
            </button>
          )}
        </PageHeader>

        {error && <Alert tone="error" onDismiss={() => setError(null)}>{error}</Alert>}
        {notice && <Alert tone="success" onDismiss={() => setNotice(null)}>{notice}</Alert>}

        {s && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile value={s.total} label="Drawings" />
            <StatTile value={s.gfc} label="Issued for construction" tone="emerald" />
            <StatTile value={s.waiting} label="Revisions waiting for approval" tone="amber" />
            <StatTile value={s.noGfc} label="Not yet issued to site" tone={s.noGfc ? "rose" : "slate"} />
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number or title" className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm" />
          </div>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select value={discipline} onChange={(e) => setDiscipline(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="">All disciplines</option>
            {Object.entries(DISCIPLINES).map(([k, d]) => (
              <option key={k} value={k}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        {!data ? (
          <div className="skeleton h-64 rounded-2xl" />
        ) : data.drawings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No drawings yet. Add the first one with its PDF.</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
            {data.drawings.map((d: any) => {
              const isOpen = open === d.id;
              const disc = DISCIPLINES[d.discipline] || DISCIPLINES.OTHER;
              return (
                <div key={d.id} className={cn("border-b border-slate-100 last:border-0", isOpen && "bg-slate-50/60")}>
                  <button onClick={() => setOpen(isOpen ? null : d.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left hover:bg-slate-50">
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", disc.dot)} title={disc.label} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-slate-900">{d.number}</span>
                        <span className="truncate text-sm text-slate-700">{d.title}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {disc.label} · {d.project.name}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {d.onSite ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-bold text-white">
                          <ShieldCheck className="h-3.5 w-3.5" /> On site: {d.onSite.revision}
                        </span>
                      ) : (
                        <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">Not issued</span>
                      )}
                      {d.latest && d.latest.id !== d.onSite?.id && (
                        <span className="flex items-center gap-1.5 text-xs">
                          <span className="font-mono font-bold text-slate-700">{d.latest.revision}</span>
                          <Pill status={d.latest.status} />
                        </span>
                      )}
                      <ChevronDown className={cn("h-4 w-4 text-slate-400 transition", isOpen && "rotate-180")} />
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4">
                      <ol className="space-y-2 border-l-2 border-slate-200 pl-4">
                        {d.revisions.map((r: any) => (
                          <li key={r.id} className="relative rounded-xl border border-slate-200 bg-white p-3">
                            <span className={cn("absolute -left-[23px] top-4 h-3 w-3 rounded-full ring-4 ring-white", r.status === "GFC" ? "bg-emerald-500" : r.status === "SUPERSEDED" ? "bg-slate-300" : "bg-amber-400")} />
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-sm font-bold">{r.revision}</span>
                              <Pill status={r.status} />
                              <span className="text-xs text-slate-500">
                                by {r.uploadedByName || "someone"} · {shortDate(r.createdAt)}
                                {r.reviewedByName && ` · reviewed by ${r.reviewedByName}`}
                              </span>
                              <div className="ml-auto flex flex-wrap gap-1.5">
                                {r.fileUrl && (
                                  <a href={r.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                    <ExternalLink className="h-3.5 w-3.5" /> Open
                                  </a>
                                )}
                                {data.canReview && ["FOR_APPROVAL", "APPROVED"].includes(r.status) && (
                                  <>
                                    {r.status === "FOR_APPROVAL" && (
                                      <button onClick={() => review(r, "APPROVE")} className="rounded-lg border border-blue-200 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-50">
                                        Approve
                                      </button>
                                    )}
                                    <button onClick={() => review(r, "ISSUE")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700">
                                      <CheckCircle2 className="h-3.5 w-3.5" /> Issue to site
                                    </button>
                                    <button onClick={() => review(r, "REJECT")} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-50">
                                      <XCircle className="h-3.5 w-3.5" /> Send back
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                            {r.notes && <p className="mt-1.5 text-sm text-slate-600">{r.notes}</p>}
                          </li>
                        ))}
                      </ol>
                      {data.canUpload && (
                        <button onClick={() => setRevising(d)} className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                          <Upload className="h-4 w-4" /> Upload new revision
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {adding && <NewDrawingModal projects={projects} defaultProject={projectId} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setNotice("Drawing added as R0, waiting for approval."); load(); }} />}
      {revising && <RevisionModal drawing={revising} onClose={() => setRevising(null)} onSaved={(rev) => { setRevising(null); setNotice(`${rev} uploaded, waiting for approval.`); load(); }} />}
    </Shell>
  );
}
