"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { api, post } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { ArrowLeft, Check, CheckCheck, Clock, ExternalLink, FileText, Inbox, Loader2, MessageCircle, Send, Settings, Users, X } from "lucide-react";

interface Conversation {
  waId: string;
  kind: "VENDOR" | "BUYER" | "STAFF" | "UNKNOWN";
  name: string;
  href?: string;
  unread: number;
  windowOpen: boolean;
  last: { text: string; direction: string; kind: string; at: string; status: string };
}

interface Message {
  id: string;
  direction: "IN" | "OUT";
  kind: string;
  text: string;
  fileId: string | null;
  mimeType: string | null;
  fileName: string | null;
  status: string;
  error: string | null;
  purchaseOrderId: string | null;
  createdAt: string;
}

interface Thread {
  with: { waId: string; kind: Conversation["kind"]; name: string; href?: string; groupLink: string | null };
  messages: Message[];
  windowOpen: boolean;
  windowEndsAt: string | null;
}

const KIND_LABEL: Record<Conversation["kind"], string> = { VENDOR: "Vendor", BUYER: "Buyer", STAFF: "Staff", UNKNOWN: "Not in the app" };
const KIND_PILL: Record<Conversation["kind"], string> = {
  VENDOR: "bg-amber-50 text-amber-700 ring-amber-200",
  BUYER: "bg-sky-50 text-sky-700 ring-sky-200",
  STAFF: "bg-violet-50 text-violet-700 ring-violet-200",
  UNKNOWN: "bg-slate-100 text-slate-600 ring-slate-200",
};

const time = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return d.toLocaleString("en-IN", today ? { hour: "numeric", minute: "2-digit" } : { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};

function Tick({ m }: { m: Message }) {
  if (m.direction === "IN") return null;
  if (m.status === "FAILED") return <X className="h-3.5 w-3.5 text-rose-500" />;
  if (m.status === "READ") return <CheckCheck className="h-3.5 w-3.5 text-sky-500" />;
  if (m.status === "DELIVERED") return <CheckCheck className="h-3.5 w-3.5 text-slate-400" />;
  if (m.status === "TEST") return <span className="text-[10px] font-bold text-sky-600">TEST</span>;
  return <Check className="h-3.5 w-3.5 text-slate-400" />;
}

export default function WhatsAppInboxPage() {
  const [list, setList] = useState<Conversation[] | null>(null);
  const [meta, setMeta] = useState({ inboxReady: false, testMode: false });
  const [active, setActive] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "info" | "success"; text: string } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    const d = await api<{ conversations: Conversation[]; inboxReady: boolean; testMode: boolean }>("/api/whatsapp/conversations");
    setList(d.conversations);
    setMeta({ inboxReady: d.inboxReady, testMode: d.testMode });
  }, []);

  const loadThread = useCallback(async (waId: string) => {
    const d = await api<Thread>(`/api/whatsapp/messages?with=${encodeURIComponent(waId)}`);
    setThread(d);
  }, []);

  useEffect(() => {
    const w = new URLSearchParams(window.location.search).get("with");
    if (w) setActive(w.replace(/\D/g, ""));
    loadList().catch((e) => setMsg({ tone: "error", text: e.message }));
  }, [loadList]);

  useEffect(() => {
    if (!active) return;
    setThread(null);
    loadThread(active)
      .then(() => loadList())
      .catch((e) => setMsg({ tone: "error", text: e.message }));
  }, [active, loadThread, loadList]);

  // New replies every 15 seconds while the page is open.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.hidden) return;
      loadList().catch(() => {});
      if (active) loadThread(active).catch(() => {});
    }, 15_000);
    return () => clearInterval(t);
  }, [active, loadList, loadThread]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [thread?.messages.length]);

  const open = (waId: string) => {
    setActive(waId);
    window.history.replaceState(null, "", `/whatsapp?with=${waId}`);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active || !draft.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ message: Message }>("/api/whatsapp/messages", post({ to: active, text: draft }));
      if (r.message.status === "FAILED") setMsg({ tone: "error", text: `Not sent: ${r.message.error}` });
      setDraft("");
      await loadThread(active);
      await loadList();
    } catch (e: any) {
      setMsg({ tone: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const unreadTotal = (list || []).reduce((s, c) => s + c.unread, 0);

  return (
    <Shell>
      <div className="space-y-4">
        <PageHeader icon={MessageCircle} title="WhatsApp inbox" subtitle="Chats with vendors, buyers and staff on the business number. Their replies come in here.">
          <Link href="/settings/messages" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Settings className="h-4 w-4" /> Set-up
          </Link>
        </PageHeader>

        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        {list && !meta.inboxReady && (
          <Alert tone="info">
            Replies are not coming in yet. Add the webhook in Meta&apos;s app dashboard and the app secret on the{" "}
            <Link href="/settings/messages" className="font-semibold underline">
              Messages
            </Link>{" "}
            page. Messages sent from here still go out.
          </Alert>
        )}

        <div className="grid min-h-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid-cols-[320px_1fr]">
          {/* Chats */}
          <aside className={cn("border-slate-100 md:border-r", active ? "hidden md:block" : "block")}>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Inbox className="h-4 w-4 text-slate-400" /> Chats
              </h2>
              {unreadTotal > 0 && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">{unreadTotal} new</span>}
            </div>
            {!list ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : list.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">No chats yet. Send an order to a vendor from their page, or wait for a reply.</p>
            ) : (
              <ul className="max-h-[640px] divide-y divide-slate-100 overflow-y-auto">
                {list.map((c) => (
                  <li key={c.waId}>
                    <button onClick={() => open(c.waId)} className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50", active === c.waId && "bg-amber-50/60")}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={cn("truncate text-sm", c.unread ? "font-bold text-slate-900" : "font-semibold text-slate-800")}>{c.name}</span>
                          <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ring-1", KIND_PILL[c.kind])}>{KIND_LABEL[c.kind]}</span>
                        </div>
                        <p className={cn("mt-0.5 truncate text-xs", c.unread ? "font-semibold text-slate-700" : "text-slate-500")}>
                          {c.last.direction === "OUT" && "You: "}
                          {c.last.text || c.last.kind.toLowerCase()}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-[11px] text-slate-400">{time(c.last.at)}</span>
                        {c.unread > 0 && <span className="rounded-full bg-emerald-600 px-1.5 text-[11px] font-bold text-white">{c.unread}</span>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          {/* One chat */}
          <section className={cn("flex min-h-[560px] flex-col", active ? "flex" : "hidden md:flex")}>
            {!active ? (
              <div className="m-auto max-w-xs text-center text-sm text-slate-500">
                <MessageCircle className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                Pick a chat on the left.
              </div>
            ) : !thread ? (
              <div className="m-auto">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <>
                <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
                  <button onClick={() => setActive(null)} className="md:hidden" aria-label="Back to chats">
                    <ArrowLeft className="h-5 w-5 text-slate-500" />
                  </button>
                  <div className="min-w-[10rem] flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <h2 className="truncate text-[15px] font-bold text-slate-900">{thread.with.name}</h2>
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold ring-1", KIND_PILL[thread.with.kind])}>{KIND_LABEL[thread.with.kind]}</span>
                    </div>
                    <p className="font-mono text-xs text-slate-500">+{thread.with.waId}</p>
                  </div>
                  <div className="flex gap-2">
                    {thread.with.groupLink && (
                      <a href={thread.with.groupLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100">
                        <Users className="h-3.5 w-3.5" /> Their group <ExternalLink className="h-3 w-3 opacity-60" />
                      </a>
                    )}
                    {thread.with.href && (
                      <Link href={thread.with.href} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        Open {KIND_LABEL[thread.with.kind].toLowerCase()} page
                      </Link>
                    )}
                  </div>
                </header>

                <div className="flex-1 space-y-2 overflow-y-auto bg-[#efeae2] px-3 py-4 md:px-6" style={{ maxHeight: 520 }}>
                  {thread.messages.map((m) => (
                    <div key={m.id} className={cn("flex", m.direction === "OUT" ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[85%] rounded-xl px-3 py-2 text-sm shadow-sm md:max-w-[70%]", m.direction === "OUT" ? "bg-[#d9fdd3] text-slate-900" : "bg-white text-slate-900")}>
                        {m.kind === "TEMPLATE" && <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Order template</div>}
                        {m.fileId && m.mimeType?.startsWith("image/") && (
                          <a href={`/api/uploads/${m.fileId}`} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/api/uploads/${m.fileId}`} alt={m.fileName || "Photo"} className="mb-1 max-h-64 rounded-lg" />
                          </a>
                        )}
                        {m.fileId && !m.mimeType?.startsWith("image/") && (
                          <a href={`/api/uploads/${m.fileId}`} target="_blank" rel="noopener noreferrer" className="mb-1 flex items-center gap-2 rounded-lg bg-black/5 px-2 py-1.5 text-xs font-semibold">
                            <FileText className="h-4 w-4" /> {m.fileName || "File"}
                          </a>
                        )}
                        {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                          {m.purchaseOrderId && <span className="mr-auto font-semibold text-amber-700">About an order</span>}
                          {time(m.createdAt)} <Tick m={m} />
                        </div>
                        {m.status === "FAILED" && m.error && <p className="mt-0.5 text-[11px] text-rose-600">{m.error}</p>}
                      </div>
                    </div>
                  ))}
                  <div ref={bottom} />
                </div>

                <form onSubmit={send} className="border-t border-slate-100 p-3">
                  {!thread.windowOpen && !meta.testMode ? (
                    <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                      It is more than 24 hours since their last message, so WhatsApp allows only an approved template. Send an order from the vendor&apos;s page, or write from the WhatsApp app on the business phone.
                    </p>
                  ) : (
                    <>
                      {thread.windowEndsAt && !meta.testMode && (
                        <p className="mb-1.5 text-[11px] text-slate-500">You can write freely until {time(thread.windowEndsAt)} (24 hours after their last message).</p>
                      )}
                      <div className="flex gap-2">
                        <textarea
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              (e.currentTarget.form as HTMLFormElement).requestSubmit();
                            }
                          }}
                          rows={1}
                          maxLength={4000}
                          placeholder="Type a reply"
                          className="min-h-[42px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                        />
                        <button type="submit" disabled={busy || !draft.trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
                        </button>
                      </div>
                    </>
                  )}
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </Shell>
  );
}
