"use client";

import React, { useEffect, useMemo, useState } from "react";
import Shell from "@/components/layout/Shell";
import { useAppSession } from "@/components/providers/AppSessionProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { useTablePagination, ShowEntriesControl, TablePagination } from "@/components/ui/ExcelTable";
import { ContactActions } from "@/components/ui/ContactActions";
import {
  ALL_PERMISSIONS,
  canUser,
  EXTRA_ACCESS_MODULES,
  ExtraAccessModule,
  Permission,
  ROLE_PERMISSIONS,
  Role,
  VIEW_ONLY_PERMISSIONS,
} from "@/lib/permissions";
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
  Eye,
  EyeOff,
  Sparkles,
  Lock,
} from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  phone: string | null;
  jobTitle: string | null;
  extraPermissions?: Permission[];
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLES: { value: string; label: string; hint: string; tone: string }[] = [
  { value: "ORG_ADMIN", label: "Admin", hint: "Everything in the company, including staff and approvals", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  { value: "PROJECT_MANAGER", label: "Project Manager", hint: "Projects, tasks, materials, drawings and site execution", tone: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  { value: "SITE_SUPERVISOR", label: "Site Supervisor", hint: "Site work, attendance, material issue and daily reports", tone: "bg-orange-50 text-orange-700 ring-orange-200" },
  { value: "ACCOUNTANT", label: "Accountant", hint: "Bills, payments and vendor bank details", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  { value: "STOREKEEPER", label: "Storekeeper", hint: "Stock receipts, issues and transfers", tone: "bg-sky-50 text-sky-700 ring-sky-200" },
  { value: "HR_VIEWER", label: "HR", hint: "Attendance and worker records", tone: "bg-pink-50 text-pink-700 ring-pink-200" },
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

const EMPTY: {
  name: string;
  email: string;
  role: string;
  phone: string;
  jobTitle: string;
  extraPermissions: Permission[];
} = { name: "", email: "", role: "SITE_SUPERVISOR", phone: "", jobTitle: "", extraPermissions: [] };

export default function TeamPage() {
  const { refreshUser } = useAppSession();
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
  const [editPassword, setEditPassword] = useState("");
  const [showEditPasswordText, setShowEditPasswordText] = useState(false);
  const [saving, setSaving] = useState(false);
  const [credentials, setCredentials] = useState<{ name: string; email: string; password: string; isNew: boolean } | null>(null);
  const [showCredentialPassword, setShowCredentialPassword] = useState(true);
  const [copied, setCopied] = useState(false);

  // Dedicated Password Modal for Admins & Super Admins
  const [passwordTarget, setPasswordTarget] = useState<TeamMember | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [passwordMode, setPasswordMode] = useState<"CUSTOM" | "GENERATE">("CUSTOM");
  const [pendingTeamAction, setPendingTeamAction] = useState<
    | { kind: "deactivate"; member: TeamMember }
    | { kind: "resetPassword"; member: TeamMember }
    | null
  >(null);

  useEffect(() => {
    if (!(showForm || passwordTarget || credentials || pendingTeamAction)) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowForm(false);
        setPasswordTarget(null);
        setCredentials(null);
        setPendingTeamAction(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showForm, passwordTarget, credentials, pendingTeamAction]);

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
    refreshUser()
      .then((u) => u && setMe(u))
      .catch(() => {});
    load();
  }, [refreshUser]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter(
      (m) =>
        (statusFilter === "ALL" || m.status === statusFilter) &&
        (!roleFilter || m.role === roleFilter) &&
        (!q || [m.name, m.email, m.phone, m.jobTitle].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
    );
  }, [members, search, roleFilter, statusFilter]);

  const teamPagination = useTablePagination(filtered);

  const counts = useMemo(() => {
    const active = members.filter((m) => m.status === "ACTIVE");
    const byRole: Record<string, number> = {};
    active.forEach((m) => (byRole[m.role] = (byRole[m.role] || 0) + 1));
    return { active: active.length, inactive: members.length - active.length, byRole };
  }, [members]);

  const openCreate = () => {
    setEditing(null);
    setEditPassword("");
    setShowEditPasswordText(false);
    setForm({ ...EMPTY });
    setShowForm(true);
  };
  const openEdit = (m: TeamMember) => {
    setEditing(m);
    setEditPassword("");
    setShowEditPasswordText(false);
    setForm({
      name: m.name,
      email: m.email,
      role: m.role,
      phone: m.phone || "",
      jobTitle: m.jobTitle || "",
      extraPermissions: m.extraPermissions || [],
    });
    setShowForm(true);
  };

  const roleIncludedSet = useMemo(
    () => new Set<Permission>(ROLE_PERMISSIONS[form.role as Role] || []),
    [form.role]
  );

  const extraOnlyPermissions = useMemo(
    () => (form.extraPermissions || []).filter((p) => !roleIncludedSet.has(p)),
    [form.extraPermissions, roleIncludedSet]
  );

  const isViewOnlyPresetActive = useMemo(() => {
    const viewExtras = VIEW_ONLY_PERMISSIONS.filter((p) => !roleIncludedSet.has(p));
    if (viewExtras.length === 0) return false;
    const viewSet = new Set<Permission>(VIEW_ONLY_PERMISSIONS);
    const hasAllView = viewExtras.every((p) => extraOnlyPermissions.includes(p));
    const hasOnlyView = extraOnlyPermissions.every((p) => viewSet.has(p));
    return hasAllView && hasOnlyView;
  }, [extraOnlyPermissions, roleIncludedSet]);

  const isFullAccessPresetActive = useMemo(() => {
    const fullExtras = ALL_PERMISSIONS.filter((p) => !roleIncludedSet.has(p));
    return fullExtras.length > 0 && fullExtras.every((p) => extraOnlyPermissions.includes(p));
  }, [extraOnlyPermissions, roleIncludedSet]);

  const applyAccessPreset = (preset: "VIEW_ONLY" | "FULL_ACCESS" | "CLEAR") => {
    setForm((prev) => {
      const baseSet = new Set<Permission>(ROLE_PERMISSIONS[prev.role as Role] || []);
      if (preset === "CLEAR") {
        return { ...prev, extraPermissions: [] };
      }
      const targetList = preset === "VIEW_ONLY" ? VIEW_ONLY_PERMISSIONS : ALL_PERMISSIONS;
      const targetExtras = targetList.filter((p) => !baseSet.has(p));
      const current = prev.extraPermissions || [];
      const currentExtras = current.filter((p) => !baseSet.has(p));
      const targetSet = new Set<Permission>(targetList);
      const alreadyMatches =
        targetExtras.length > 0 &&
        targetExtras.every((p) => currentExtras.includes(p)) &&
        currentExtras.every((p) => targetSet.has(p));
      return {
        ...prev,
        extraPermissions: alreadyMatches ? [] : targetExtras,
      };
    });
  };

  const groupedAccessModules = useMemo(() => {
    const groups: {
      group: string;
      viewMod?: ExtraAccessModule;
      fullMod?: ExtraAccessModule;
    }[] = [];
    const byGroup = new Map<string, (typeof groups)[number]>();
    for (const mod of EXTRA_ACCESS_MODULES) {
      let entry = byGroup.get(mod.group);
      if (!entry) {
        entry = { group: mod.group };
        byGroup.set(mod.group, entry);
        groups.push(entry);
      }
      if (mod.accessLevel === "VIEW") entry.viewMod = mod;
      else entry.fullMod = mod;
    }
    return groups;
  }, []);

  const setGroupAccessLevel = (
    viewMod: ExtraAccessModule | undefined,
    fullMod: ExtraAccessModule | undefined,
    target: "NONE" | "VIEW" | "FULL"
  ) => {
    setForm((prev) => {
      const baseSet = new Set<Permission>(ROLE_PERMISSIONS[prev.role as Role] || []);
      const current = new Set<Permission>(prev.extraPermissions || []);
      viewMod?.permissions.forEach((p) => {
        if (!baseSet.has(p)) current.delete(p);
      });
      fullMod?.permissions.forEach((p) => {
        if (!baseSet.has(p)) current.delete(p);
      });
      const chosen = target === "FULL" ? fullMod : target === "VIEW" ? viewMod : undefined;
      chosen?.permissions.forEach((p) => {
        if (!baseSet.has(p)) current.add(p);
      });
      return { ...prev, extraPermissions: Array.from(current) };
    });
  };

  const openPasswordModal = (m: TeamMember) => {
    setPasswordTarget(m);
    setNewPassword("");
    setShowPasswordText(false);
    setPasswordMode("CUSTOM");
  };

  const handleGeneratePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let p = "";
    for (let i = 0; i < 8; i++) p += chars.charAt(Math.floor(Math.random() * chars.length));
    setNewPassword(`Bothra!${p}7`);
    setShowPasswordText(true);
  };

  const submitPasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordTarget) return;
    setSaving(true);
    setError(null);
    try {
      const payload = passwordMode === "CUSTOM" && newPassword.trim() ? { password: newPassword.trim() } : {};
      const data = await call(`/api/users/${passwordTarget.id}/reset-password`, "POST", payload);
      setCredentials({
        name: passwordTarget.name,
        email: passwordTarget.email,
        password: data.temporaryPassword,
        isNew: false,
      });
      setShowCredentialPassword(true);
      setPasswordTarget(null);
      setNotice(`Password updated successfully for ${passwordTarget.name}!`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
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
        const baseSet = new Set<Permission>(ROLE_PERMISSIONS[form.role as Role] || []);
        const extraPermissions = (form.extraPermissions || []).filter((p) => !baseSet.has(p));
        const patchPayload: any = {
          name: form.name,
          role: form.role,
          phone: form.phone || null,
          jobTitle: form.jobTitle || null,
          extraPermissions,
        };
        if (editPassword.trim()) {
          patchPayload.password = editPassword.trim();
        }
        await call(`/api/users/${editing.id}`, "PATCH", patchPayload);
        if (editing.id === me?.id) {
          const fresh = await refreshUser(true);
          if (fresh) setMe(fresh);
        }
        if (editPassword.trim()) {
          setCredentials({
            name: form.name,
            email: editing.email,
            password: editPassword.trim(),
            isNew: false,
          });
          setShowCredentialPassword(true);
          setNotice(`${form.name} profile and password updated successfully.`);
        } else {
          setNotice(`${form.name} updated.`);
        }
      } else {
        const baseSet = new Set<Permission>(ROLE_PERMISSIONS[form.role as Role] || []);
        const extraPermissions = (form.extraPermissions || []).filter((p) => !baseSet.has(p));
        const data = await call("/api/users", "POST", {
          name: form.name,
          email: form.email,
          role: form.role,
          phone: form.phone || null,
          jobTitle: form.jobTitle || null,
          extraPermissions,
        });
        setCredentials({ name: data.user.name, email: data.user.email, password: data.temporaryPassword, isNew: true });
        setShowCredentialPassword(true);
      }
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const performStatusToggle = async (m: TeamMember, next: "ACTIVE" | "INACTIVE") => {
    try {
      await call(`/api/users/${m.id}`, "PATCH", { status: next });
      setNotice(`${m.name} ${next === "ACTIVE" ? "reactivated" : "deactivated"}.`);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleStatus = (m: TeamMember) => {
    const next = m.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    if (next === "INACTIVE") {
      setPendingTeamAction({ kind: "deactivate", member: m });
      return;
    }
    performStatusToggle(m, next);
  };

  const executePendingTeamAction = async () => {
    if (!pendingTeamAction) return;
    const action = pendingTeamAction;
    setPendingTeamAction(null);
    setSaving(true);
    try {
      if (action.kind === "deactivate") {
        await performStatusToggle(action.member, "INACTIVE");
      } else {
        const data = await call(`/api/users/${action.member.id}/reset-password`, "POST");
        setCredentials({
          name: action.member.name,
          email: action.member.email,
          password: data.temporaryPassword,
          isNew: false,
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
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
              className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-brand text-slate-950 font-bold text-sm shadow-glow hover:brightness-110 transition"
            >
              <Plus className="w-4 h-4" /> Add person
            </button>
          )}
        </PageHeader>

        {notice && <Alert tone="success" onDismiss={() => setNotice(null)}>{notice}</Alert>}
        {error && <Alert tone="error" onDismiss={() => setError(null)}>{error}</Alert>}

        {/* Role summary */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2">
          <button
            onClick={() => setRoleFilter("")}
            className={cn(
              "rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-left ring-1 transition sm:min-w-[130px]",
              !roleFilter ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-200 hover:ring-slate-300"
            )}
          >
            <div className="font-display text-lg sm:text-xl font-extrabold tabular-nums">{counts.active}</div>
            <div className={cn("text-xs truncate", !roleFilter ? "text-slate-300" : "text-slate-500")}>Active people</div>
          </button>
          {ROLES.filter((r) => counts.byRole[r.value]).map((r) => (
            <button
              key={r.value}
              onClick={() => setRoleFilter(roleFilter === r.value ? "" : r.value)}
              className={cn(
                "rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-left ring-1 transition sm:min-w-[130px]",
                roleFilter === r.value ? r.tone + " ring-2" : "bg-white ring-slate-200 hover:ring-slate-300"
              )}
            >
              <div className="font-display text-lg sm:text-xl font-extrabold tabular-nums text-slate-900">{counts.byRole[r.value]}</div>
              <div className="text-xs text-slate-500 truncate">{r.label}</div>
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
          <div className="grid grid-cols-3 sm:flex items-center gap-1 p-1 rounded-xl bg-slate-100 w-full sm:w-auto sm:self-start">
            {(["ACTIVE", "INACTIVE", "ALL"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold text-center whitespace-nowrap transition",
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
          <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 shadow-2xs">
            <ShowEntriesControl
              pageSize={teamPagination.pageSize}
              onPageSizeChange={teamPagination.setPageSize}
            />
            <span className="text-xs text-slate-500">
              Showing {teamPagination.startItem} to {teamPagination.endItem} of {teamPagination.filteredCount} team members
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
            {teamPagination.paginatedData.map((m) => {
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
                        {(() => {
                          const base = new Set<Permission>(ROLE_PERMISSIONS[m.role as Role] || []);
                          const activeGroups = new Set(
                            EXTRA_ACCESS_MODULES.filter((mod) => {
                              const extraForMod = mod.permissions.filter((p) => !base.has(p));
                              return extraForMod.length > 0 && extraForMod.every((p) => (m.extraPermissions || []).includes(p));
                            }).map((mod) => mod.group)
                          );
                          if (activeGroups.size === 0 && !(m.extraPermissions && m.extraPermissions.length > 0)) return null;
                          const labelCount = activeGroups.size > 0 ? activeGroups.size : m.extraPermissions!.length;
                          return (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md ring-1 bg-violet-50 text-violet-700 ring-violet-200">
                              +{labelCount} extra access
                            </span>
                          );
                        })()}
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
                            <button onClick={() => openPasswordModal(m)} title="Update / Reset password" className="p-1.5 rounded-lg ring-1 ring-slate-200 text-slate-500 hover:text-amber-700 hover:bg-amber-50">
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
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
            <TablePagination
              currentPage={teamPagination.currentPage}
              totalPages={teamPagination.totalPages}
              totalItems={teamPagination.filteredCount}
              totalUnfiltered={teamPagination.totalRecords}
              pageSize={teamPagination.pageSize}
              startItem={teamPagination.startItem}
              endItem={teamPagination.endItem}
              onPageChange={teamPagination.setCurrentPage}
              itemLabel="team members"
            />
          </div>
          </>
        )}

        {/* Add / edit */}
        {showForm && (
          <div className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <form onSubmit={submit} className="bg-white rounded-3xl max-w-lg w-full shadow-2xl ring-1 ring-slate-200 max-h-[90dvh] flex flex-col overflow-hidden animate-scale-in">
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
                    {editing && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        Email cannot be changed after an account is created.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Mobile (for WhatsApp)</label>
                    <input type="tel" placeholder="+91 98765 43210" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Job title</label>
                    <input placeholder="e.g. Site Engineer" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} className={inputCls} />
                  </div>

                  {editing && (
                    <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-1">
                        <label className={labelCls}>Update Password (optional)</label>
                        <button
                          type="button"
                          onClick={() => {
                            const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
                            let p = "";
                            for (let i = 0; i < 8; i++) p += chars.charAt(Math.floor(Math.random() * chars.length));
                            setEditPassword(`Bothra!${p}7`);
                            setShowEditPasswordText(true);
                          }}
                          className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1 hover:underline cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3" /> Auto-suggest strong
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type={showEditPasswordText ? "text" : "password"}
                          placeholder="Type new password to update..."
                          value={editPassword}
                          onChange={(e) => setEditPassword(e.target.value)}
                          className={cn(inputCls, "font-mono pr-10")}
                        />
                        <button
                          type="button"
                          onClick={() => setShowEditPasswordText(!showEditPasswordText)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          title={showEditPasswordText ? "Hide password" : "Show password"}
                        >
                          {showEditPasswordText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">If filled in, their password updates immediately and will be shown once for you to copy.</p>
                    </div>
                  )}
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

                {/* Extra Accessibility Modules beyond the primary role */}
                {(() => {
                  const isLockedSelf =
                    editing?.id === me?.id && me?.role !== "SUPER_ADMIN" && me?.role !== "ORG_ADMIN";
                  const canGrantViewPreset = VIEW_ONLY_PERMISSIONS.some((p) => !roleIncludedSet.has(p));
                  const canGrantFullPreset = ALL_PERMISSIONS.some((p) => !roleIncludedSet.has(p));

                  return (
                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <label className={cn(labelCls, "mb-0")}>Extra Accessibility (Beyond Role)</label>
                        {extraOnlyPermissions.length > 0 && (
                          <button
                            type="button"
                            disabled={isLockedSelf}
                            onClick={() => applyAccessPreset("CLEAR")}
                            className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 transition disabled:opacity-50"
                          >
                            Clear extras
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mb-2.5 leading-snug">
                        Choose quick presets or pick <strong>View only</strong> / <strong>Full access</strong> per module without changing their primary role.
                      </p>

                      {/* Quick Presets: View Only (All) & Full Access (All) */}
                      {(canGrantViewPreset || canGrantFullPreset) && (
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          {canGrantViewPreset && (
                            <button
                              type="button"
                              disabled={isLockedSelf}
                              onClick={() => applyAccessPreset("VIEW_ONLY")}
                              className={cn(
                                "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
                                isViewOnlyPresetActive
                                  ? "border-sky-600 bg-sky-600 text-white shadow-xs"
                                  : "border-slate-200 bg-white text-slate-700 hover:bg-sky-50/70 hover:border-sky-300",
                                isLockedSelf && "opacity-60 cursor-not-allowed"
                              )}
                            >
                              <Eye className={cn("w-3.5 h-3.5 shrink-0", isViewOnlyPresetActive ? "text-white" : "text-sky-600")} />
                              <span>View Only (All)</span>
                            </button>
                          )}
                          {canGrantFullPreset && (
                            <button
                              type="button"
                              disabled={isLockedSelf}
                              onClick={() => applyAccessPreset("FULL_ACCESS")}
                              className={cn(
                                "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
                                isFullAccessPresetActive
                                  ? "border-slate-900 bg-slate-900 text-amber-400 shadow-xs"
                                  : "border-slate-200 bg-white text-slate-700 hover:bg-amber-50/70 hover:border-amber-300",
                                isLockedSelf && "opacity-60 cursor-not-allowed"
                              )}
                            >
                              <ShieldCheck className={cn("w-3.5 h-3.5 shrink-0", isFullAccessPresetActive ? "text-amber-400" : "text-amber-600")} />
                              <span>Full Access (All)</span>
                            </button>
                          )}
                        </div>
                      )}

                      <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
                        {groupedAccessModules.map(({ group, viewMod, fullMod }) => {
                          const extraSet = new Set<Permission>(form.extraPermissions || []);
                          const hasPerm = (p: Permission) => roleIncludedSet.has(p) || extraSet.has(p);

                          const fullInRole = fullMod ? fullMod.permissions.every((p) => roleIncludedSet.has(p)) : false;
                          const viewInRole = viewMod ? viewMod.permissions.every((p) => roleIncludedSet.has(p)) : false;
                          const fullyIncludedInRole = fullMod ? fullInRole : viewInRole;

                          const isFullActive = !!fullMod && fullMod.permissions.every(hasPerm);
                          const isViewActive = !!viewMod && !isFullActive && viewMod.permissions.every(hasPerm);
                          const currentLevel: "NONE" | "VIEW" | "FULL" = isFullActive
                            ? "FULL"
                            : isViewActive
                            ? "VIEW"
                            : "NONE";

                          const displayMod =
                            currentLevel === "FULL" && fullMod
                              ? fullMod
                              : currentLevel === "VIEW" && viewMod
                              ? viewMod
                              : viewMod || fullMod!;

                          const title = viewMod?.label || fullMod!.label;
                          const segments: { id: "NONE" | "VIEW" | "FULL"; label: string; disabled?: boolean }[] = [];
                          if (!viewInRole) {
                            segments.push({ id: "NONE", label: "None" });
                          }
                          if (viewMod) {
                            segments.push({
                              id: "VIEW",
                              label: viewInRole ? "In Role" : "View",
                            });
                          }
                          if (fullMod) {
                            segments.push({ id: "FULL", label: "Full" });
                          }

                          return (
                            <div
                              key={group}
                              className={cn(
                                "p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between transition-colors",
                                fullyIncludedInRole
                                  ? "bg-slate-50/70"
                                  : currentLevel === "FULL"
                                  ? "bg-amber-50/40"
                                  : currentLevel === "VIEW"
                                  ? "bg-sky-50/40"
                                  : "bg-white"
                              )}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-slate-900 truncate">{title}</span>
                                  {fullyIncludedInRole && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200 shrink-0 whitespace-nowrap">
                                      <Check className="w-3 h-3" /> In role
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                                  {displayMod.hint}
                                </p>
                              </div>

                              {!fullyIncludedInRole && (
                                <div
                                  role="group"
                                  aria-label={`${title} access level`}
                                  className={cn(
                                    "grid gap-0.5 p-0.5 rounded-lg bg-slate-100 border border-slate-200/80 shrink-0 w-full sm:w-auto",
                                    segments.length === 3 ? "grid-cols-3 sm:min-w-[168px]" : "grid-cols-2 sm:min-w-[120px]"
                                  )}
                                >
                                  {segments.map((seg) => {
                                    const active = currentLevel === seg.id;
                                    return (
                                      <button
                                        key={seg.id}
                                        type="button"
                                        disabled={isLockedSelf}
                                        onClick={() => setGroupAccessLevel(viewMod, fullMod, seg.id)}
                                        className={cn(
                                          "px-2.5 py-1.5 sm:py-1 rounded-md text-[11px] font-semibold text-center whitespace-nowrap transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
                                          active
                                            ? seg.id === "FULL"
                                              ? "bg-amber-500 text-slate-950 font-bold shadow-2xs"
                                              : seg.id === "VIEW"
                                              ? "bg-sky-600 text-white shadow-2xs"
                                              : "bg-white text-slate-800 shadow-2xs"
                                            : "text-slate-600 hover:text-slate-900",
                                          isLockedSelf && "opacity-60 cursor-not-allowed"
                                        )}
                                      >
                                        {seg.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
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

        {/* Modal: Update / Reset Password for User */}
        {passwordTarget && (
          <div className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl ring-1 ring-slate-200 overflow-hidden animate-scale-in">
              <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-display font-bold text-base text-slate-900">Update User Password</div>
                    <div className="text-xs text-slate-500">{passwordTarget.name} &bull; {passwordTarget.email}</div>
                  </div>
                </div>
                <button type="button" onClick={() => setPasswordTarget(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={submitPasswordUpdate} className="p-6 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-2">Select how to reset or update this password:</label>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => setPasswordMode("CUSTOM")}
                      className={cn(
                        "p-3 rounded-xl border text-xs font-semibold text-left transition",
                        passwordMode === "CUSTOM"
                          ? "border-amber-500 bg-amber-50/50 text-amber-900 ring-2 ring-amber-400/30"
                          : "border-slate-200 text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      <div className="font-bold flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-amber-600" />
                        Type Password
                      </div>
                      <div className="text-[10px] text-slate-500 font-normal mt-0.5">Enter or view visible password</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPasswordMode("GENERATE")}
                      className={cn(
                        "p-3 rounded-xl border text-xs font-semibold text-left transition",
                        passwordMode === "GENERATE"
                          ? "border-amber-500 bg-amber-50/50 text-amber-900 ring-2 ring-amber-400/30"
                          : "border-slate-200 text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      <div className="font-bold flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                        Auto-Generate
                      </div>
                      <div className="text-[10px] text-slate-500 font-normal mt-0.5">System random temporary pass</div>
                    </button>
                  </div>

                  {passwordMode === "CUSTOM" && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-700">New Password (visible to you) *</label>
                        <button
                          type="button"
                          onClick={handleGeneratePassword}
                          className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1 hover:underline cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3" /> Auto-suggest strong
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type={showPasswordText ? "text" : "password"}
                          required
                          minLength={6}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="e.g. Bothra@2026!"
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-mono pr-10 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswordText(!showPasswordText)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          title={showPasswordText ? "Hide password" : "Show password"}
                        >
                          {showPasswordText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">Minimum 6 characters. You can view, copy, and share this password immediately.</p>
                    </div>
                  )}

                  {passwordMode === "GENERATE" && (
                    <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-200/60 text-xs text-amber-900 space-y-1">
                      <div className="font-semibold flex items-center gap-1.5">
                        <KeyRound className="w-4 h-4 text-amber-600" />
                        A new secure password will be generated
                      </div>
                      <div className="text-[11px] text-slate-600">
                        The current password will stop working immediately. You will see the new password on screen to copy and send to the user.
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPasswordTarget(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-gradient-brand text-slate-950 font-bold text-xs rounded-xl shadow-glow hover:brightness-110 disabled:opacity-50 transition"
                  >
                    {saving ? "Updating..." : "Update Password"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Credentials Display / Reveal Card */}
        {credentials && (
          <div className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-3xl max-w-md w-full shadow-xl ring-1 ring-slate-200 max-h-[90dvh] overflow-y-auto animate-scale-in">
              <div className="bg-gradient-chrome text-white p-5">
                <div className="text-[11px] uppercase tracking-wider text-amber-300 font-semibold flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" /> {credentials.isNew ? "Login created" : "Password updated"}
                </div>
                <div className="font-display text-lg font-bold mt-1">{credentials.name}</div>
              </div>
              <div className="p-5 space-y-3">
                <Alert tone="warning">This password is shown only once. Copy it now and share it privately with the user.</Alert>
                <div className="rounded-xl bg-slate-50 p-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Email</span>
                    <span className="font-semibold text-slate-900 truncate">{credentials.email}</span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-slate-500">New Password</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-slate-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        {showCredentialPassword ? credentials.password : "••••••••••••"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowCredentialPassword(!showCredentialPassword)}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded"
                        title={showCredentialPassword ? "Hide password" : "View password"}
                      >
                        {showCredentialPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
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
        {pendingTeamAction && (
          <div
            className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
            onClick={() => setPendingTeamAction(null)}
          >
            <div
              className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto space-y-3 animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="font-bold text-slate-900 text-base">
                {pendingTeamAction.kind === "deactivate" ? "Deactivate Team Member?" : "Reset Password?"}
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {pendingTeamAction.kind === "deactivate" ? (
                  <>
                    Deactivate <strong className="text-slate-900">{pendingTeamAction.member.name}</strong>? They will be
                    signed out and cannot log in until reactivated.
                  </>
                ) : (
                  <>
                    Reset the password for <strong className="text-slate-900">{pendingTeamAction.member.name}</strong>?
                    Their current password will stop working.
                  </>
                )}
              </p>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPendingTeamAction(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={executePendingTeamAction}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg disabled:opacity-50"
                >
                  {saving ? "Processing..." : pendingTeamAction.kind === "deactivate" ? "Deactivate" : "Reset Password"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
