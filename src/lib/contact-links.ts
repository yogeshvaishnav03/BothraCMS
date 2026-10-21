/**
 * One-click contact links. WhatsApp uses wa.me, which opens the WhatsApp app
 * (or WhatsApp Web) with the chat ready — no WhatsApp Business API needed.
 */

/** Digits-only international number; 10-digit Indian numbers get the 91 prefix. */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export function whatsappLink(phone: string | null | undefined, message?: string): string | null {
  const n = normalizePhone(phone);
  if (!n) return null;
  return message ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : `https://wa.me/${n}`;
}

export function telLink(phone: string | null | undefined): string | null {
  const n = normalizePhone(phone);
  return n ? `tel:+${n}` : null;
}
