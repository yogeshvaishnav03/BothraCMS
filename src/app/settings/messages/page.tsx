"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { api, patch, post } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { ArrowLeft, CheckCircle2, Circle, Loader2, MessageCircle, Save, Send, Smartphone, FlaskConical } from "lucide-react";

interface Settings {
  testMode: boolean;
  waPhoneNumberId: string;
  waToken: string;
  waLanguage: string;
  waOtpTemplate: string;
  waDemandTemplate: string;
  waReminderTemplate: string;
  smsAuthKey: string;
  smsOtpTemplateId: string;
  autoDemands: boolean;
  remindBeforeDays: number;
  remindEveryDays: number;
  maxOverdueReminders: number;
  buyerSignIn: boolean;
  siteUrl: string;
  hasWaToken: boolean;
  hasSmsAuthKey: boolean;
  can: { whatsapp: boolean; sms: boolean; otp: boolean; demands: boolean };
}

interface LogRow {
  id: string;
  channel: string;
  provider: string;
  kind: string;
  to: string;
  text: string;
  status: string;
  error: string | null;
  createdAt: string;
}

const KIND: Record<string, string> = { OTP: "Sign-in code", DEMAND: "Demand", DUE_SOON: "Due soon", OVERDUE: "Overdue", TEST: "Test" };
const STATUS: Record<string, string> = {
  SENT: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  TEST: "bg-sky-50 text-sky-700 ring-sky-200",
  FAILED: "bg-rose-50 text-rose-700 ring-rose-200",
};

const input = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20";

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function Toggle({ on, onChange, title, text }: { on: boolean; onChange: (v: boolean) => void; title: string; text: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex w-full items-start gap-3 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50" aria-pressed={on}>
      <span className={cn("mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition", on ? "bg-amber-600" : "bg-slate-300")}>
        <span className={cn("h-4 w-4 rounded-full bg-white shadow transition", on && "translate-x-4")} />
      </span>
      <span>
        <span className="block text-sm font-bold text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500">{text}</span>
      </span>
    </button>
  );
}

function Ready({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1", ok ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-50 text-slate-500 ring-slate-200")}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />} {label}
    </span>
  );
}

export default function MessagesSettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [cronReady, setCronReady] = useState(false);
  const [waToken, setWaToken] = useState("");
  const [smsKey, setSmsKey] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  const load = async () => {
    const d = await api<{ settings: Settings; log: LogRow[]; cronReady: boolean }>("/api/organization/messaging");
    setS(d.settings);
    setLog(d.log);
    setCronReady(d.cronReady);
  };
  useEffect(() => {
    load().catch((e) => setMsg({ tone: "error", text: e.message }));
  }, []);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => (p ? { ...p, [k]: v } : p));

  const save = async () => {
    if (!s) return;
    setBusy("save");
    setMsg(null);
    try {
      const { hasWaToken, hasSmsAuthKey, can, waToken: _w, smsAuthKey: _k, ...rest } = s;
      const body: Record<string, unknown> = { ...rest };
      if (waToken) body.waToken = waToken;
      if (smsKey) body.smsAuthKey = smsKey;
      const d = await api<{ settings: Settings }>("/api/organization/messaging", patch(body));
      setS(d.settings);
      setWaToken("");
      setSmsKey("");
      setMsg({ tone: "success", text: "Saved." });
    } catch (e: any) {
      setMsg({ tone: "error", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    setMsg(null);
    try {
      const r = await api<{ status: string; error?: string }>("/api/organization/messaging/test", post({ phone: testPhone }));
      setMsg(
        r.status === "FAILED"
          ? { tone: "error", text: `Not sent: ${r.error}` }
          : r.status === "TEST"
            ? { tone: "info", text: "Test mode is on, so the message was only written in the log below." }
            : { tone: "success", text: "Sent. It should arrive on WhatsApp in a few seconds." }
      );
      await load();
    } catch (e: any) {
      setMsg({ tone: "error", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const runNow = async () => {
    setBusy("run");
    setMsg(null);
    try {
      const r = await api<{ sent: number; failed: number; off: boolean }>("/api/organization/messaging/run", post({}));
      setMsg(
        r.off
          ? { tone: "info", text: "Automatic demands are off. Switch them on and save first." }
          : { tone: r.failed ? "error" : "success", text: `${r.sent} sent${r.failed ? `, ${r.failed} could not be sent (see the log)` : ""}. Nothing else is due today.` }
      );
      await load();
    } catch (e: any) {
      setMsg({ tone: "error", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Shell>
      <div className="space-y-5">
        <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Settings
        </Link>
        <PageHeader icon={MessageCircle} title="Messages" subtitle="WhatsApp demand letters and reminders sent by themselves, and sign-in codes for buyers.">
          <button
            onClick={save}
            disabled={!s || busy !== null}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
          >
            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </button>
        </PageHeader>

        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

        {!s ? (
          <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Ready ok={s.can.whatsapp} label="WhatsApp connected" />
              <Ready ok={s.can.sms} label="SMS connected" />
              <Ready ok={s.autoDemands && s.can.demands} label="Automatic demands on" />
              <Ready ok={s.buyerSignIn} label="Buyer sign-in on" />
              <Ready ok={cronReady} label="Daily run scheduled" />
              {s.testMode && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-200">
                  <FlaskConical className="h-3.5 w-3.5" /> Test mode: nothing is really sent
                </span>
              )}
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-bold text-slate-900">What to send</h2>
                <Toggle
                  on={s.autoDemands}
                  onChange={(v) => set("autoDemands", v)}
                  title="Send demand letters on WhatsApp by themselves"
                  text="When a stage is done and a demand is raised, the buyer gets it on WhatsApp with a link to their page. Then reminders, as set below."
                />
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Remind before due" hint="days (0 = no)">
                    <input type="number" min={0} max={15} className={input} value={s.remindBeforeDays} onChange={(e) => set("remindBeforeDays", Number(e.target.value))} />
                  </Field>
                  <Field label="When overdue, every" hint="days">
                    <input type="number" min={1} max={30} className={input} value={s.remindEveryDays} onChange={(e) => set("remindEveryDays", Number(e.target.value))} />
                  </Field>
                  <Field label="At most" hint="overdue reminders">
                    <input type="number" min={0} max={10} className={input} value={s.maxOverdueReminders} onChange={(e) => set("maxOverdueReminders", Number(e.target.value))} />
                  </Field>
                </div>
                <Toggle
                  on={s.buyerSignIn}
                  onChange={(v) => set("buyerSignIn", v)}
                  title="Buyers sign in with a code on their mobile"
                  text="The buyer's page asks for a 6-digit code sent to the mobile number on their booking, so a forwarded link alone does not open it."
                />
                <Toggle
                  on={s.testMode}
                  onChange={(v) => set("testMode", v)}
                  title="Test mode"
                  text="Messages and sign-in codes are written in the log below instead of being sent. Use it to try everything before WhatsApp is set up."
                />
                <Field label="Web address of this app" hint="Goes in messages as the buyer's link. Filled in by itself when you save.">
                  <input className={input} value={s.siteUrl} onChange={(e) => set("siteUrl", e.target.value)} placeholder="https://cms.bothra.in" />
                </Field>
                <button
                  onClick={runNow}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {busy === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send today&apos;s messages now
                </button>
                {!cronReady && <p className="text-xs text-slate-500">Reminders also go out once a day by themselves once the server has a CRON_SECRET (see IMPLEMENTATION.md). Until then, use the button above.</p>}
              </section>

              <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">WhatsApp Business</h2>
                  <p className="mt-0.5 text-xs text-slate-500">From Meta&apos;s WhatsApp Manager: the phone number ID and a permanent access token. Templates must be approved by Meta.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Phone number ID">
                    <input className={input} inputMode="numeric" value={s.waPhoneNumberId} onChange={(e) => set("waPhoneNumberId", e.target.value.trim())} placeholder="1098765432101" />
                  </Field>
                  <Field label="Access token" hint={s.hasWaToken ? `Saved (${s.waToken}). Type a new one to replace it.` : undefined}>
                    <input className={input} type="password" autoComplete="off" value={waToken} onChange={(e) => setWaToken(e.target.value)} placeholder={s.hasWaToken ? "Keep the saved token" : "EAAG..."} />
                  </Field>
                  <Field label="Sign-in code template" hint="Authentication template with the code as {{1}}">
                    <input className={input} value={s.waOtpTemplate} onChange={(e) => set("waOtpTemplate", e.target.value)} placeholder="buyer_sign_in" />
                  </Field>
                  <Field label="Template language">
                    <input className={input} value={s.waLanguage} onChange={(e) => set("waLanguage", e.target.value)} placeholder="en" />
                  </Field>
                  <Field label="Demand template">
                    <input className={input} value={s.waDemandTemplate} onChange={(e) => set("waDemandTemplate", e.target.value)} placeholder="payment_demand" />
                  </Field>
                  <Field label="Reminder template" hint="Leave empty to use the demand template">
                    <input className={input} value={s.waReminderTemplate} onChange={(e) => set("waReminderTemplate", e.target.value)} placeholder="payment_reminder" />
                  </Field>
                </div>
                <details className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  <summary className="cursor-pointer font-semibold text-slate-700">Template text to submit to Meta</summary>
                  <p className="mt-2">Demand (Utility):</p>
                  <p className="mt-1 rounded-lg bg-white p-2 font-mono ring-1 ring-slate-200">
                    Dear {"{{1}}"}, the {"{{3}}"} instalment for {"{{2}}"} is now due: {"{{4}}"} by {"{{5}}"}. Your payment schedule and receipts: {"{{6}}"}
                  </p>
                  <p className="mt-2">Reminder (Utility):</p>
                  <p className="mt-1 rounded-lg bg-white p-2 font-mono ring-1 ring-slate-200">
                    Dear {"{{1}}"}, a reminder about {"{{4}}"} for the {"{{3}}"} instalment of {"{{2}}"}, due on {"{{5}}"}. Details: {"{{6}}"}
                  </p>
                  <p className="mt-2">Sign-in code: an Authentication template with a &quot;Copy code&quot; button.</p>
                </details>
                <div className="flex gap-2">
                  <input className={input} inputMode="tel" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="Your mobile, for a test" />
                  <button
                    onClick={test}
                    disabled={busy !== null || testPhone.replace(/\D/g, "").length < 10}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send test
                  </button>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                    <Smartphone className="h-4 w-4 text-slate-400" /> SMS for sign-in codes (MSG91)
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">Only needed if sign-in codes should go by SMS. Use a DLT-approved OTP template with ##otp##.</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Auth key" hint={s.hasSmsAuthKey ? `Saved (${s.smsAuthKey}).` : undefined}>
                      <input className={input} type="password" autoComplete="off" value={smsKey} onChange={(e) => setSmsKey(e.target.value)} placeholder={s.hasSmsAuthKey ? "Keep the saved key" : ""} />
                    </Field>
                    <Field label="OTP template ID">
                      <input className={input} value={s.smsOtpTemplateId} onChange={(e) => set("smsOtpTemplateId", e.target.value)} />
                    </Field>
                  </div>
                </div>
              </section>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-bold text-slate-900">Sent messages</h2>
              {log.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">Nothing sent yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {log.map((m) => (
                    <li key={m.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-start sm:gap-4">
                      <div className="w-40 shrink-0 text-xs text-slate-500">
                        {new Date(m.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                        <div className="font-semibold text-slate-700">
                          {KIND[m.kind] || m.kind} · {m.channel === "SMS" ? "SMS" : "WhatsApp"}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-mono text-slate-500">+{m.to}</div>
                        <div className="text-sm text-slate-800">{m.text}</div>
                        {m.error && <div className="mt-0.5 text-xs text-rose-600">{m.error}</div>}
                      </div>
                      <span className={cn("self-start rounded-full px-2 py-0.5 text-xs font-semibold ring-1", STATUS[m.status])}>{m.status === "TEST" ? "Test, not sent" : m.status === "SENT" ? "Sent" : "Failed"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </Shell>
  );
}
