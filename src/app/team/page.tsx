"use client";

import React, { useEffect, useMemo, useState } from "react";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { ContactActions } from "@/components/ui/ContactActions";
import { canUser } from "@/lib/permissions";
import { cn } from "@/lib/cn";
import {
  Check,
  Copy,
  Edit2,
  KeyRound,
  Plus,
  Search,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserX,
  Users,
  X,
} from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  phone: string | null;
  jobTitle: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLES: { value: string; label: string; hint: string; tone: string }[] = [
  { value: "ORG_ADMIN", label: "Admin", hint: "Everything in the company, including staff and approvals", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  { value: "PROJECT_MANAGER", label: "Project Manager", hint: "Projects, tasks, materials and finance view for assigned projects", tone: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  { value: "SITE_SUPERVISOR", label: "Site Supervisor", hint: "Site work, attendance, material issue and daily reports", tone: "bg-orange-50 text-orange-700 ring-orange-200" },
  { value: "ACCOUNTANT", label: "Accountant", hint: "Bills, payments and vendor bank details", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  { value: "STOREKEEPER", label: "Storekeeper", hint: "Stock receipts, issues and transfers", tone: "bg-sky-50 text-sky-700 ring-sky-200" },
  { value: "HR_VIEWER", label: "HR", hint: "Attendance and workforce records", tone: "bg-pink-50 text-pink-700 ring-pink-200" },
  { value: "AUDITOR", label: "Auditor", hint: "Read-only access to records and the audit log", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
  { value: "SUPER_ADMIN", label: "Super Admin", hint: "Platform owner across all companies", tone: "bg-rose-50 text-rose-700 ring-rose-200" },
];
const roleMeta = (r: string) => ROLES.find((x) => x.value === r) || { value: r, label: r, hint: "", tone: "bg-slate-100 text-slate-700 ring-slate-200" };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function lastSeen(iso: string | null) {
  if (!iso) return "Never signed in";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "Active just now";
  if (mins < 60) return `Last seen ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Last seen ${hrs} h ago`;
  return `Last seen ${new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

const EMPTY = { name: "", email: "", role: "SITE_SUPERVISOR", phone: "", jobTitle: "" };

export default function TeamPage() {
  const [me, setMe] = useState<any>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "INACTIVE" | "ALL">("ACTIVE");

  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [credentials, setCredentials] = useState<{ name: string; email: string; password: string; isNew: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const canManage = canUser(me, "users:manage");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || "Could not load the team");
      setMembers(json.data);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((res) => res.success && setMe(res.data.user))
      .catch(() => {});
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter(
      (m) =>
        (statusFilter === "ALL" || m.status === statusFilter) &&
        (!roleFilter || m.role === roleFilter) &&
        (!q || [m.name, m.email, m.phone, m.jobTitle].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
    );
  }, [members, search, roleFilter, statusFilter]);

  const counts = useMemo(() => {
    const active = members.filter((m) => m.status === "ACTIVE");
    const byRole: Record<string, number> = {};
    active.forEach((m) => (byRole[m.role] = (byRole[m.role] || 0) + 1));
    return { active: active.length, inactive: members.length - active.length, byRole };
  }, [members]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setShowForm(true);
  };
  const openEdit = (m: TeamMember) => {
    setEditing(m);
    setForm({ name: m.name, email: m.email, role: m.role, phone: m.phone || "", jobTitle: m.jobTitle || "" });
    setShowForm(true);
  };

  const call = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error?.message || "Something went wrong");
    return json.data;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await call(`/api/users/${editing.id}`, "PATCH", {
          name: form.name,
          role: form.role,
          phone: form.phone || null,
          jobTitle: form.jobTitle || null,
        });
        setNotice(`${form.name} updated.`);
      } else {
        const data = await call("/api/users", "POST", {
          name: form.name,
          email: form.email,
          role: form.role,
          phone: form.phone || null,
          jobTitle: form.jobTitle || null,
        });
        setCredentials({ name: data.user.name, email: data.user.email, password: data.temporaryPassword, isNew: true });
      }
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (m: TeamMember) => {
    const next = m.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    if (next === "INACTIVE" && !confirm(`Deactivate ${m.name}? They will be signed out and cannot log in until reactivated.`)) return;
    try {
      await call(`/api/users/${m.id}`, "PATCH", { status: next });
      setNotice(`${m.name} ${next === "ACTIVE" ? "reactivated" : "deactivated"}.`);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const reset = async (m: TeamMember) => {
    if (!confirm(`Reset the password for ${m.name}? Their current password will stop working.`)) return;
    try {
      const data = await call(`/api/users/${m.id}/reset-password`, "POST");
      setCredentials({ name: m.name, email: m.email, password: data.temporaryPassword, isNew: false });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loginText = credentials
    ? `Bothra CMS login\nLink: ${typeof window !== "undefined" ? window.location.origin : ""}/login\nEmail: ${credentials.email}\nTemporary password: ${credentials.password}\nPlease change it from Settings after you sign in.`
    : "";

  const inputCls = "w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm";
  const labelCls = "block text-xs font-semibold text-slate-600 mb-1";

  return (
    <Shell>
      <div className="space-y-5">
        <PageHeader icon={UserCog} title="Team & Access" subtitle="Add team members, set their roles and permissions, and manage site access.">
          {canManage && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-brand text-slate-950 font-bold text-sm shadow-glow hover:brightness-110 transition"
            >
              <Plus className="w-4 h-4" /> Add person
            </button>
          )}
        </PageHeader>

        {notice && <Alert tone="success" onDismiss={() => setNotice(null)}>{notice}</Alert>}
        {error && <Alert tone="error" onDismiss={() => setError(null)}>{error}</Alert>}

        {/* Role summary */}
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          <button
            onClick={() => setRoleFilter("")}
            className={cn(
              "shrink-0 rounded-2xl px-4 py-3 text-left ring-1 transition min-w-[130px]",
              !roleFilter ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-200 hover:ring-slate-300"
            )}
          >
            <div className="font-display text-xl font-extrabold tabular-nums">{counts.active}</div>
            <div className={cn("text-xs", !roleFilter ? "text-slate-300" : "text-slate-500")}>Active people</div>
          </button>
          {ROLES.filter((r) => counts.byRole[r.value]).map((r) => (
            <button
              key={r.value}
              onClick={() => setRoleFilter(roleFilter === r.value ? "" : r.value)}
              className={cn(
                "shrink-0 rounded-2xl px-4 py-3 text-left ring-1 transition min-w-[130px]",
                roleFilter === r.value ? r.tone + " ring-2" : "bg-white ring-slate-200 hover:ring-slate-300"
              )}
            >
              <div className="font-display text-xl font-extrabold tabular-nums text-slate-900">{counts.byRole[r.value]}</div>
              <div className="text-xs text-slate-500">{r.label}</div>
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone, job title…"
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl"
            />
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 self-start">
            {(["ACTIVE", "INACTIVE", "ALL"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition",
                  statusFilter === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                )}
              >
                {s === "ACTIVE" ? "Active" : s === "INACTIVE" ? `Deactivated (${counts.inactive})` : "All"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-40 rounded-2xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 bg-white rounded-2xl border border-dashed border-slate-300">
            <Users className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-800 mt-2">No one matches</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
            {filtered.map((m) => {
              const meta = roleMeta(m.role);
              const isMe = m.id === me?.id;
              const inactive = m.status !== "ACTIVE";
              const canEditThis = canManage && (m.role !== "SUPER_ADMIN" || me?.role === "SUPER_ADMIN");
              return (
                <div
                  key={m.id}
                  className={cn(
                    "bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-lg transition-all p-4 flex flex-col gap-3",
                    inactive && "opacity-70"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-600 text-amber-300 font-bold flex items-center justify-center">
                        {initials(m.name)}
                      </div>
                      {!inactive && m.lastLoginAt && Date.now() - new Date(m.lastLoginAt).getTime() < 15 * 60000 && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900 truncate">
                        {m.name} {isMe && <span className="text-xs font-normal text-slate-400">(you)</span>}
                      </div>
                      {m.jobTitle && <div className="text-xs text-slate-500 truncate">{m.jobTitle}</div>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-md ring-1", meta.tone)}>{meta.label}</span>
                        {inactive && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md ring-1 bg-rose-50 text-rose-700 ring-rose-200">Deactivated</span>}
                      </div>
                    </div>
                    {canEditThis && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEdit(m)} title="Edit" className="p-1.5 rounded-lg ring-1 ring-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {!isMe && (
                          <>
                            <button onClick={() => reset(m)} title="Reset password" className="p-1.5 rounded-lg ring-1 ring-slate-200 text-slate-500 hover:text-amber-700 hover:bg-amber-50">
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => toggleStatus(m)}
                              title={inactive ? "Reactivate" : "Deactivate"}
                              className={cn(
                                "p-1.5 rounded-lg ring-1 ring-slate-200",
                                inactive ? "text-emerald-600 hover:bg-emerald-50" : "text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                              )}
                            >
                              {inactive ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 space-y-0.5">
                    <div className="truncate">{m.email}</div>
                    <div>
                      {m.phone || "No phone added"} · {lastSeen(m.lastLoginAt)}
                    </div>
                  </div>
                  <div className="mt-auto pt-1">
                    <ContactActions phone={m.phone} email={m.email} chatUserId={isMe || inactive ? null : m.id} message={`Namaste ${m.name},`} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add / edit */}
        {showForm && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
            <form onSubmit={submit} className="bg-white rounded-3xl max-w-lg w-full shadow-2xl ring-1 ring-slate-200 max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 shrink-0 bg-white">
                <div className="font-display font-bold text-lg text-slate-900">{editing ? `Edit ${editing.name}` : "Add a person"}</div>
                <button type="button" onClick={() => setShowForm(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Full name *</label>
                    <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Work email (used to log in) *</label>
                    <input
                      required
                      type="email"
                      disabled={Boolean(editing)}
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className={cn(inputCls, editing && "bg-slate-50 text-slate-500")}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Mobile (for WhatsApp)</label>
                    <input type="tel" placeholder="+91 98765 43210" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Job title</label>
                    <input placeholder="e.g. Site Engineer" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>What can they do?</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ROLES.filter((r) => r.value !== "SUPER_ADMIN" || me?.role === "SUPER_ADMIN").map((r) => (
                      <label
                        key={r.value}
                        className={cn(
                          "cursor-pointer rounded-xl p-3 ring-1 transition",
                          form.role === r.value ? "ring-2 ring-amber-400 bg-amber-50/50" : "ring-slate-200 hover:ring-slate-300",
                          editing?.id === me?.id && "pointer-events-none opacity-60"
                        )}
                      >
                        <input type="radio" name="role" value={r.value} checked={form.role === r.value} onChange={() => setForm({ ...form, role: r.value })} className="sr-only" />
                        <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                          {form.role === r.value && <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />}
                          {r.label}
                        </div>
                        <div className="text-[11px] text-slate-500 leading-snug mt-0.5">{r.hint}</div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200/70 rounded-xl transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-5 py-2.5 bg-gradient-brand text-slate-950 font-bold text-sm rounded-xl shadow-glow hover:brightness-110 disabled:opacity-50 transition">
                  {saving ? "Saving…" : editing ? "Save" : "Add and create login"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* One-time credentials */}
        {credentials && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
            <div className="bg-white rounded-3xl max-w-md w-full shadow-xl ring-1 ring-slate-200 max-h-[90vh] overflow-y-auto animate-scale-in">
              <div className="bg-gradient-chrome text-white p-5">
                <div className="text-[11px] uppercase tracking-wider text-amber-300 font-semibold flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" /> {credentials.isNew ? "Login created" : "Password reset"}
                </div>
                <div className="font-display text-lg font-bold mt-1">{credentials.name}</div>
              </div>
              <div className="p-5 space-y-3">
                <Alert tone="warning">This password is shown only once. Copy it now and share it privately.</Alert>
                <div className="rounded-xl bg-slate-50 p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Email</span>
                    <span className="font-semibold text-slate-900 truncate">{credentials.email}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Temporary password</span>
                    <span className="font-mono font-semibold text-slate-900">{credentials.password}</span>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(loginText);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      } catch {}
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold ring-1 ring-slate-200 hover:bg-slate-50"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Copied" : "Copy login details"}
                  </button>
                  <button onClick={() => setCredentials(null)} className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-900 text-white">
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
