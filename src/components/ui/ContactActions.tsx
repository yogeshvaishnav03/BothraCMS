"use client";

import React from "react";
import Link from "next/link";
import { Mail, MessageSquare, Phone } from "lucide-react";
import { cn } from "@/lib/cn";
import { telLink, whatsappLink } from "@/lib/contact-links";

/** The official WhatsApp glyph, so the button is recognisable at a glance. */
export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.16-3.48-8.41" />
    </svg>
  );
}

export interface ContactActionsProps {
  phone?: string | null;
  whatsappNumber?: string | null;
  email?: string | null;
  /** Pre-filled WhatsApp message. */
  message?: string;
  /** In-app chat target: links to /chat?with=<userId>. */
  chatUserId?: string | null;
  size?: "sm" | "md";
  className?: string;
}

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-all ring-1 active:scale-95";

export function ContactActions({
  phone,
  whatsappNumber,
  email,
  message,
  chatUserId,
  size = "sm",
  className,
}: ContactActionsProps) {
  const wa = whatsappLink(whatsappNumber || phone, message);
  const tel = telLink(phone || whatsappNumber);
  const pad = size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm";
  const icon = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";

  if (!wa && !tel && !email && !chatUserId) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(base, pad, "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-500 hover:text-white hover:ring-emerald-500")}
          title="Chat on WhatsApp"
        >
          <WhatsAppIcon className={icon} />
          <span>WhatsApp</span>
        </a>
      )}
      {tel && (
        <a
          href={tel}
          className={cn(base, pad, "bg-white text-slate-700 ring-slate-200 hover:ring-slate-300 hover:bg-slate-50")}
          title={`Call ${phone || whatsappNumber}`}
          aria-label="Call"
        >
          <Phone className={icon} />
        </a>
      )}
      {email && (
        <a
          href={`mailto:${email}`}
          className={cn(base, pad, "bg-white text-slate-700 ring-slate-200 hover:ring-slate-300 hover:bg-slate-50")}
          title={`Email ${email}`}
          aria-label="Email"
        >
          <Mail className={icon} />
        </a>
      )}
      {chatUserId && (
        <Link
          href={`/chat?with=${encodeURIComponent(chatUserId)}`}
          className={cn(base, pad, "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-500 hover:text-slate-950 hover:ring-amber-500")}
          title="Message in Bothra CMS"
        >
          <MessageSquare className={icon} />
          <span>Chat</span>
        </Link>
      )}
    </div>
  );
}
