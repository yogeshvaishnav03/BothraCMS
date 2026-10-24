"use client";

import React, { useState } from "react";
import Link from "next/link";
import { api, post } from "@/lib/client-api";
import { Loader2, MessageCircle, Send, Users } from "lucide-react";

/**
 * Sending an order to a vendor:
 * - "Send" goes from the business number; the vendor's reply comes into the WhatsApp inbox.
 * - "Group" copies the order and opens the vendor's own WhatsApp group, where someone presses Send
 *   (WhatsApp does not let apps post into ordinary groups).
 */
export default function OrderWhatsAppButtons({ po, onSent }: { po: any; onSent?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const approved = !["PENDING_APPROVAL", "REJECTED", "CANCELLED"].includes(po.status);
  const groupLink: string | null = po.vendor?.whatsappGroupLink || null;
  const waId = (po.vendor?.whatsappNumber || po.vendor?.phone || "").replace(/\D/g, "").slice(-10);

  const send = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await api<{ message: { status: string; error?: string } }>(`/api/orders/${po.id}/whatsapp`, post({}));
      setNote(r.message.status === "FAILED" ? { ok: false, text: r.message.error || "Not sent" } : { ok: true, text: r.message.status === "TEST" ? "Test mode: in the log" : "Sent" });
      onSent?.();
    } catch (e: any) {
      setNote({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const toGroup = async () => {
    try {
      await navigator.clipboard.writeText(po.notificationMessage || "");
      setNote({ ok: true, text: "Order copied: paste it in the group" });
    } catch {
      setNote({ ok: false, text: "Could not copy; type it in the group" });
    }
    window.open(groupLink!, "_blank", "noopener,noreferrer");
  };

  if (!approved) return null;
  return (
    <span className="mr-1.5 inline-flex flex-col items-end gap-1 align-middle">
      <span className="inline-flex gap-1.5">
        <button
          onClick={send}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-50"
          title="Send from the business WhatsApp number; the reply comes into the WhatsApp inbox"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send
        </button>
        {groupLink && (
          <button onClick={toGroup} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50" title="Copy the order and open the vendor's WhatsApp group">
            <Users className="h-3.5 w-3.5" /> Group
          </button>
        )}
        {waId.length === 10 && (
          <Link href={`/whatsapp?with=91${waId}`} className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-600 hover:bg-slate-50" title="Open the chat with this vendor">
            <MessageCircle className="h-3.5 w-3.5" />
          </Link>
        )}
      </span>
      {note && <span className={note.ok ? "text-[11px] font-semibold text-emerald-700" : "max-w-[260px] whitespace-normal text-right text-[11px] font-semibold text-rose-600"}>{note.text}</span>}
    </span>
  );
}
