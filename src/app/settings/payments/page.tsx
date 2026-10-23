"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { api, patch, post, rupees } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { ArrowLeft, CheckCircle2, Circle, CreditCard, FlaskConical, Loader2, Save, PlugZap } from "lucide-react";

interface Settings {
  enabled: boolean;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  hasKeySecret: boolean;
  hasWebhookSecret: boolean;
  testKeys: boolean;
  ready: boolean;
}

interface Row {
  id: string;
  createdAt: string;
  paidAt: string | null;
  amount: number;
  status: string;
  method: string | null;
  paymentId: string | null;
  note: string | null;
  buyer: string;
  bookingNumber: string;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  CREATED: { label: "Started", cls: "bg-slate-50 text-slate-600 ring-slate-200" },
  PAID: { label: "Paid", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  NOT_BOOKED: { label: "Paid, not booked", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
  EXPIRED: { label: "Expired", cls: "bg-slate-50 text-slate-500 ring-slate-200" },
};

const input = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20";

function Ready({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1", ok ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-50 text-slate-500 ring-slate-200")}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />} {label}
    </span>
  );
}

export default function PaymentsSettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [log, setLog] = useState<Row[]>([]);
  const [keySecret, setKeySecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [origin, setOrigin] = useState("");

  const load = async () => {
    const d = await api<{ settings: Settings; log: Row[] }>("/api/organization/payments");
    setS(d.settings);
    setLog(d.log);
  };
  useEffect(() => {
    setOrigin(window.location.origin);
    load().catch((e) => setMsg({ tone: "error", text: e.message }));
  }, []);

  const save = async () => {
    if (!s) return;
    setBusy("save");
    setMsg(null);
    try {
      const body: Record<string, unknown> = { enabled: s.enabled, keyId: s.keyId.trim() };
      if (keySecret) body.keySecret = keySecret;
      if (webhookSecret) body.webhookSecret = webhookSecret;
      const d = await api<{ settings: Settings }>("/api/organization/payments", patch(body));
      setS(d.settings);
      setKeySecret("");
      setWebhookSecret("");
      setMsg({ tone: "success", text: "Saved." });
    } catch (e: any) {
      setMsg({ tone: "error", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const check = async () => {
    setBusy("check");
    setMsg(null);
    try {
      await api("/api/organization/payments", post({}));
      setMsg({ tone: "success", text: "Razorpay accepted the keys." });
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
        <PageHeader icon={CreditCard} title="Online payments" subtitle="Buyers pay their instalments from their page by UPI, card or net banking, through Razorpay.">
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
              <Ready ok={!!s.keyId && s.hasKeySecret} label="Razorpay keys saved" />
              <Ready ok={s.hasWebhookSecret} label="Webhook secret saved" />
              <Ready ok={s.ready} label="Pay now shown to buyers" />
              {s.testKeys && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-200">
                  <FlaskConical className="h-3.5 w-3.5" /> Test keys: no real money moves
                </span>
              )}
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-bold text-slate-900">Razorpay</h2>
                <button
                  type="button"
                  onClick={() => setS({ ...s, enabled: !s.enabled })}
                  className="flex w-full items-start gap-3 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                  aria-pressed={s.enabled}
                >
                  <span className={cn("mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition", s.enabled ? "bg-amber-600" : "bg-slate-300")}>
                    <span className={cn("h-4 w-4 rounded-full bg-white shadow transition", s.enabled && "translate-x-4")} />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-slate-900">Show &quot;Pay now&quot; on the buyer&apos;s page</span>
                    <span className="block text-xs text-slate-500">
                      Next to each instalment that is due. When the payment goes through, the receipt is entered by itself and the buyer sees it straight away.
                    </span>
                  </span>
                </button>
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">Key ID</span>
                  <input className={cn(input, "mt-1 font-mono")} placeholder="rzp_live_…" value={s.keyId} onChange={(e) => setS({ ...s, keyId: e.target.value.trim() })} />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">Key secret</span>
                  <input
                    type="password"
                    autoComplete="off"
                    className={cn(input, "mt-1 font-mono")}
                    placeholder={s.hasKeySecret ? `Saved (${s.keySecret}). Type to replace.` : "From Razorpay → Account & Settings → API keys"}
                    value={keySecret}
                    onChange={(e) => setKeySecret(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">Webhook secret</span>
                  <input
                    type="password"
                    autoComplete="off"
                    className={cn(input, "mt-1 font-mono")}
                    placeholder={s.hasWebhookSecret ? `Saved (${s.webhookSecret}). Type to replace.` : "The secret you type when adding the webhook"}
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                  />
                </label>
                <button
                  onClick={check}
                  disabled={busy !== null || !s.hasKeySecret}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {busy === "check" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} Check the keys
                </button>
              </section>

              <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm">
                <h2 className="text-sm font-bold text-slate-900">Setting it up</h2>
                <ol className="list-decimal space-y-2 pl-5">
                  <li>Open a Razorpay account (business KYC and the bank account money is paid into).</li>
                  <li>
                    In Razorpay, go to Account &amp; Settings → API keys and make a key. Put the key ID and secret here. Start with the <b>test</b> keys to try it with
                    Razorpay&apos;s test cards and UPI; switch to the live keys when it works.
                  </li>
                  <li>
                    Add a webhook in Account &amp; Settings → Webhooks with this address, tick the event <b>payment_link.paid</b>, type a secret and put the same secret here:
                    <code className="mt-1 block break-all rounded-lg bg-slate-50 px-2 py-1.5 font-mono text-xs ring-1 ring-slate-200">{origin}/api/portal/pay/webhook</code>
                    The webhook books the payment even if the buyer closes the page before coming back.
                  </li>
                  <li>Switch on &quot;Pay now&quot; and save. Open a buyer&apos;s page to see the button.</li>
                </ol>
                <p className="text-xs text-slate-500">
                  Receipts are entered as &quot;Online&quot; with the Razorpay payment ID as the reference. Razorpay keeps its fee and pays the rest into the bank a day or two later; enter the
                  fee as a bank charge in Finance.
                </p>
              </section>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-bold text-slate-900">Recent online payments</h2>
              {log.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-slate-500">No online payments yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2 text-left">When</th>
                        <th className="px-4 py-2 text-left">Buyer</th>
                        <th className="px-4 py-2 text-right">Amount</th>
                        <th className="px-4 py-2 text-left">Status</th>
                        <th className="px-4 py-2 text-left">Razorpay</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {log.map((r) => (
                        <tr key={r.id}>
                          <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{new Date(r.paidAt || r.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                          <td className="px-4 py-2.5">
                            <div className="font-semibold text-slate-800">{r.buyer}</div>
                            <div className="text-xs text-slate-500">{r.bookingNumber}</div>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{rupees(r.amount)}</td>
                          <td className="px-4 py-2.5">
                            <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", STATUS[r.status]?.cls)}>{STATUS[r.status]?.label || r.status}</span>
                            {r.note && <div className="mt-1 text-xs text-rose-600">{r.note}</div>}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                            {r.paymentId || "—"}
                            {r.method ? ` · ${r.method}` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </Shell>
  );
}
