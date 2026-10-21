"use client";

import { Alert } from "@/components/ui/Alert";
import { useEffect, useState, useMemo } from "react";
import Shell from "@/components/layout/Shell";
import { useLanguage, LanguageCode } from "@/lib/i18n";
import { canUser } from "@/lib/permissions";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, ExcelColumn } from "@/components/ui/ExcelTable";
import {
  Building2,
  Users,
  Save,
  CheckCircle2,
  AlertCircle,
  Clock,
  Coins,
  ShieldCheck,
  MapPin,
  Phone,
  FileText,
  Globe,
  Languages,
  Check,
  Sparkles,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
} from "lucide-react";

interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  region: string;
  badge?: string;
  description: string;
  previewSample: string;
}

const SUPPORTED_LANGUAGES: LanguageOption[] = [
  {
    code: "en",
    name: "English",
    nativeName: "English",
    region: "Default Interface",
    badge: "Default",
    description: "Standard English interface for ERP modules, sites, ledgers and reports.",
    previewSample: "Welcome to Build Track Pro. Sites, daily work, materials, and accounts are in sync.",
  },
  {
    code: "hi",
    name: "Hindi",
    nativeName: "हिन्दी",
    region: "हिंदी इंटरफेस",
    badge: "लोकप्रिय / Popular",
    description: "दैनिक हाजिरी, कार्य प्रगति, सामग्री स्टॉक, वाउचर और सभी मेनू विकल्पों के लिए पूर्ण हिंदी इंटरफेस।",
    previewSample: "बिल्ड ट्रैक प्रो में आपका स्वागत है। साइट्स, दैनिक कार्य, सामग्री और खाते पूर्णतः सिंक हैं।",
  },
];

interface OrgData {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  status: string;
  settings: {
    taxId?: string;
    companyAddress?: string;
    phone?: string;
    workDayHours?: number;
    language?: string;
  };
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    lastLoginAt: string | null;
  }>;
  _count: {
    sites: number;
    projects: number;
    workforceMembers: number;
    materials: number;
    bills: number;
  };
}

export default function SettingsPage() {
  const { language, setLanguage, t } = useLanguage();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const canManageSettings = canUser(currentUser, "org:settings");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [langChangeAlert, setLangChangeAlert] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [taxId, setTaxId] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [workDayHours, setWorkDayHours] = useState(8);

  const [orgData, setOrgData] = useState<OrgData | null>(null);

  // Password change states
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdSuccessMsg, setPwdSuccessMsg] = useState("");
  const [pwdErrorMsg, setPwdErrorMsg] = useState("");

  useEffect(() => {
    fetchOrg();
  }, []);

  async function fetchOrg() {
    setLoading(true);
    try {
      const [res, meRes] = await Promise.all([
        fetch("/api/organization"),
        fetch("/api/auth/me").then((r) => r.json()).catch(() => ({})),
      ]);
      if (meRes.success && meRes.data) {
        setCurrentUser(meRes.data.user);
      }
      const json = await res.json();
      if (json.success) {
        const data: OrgData = json.data;
        setOrgData(data);
        setName(data.name);
        setCurrency(data.currency);
        setTimezone(data.timezone);
        setTaxId(data.settings?.taxId || "");
        setCompanyAddress(data.settings?.companyAddress || "");
        setPhone(data.settings?.phone || "");
        setWorkDayHours(data.settings?.workDayHours || 8);
        if (data.settings?.language) {
          const stored = typeof window !== "undefined" ? localStorage.getItem("buildtrack_language") : null;
          if (!stored) {
            setLanguage(data.settings.language as LanguageCode);
          }
        }
      } else {
        setErrorMsg(json.error?.message || "Failed to load organization settings");
      }
    } catch {
      setErrorMsg("Failed to connect to organization settings API");
    } finally {
      setLoading(false);
    }
  }

  function handleLanguageChange(langCode: string) {
    setLanguage(langCode as LanguageCode);
    const target = SUPPORTED_LANGUAGES.find((l) => l.code === langCode);
    setLangChangeAlert(
      `Display language changed to ${target?.name} (${target?.nativeName}). Entire website is now updated in ${target?.name}!`
    );
    setTimeout(() => {
      setLangChangeAlert(null);
    }, 6000);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg("");
    setErrorMsg("");

    try {
      const res = await fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          currency,
          timezone,
          settings: {
            taxId,
            companyAddress,
            phone,
            workDayHours: Number(workDayHours),
            language,
          },
        }),
      });

      const json = await res.json();
      if (json.success) {
        if (typeof window !== "undefined") {
          if (name) localStorage.setItem("bothra_org_name", name);
          if (language) {
            localStorage.setItem("buildtrack_language", language);
            document.cookie = `buildtrack_language=${language}; path=/; max-age=31536000; SameSite=Lax`;
          }
        }
        setSuccessMsg("Organization settings and language preference saved successfully.");
        fetchOrg();
      } else {
        setErrorMsg(json.error?.message || "Failed to update settings");
      }
    } catch {
      setErrorMsg("Network error saving organization settings");
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwdSaving(true);
    setPwdSuccessMsg("");
    setPwdErrorMsg("");

    if (newPassword.length < 8) {
      setPwdErrorMsg("New password must be at least 8 characters long.");
      setPwdSaving(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwdErrorMsg("New password and confirm password do not match.");
      setPwdSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setPwdSuccessMsg("Your password has been changed successfully.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setPwdErrorMsg(json.error?.message || "Failed to change password");
      }
    } catch {
      setPwdErrorMsg("Network error changing password. Please try again.");
    } finally {
      setPwdSaving(false);
    }
  }

  const usersList = useMemo(() => orgData?.users || [], [orgData]);

  const userColumns: ExcelColumn<any>[] = useMemo(
    () => [
      {
        key: "name",
        label: "Name",
        accessor: (u) => u.name,
        type: "text",
      },
      {
        key: "email",
        label: "Email",
        accessor: (u) => u.email,
        type: "text",
      },
      {
        key: "role",
        label: "Role",
        accessor: (u) => u.role,
        type: "text",
      },
      {
        key: "status",
        label: "Status",
        accessor: (u) => u.status,
        type: "text",
      },
      {
        key: "lastLoginAt",
        label: "Last Login",
        accessor: (u) =>
          u.lastLoginAt
            ? new Date(u.lastLoginAt).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : "Never",
        type: "text",
      },
    ],
    []
  );

  const excelUsers = useExcelTable({
    data: usersList,
    columns: userColumns,
  });

  return (
    <Shell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Building2 className="w-6 h-6 text-amber-600" /> {t("settings.title", "Organization Settings")}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t("settings.subtitle", "Manage organization profile, currency formatting, tax registration, and active users.")}
          </p>
        </div>

        {langChangeAlert && (
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-sm flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2.5">
              <Globe className="w-5 h-5 text-blue-600 shrink-0" />
              <span>{langChangeAlert}</span>
            </div>
            <button
              type="button"
              onClick={() => setLangChangeAlert(null)}
              className="text-xs font-bold text-blue-700 hover:text-blue-900 underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {successMsg && <Alert tone="success">{successMsg}</Alert>}

        {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

        {loading ? (
          <div className="h-96 bg-slate-100 rounded-2xl animate-pulse" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Settings Form */}
            <div className="lg:col-span-2 space-y-6">
              <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
                <h2 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3">
                  Company Details & Operational Configuration
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Organization Legal Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Default Currency *
                    </label>
                    <div className="relative">
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      >
                        <option value="INR">INR (₹ - Indian Rupee)</option>
                        <option value="USD">USD ($ - US Dollar)</option>
                        <option value="EUR">EUR (€ - Euro)</option>
                        <option value="GBP">GBP (£ - British Pound)</option>
                        <option value="AED">AED (AED - UAE Dirham)</option>
                      </select>
                      <Coins className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Operating Timezone *
                    </label>
                    <div className="relative">
                      <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      >
                        <option value="Asia/Kolkata">Asia/Kolkata (IST +05:30)</option>
                        <option value="Asia/Dubai">Asia/Dubai (GST +04:00)</option>
                        <option value="UTC">UTC (Universal Coordinated)</option>
                        <option value="America/New_York">America/New_York (EST/EDT)</option>
                        <option value="Europe/London">Europe/London (GMT/BST)</option>
                      </select>
                      <Clock className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      GSTIN / Tax ID Number
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="e.g. 07AAAAA0000A1Z5"
                        value={taxId}
                        onChange={(e) => setTaxId(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                      <FileText className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Company Contact Phone
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        placeholder="+91 11 2345 6789"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                      <Phone className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Standard Work Day Shift (Hours)
                    </label>
                    <input
                      type="number"
                      min={4}
                      max={16}
                      value={workDayHours}
                      onChange={(e) => setWorkDayHours(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Platform Display Language Section */}
                <div className="pt-4 border-t border-slate-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div>
                      <label className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                        <Languages className="w-4 h-4 text-amber-600" />
                        Platform Display Language / भाषा चुनें
                      </label>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Choose your preferred interface language for construction modules, reports, and daily site logs.
                      </p>
                    </div>
                    <span className="self-start sm:self-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                      Active: {SUPPORTED_LANGUAGES.find((l) => l.code === language)?.nativeName || language}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {SUPPORTED_LANGUAGES.map((lang) => {
                      const isSelected = language === lang.code;
                      return (
                        <button
                          key={lang.code}
                          type="button"
                          onClick={() => handleLanguageChange(lang.code)}
                          className={`relative p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                            isSelected
                              ? "bg-amber-50/70 border-amber-500 shadow-sm ring-2 ring-amber-500/20"
                              : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-start justify-between w-full">
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                                  isSelected ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {lang.code.toUpperCase()}
                              </span>
                              <div>
                                <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                                  <span>{lang.nativeName}</span>
                                  <span className="text-xs font-normal text-slate-500">({lang.name})</span>
                                </div>
                                <div className="text-[11px] text-slate-500">{lang.region}</div>
                              </div>
                            </div>
                            {isSelected ? (
                              <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">
                                <Check className="w-3.5 h-3.5" /> Selected
                              </span>
                            ) : lang.badge ? (
                              <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                                {lang.badge}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-slate-600 mt-2.5 line-clamp-2">
                            {lang.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {/* Live Localized Sample Preview */}
                  {(() => {
                    const activeObj = SUPPORTED_LANGUAGES.find((l) => l.code === language);
                    return activeObj ? (
                      <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 flex items-start gap-2.5">
                        <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-slate-900">
                            Preview ({activeObj.name} - {activeObj.nativeName}):{" "}
                          </span>
                          <span className="italic text-slate-600">&ldquo;{activeObj.previewSample}&rdquo;</span>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Corporate Headquarters / Billing Address
                  </label>
                  <div className="relative">
                    <textarea
                      rows={2}
                      placeholder="Street address, city, state, postal code"
                      value={companyAddress}
                      onChange={(e) => setCompanyAddress(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                    <MapPin className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                  </div>
                </div>

                {canManageSettings && (
                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold shadow-md shadow-amber-600/20 transition disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {saving ? t("action.saving", "Saving Changes...") : t("action.save", "Save Settings")}
                    </button>
                  </div>
                )}
              </form>

              {/* Account Security & Password Change Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-800">
                        {t("settings.securityTitle", "Account Security & Change Password")}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {t("settings.securitySubtitle", "Update your password regularly to protect your account and data.")}
                      </p>
                    </div>
                  </div>
                  {currentUser?.email && (
                    <span className="self-start sm:self-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                      {currentUser.email}
                    </span>
                  )}
                </div>

                {pwdSuccessMsg && <Alert tone="success">{pwdSuccessMsg}</Alert>}

                {pwdErrorMsg && <Alert tone="error">{pwdErrorMsg}</Alert>}

                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Current Password */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                        Current Password *
                      </label>
                      <div className="relative">
                        <input
                          type={showCurrentPassword ? "text" : "password"}
                          required
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="Current password"
                          className="w-full pl-3 pr-10 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition"
                          title={showCurrentPassword ? "Hide password" : "Show password"}
                        >
                          {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* New Password */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                        New Password *
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? "text" : "password"}
                          required
                          minLength={8}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="At least 8 characters"
                          className="w-full pl-3 pr-10 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition"
                          title={showNewPassword ? "Hide password" : "Show password"}
                        >
                          {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <span className="text-[11px] text-slate-400 mt-1 block">Min. 8 characters</span>
                    </div>

                    {/* Confirm New Password */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                        Confirm New Password *
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter new password"
                          className={`w-full pl-3 pr-10 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none ${
                            confirmPassword && newPassword !== confirmPassword
                              ? "border-rose-300 bg-rose-50/30"
                              : "border-slate-200"
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition"
                          title={showConfirmPassword ? "Hide password" : "Show password"}
                        >
                          {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {confirmPassword && newPassword !== confirmPassword ? (
                        <span className="text-[11px] text-rose-500 font-medium mt-1 block">Passwords do not match</span>
                      ) : confirmPassword && newPassword === confirmPassword ? (
                        <span className="text-[11px] text-emerald-600 font-medium mt-1 block">Passwords match</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={pwdSaving || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword || newPassword.length < 8}
                      className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold shadow-md shadow-amber-600/20 transition disabled:opacity-50"
                    >
                      <KeyRound className="w-4 h-4" />
                      {pwdSaving ? t("action.saving", "Updating Password...") : t("action.changePassword", "Change Password")}
                    </button>
                  </div>
                </form>
              </div>

              {/* Team Members Table */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-slate-700" />
                    <h2 className="text-base font-bold text-slate-900">Organization Members</h2>
                  </div>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-semibold">
                    {orgData?.users.length || 0} active users
                  </span>
                </div>
                <ExcelTableToolbar
                  table={excelUsers}
                  columns={userColumns}
                  tableName="members"
                  showSearch={true}
                  showExport={true}
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-700 text-xs uppercase font-semibold border-b border-slate-200">
                      <tr>
                        {userColumns.map((col) => (
                          <ExcelColumnHeader
                            key={col.key}
                            column={col}
                            table={excelUsers}
                            theme="lightHeader"
                          />
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {excelUsers.filteredData.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4 font-bold text-slate-900">{u.name}</td>
                          <td className="py-3 px-4 text-slate-600 font-mono text-xs">{u.email}</td>
                          <td className="py-3 px-4">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`text-xs px-2 py-0.5 rounded font-bold ${
                                u.status === "ACTIVE"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {u.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-500">
                            {u.lastLoginAt
                              ? new Date(u.lastLoginAt).toLocaleString("en-IN", {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })
                              : "Never"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column: Platform Metadata & Security Summary */}
            <div className="space-y-6">
              {/* Quick Language Switcher Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-amber-600" />
                    <h3 className="text-sm font-bold text-slate-900">Language Switcher</h3>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    1-Click
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Switch platform display language instantly:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {SUPPORTED_LANGUAGES.map((lang) => {
                    const isSelected = language === lang.code;
                    return (
                      <button
                        key={`quick-${lang.code}`}
                        type="button"
                        onClick={() => handleLanguageChange(lang.code)}
                        className={`p-2.5 rounded-xl text-xs font-bold border transition flex items-center justify-between ${
                          isSelected
                            ? "bg-amber-600 text-white border-amber-600 shadow-sm shadow-amber-600/30"
                            : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex flex-col text-left truncate">
                          <span className="font-bold text-sm leading-tight">{lang.nativeName}</span>
                          <span className={`text-[10px] ${isSelected ? "text-amber-100" : "text-slate-500"}`}>
                            {lang.name}
                          </span>
                        </div>
                        {isSelected && <Check className="w-4 h-4 shrink-0 text-white" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md space-y-4">
                <div className="flex items-center gap-2 text-amber-400">
                  <ShieldCheck className="w-5 h-5" />
                  <span className="text-xs uppercase tracking-wider font-bold">Tenant Isolation</span>
                </div>
                <h3 className="text-lg font-black">{orgData?.name}</h3>
                <div className="text-xs text-slate-400 font-mono break-all">ID: {orgData?.id}</div>

                <div className="grid grid-cols-2 gap-3 pt-2 text-xs border-t border-slate-800">
                  <div className="bg-slate-800/80 p-3 rounded-xl">
                    <div className="text-slate-400">Total Sites</div>
                    <div className="text-lg font-black text-amber-400 mt-0.5">
                      {orgData?._count.sites || 0}
                    </div>
                  </div>
                  <div className="bg-slate-800/80 p-3 rounded-xl">
                    <div className="text-slate-400">Projects</div>
                    <div className="text-lg font-black text-emerald-400 mt-0.5">
                      {orgData?._count.projects || 0}
                    </div>
                  </div>
                  <div className="bg-slate-800/80 p-3 rounded-xl">
                    <div className="text-slate-400">Workforce</div>
                    <div className="text-lg font-black text-blue-400 mt-0.5">
                      {orgData?._count.workforceMembers || 0}
                    </div>
                  </div>
                  <div className="bg-slate-800/80 p-3 rounded-xl">
                    <div className="text-slate-400">Materials</div>
                    <div className="text-lg font-black text-purple-400 mt-0.5">
                      {orgData?._count.materials || 0}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
