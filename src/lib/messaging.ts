import { prisma } from "@/lib/db";

/**
 * Messages the system sends by itself: sign-in codes to buyers, and demand
 * letters and payment reminders on WhatsApp.
 *
 * - WhatsApp goes through the WhatsApp Business (Meta Cloud) API with approved
 *   templates. Meta only lets a business start a chat with a template.
 * - SMS (sign-in codes only) goes through MSG91.
 * - Test mode keeps every message in the log without sending it, so the
 *   office can try the flow before buying a WhatsApp number.
 *
 * Settings live in the organization's settings under `messaging`. The access
 * token and SMS key never go back to the browser.
 */

export interface MessagingSettings {
  testMode: boolean;
  waPhoneNumberId: string;
  waToken: string;
  waLanguage: string;
  waOtpTemplate: string;
  waDemandTemplate: string;
  waReminderTemplate: string;
  smsAuthKey: string;
  smsOtpTemplateId: string;
  /** Send the demand letter on WhatsApp as soon as a demand is raised, and reminders after. */
  autoDemands: boolean;
  /** Remind this many days before the due date (0 = no reminder before). */
  remindBeforeDays: number;
  /** While overdue, remind every this many days... */
  remindEveryDays: number;
  /** ...but no more than this many times. */
  maxOverdueReminders: number;
  /** The buyer's page asks for a code sent to their mobile, not just the link. */
  buyerSignIn: boolean;
  /** Web address of this app, for the buyer's link in messages, e.g. https://cms.bothra.in */
  siteUrl: string;
}

export const MESSAGING_DEFAULTS: MessagingSettings = {
  testMode: false,
  waPhoneNumberId: "",
  waToken: "",
  waLanguage: "en",
  waOtpTemplate: "",
  waDemandTemplate: "",
  waReminderTemplate: "",
  smsAuthKey: "",
  smsOtpTemplateId: "",
  autoDemands: false,
  remindBeforeDays: 3,
  remindEveryDays: 7,
  maxOverdueReminders: 3,
  buyerSignIn: false,
  siteUrl: "",
};

export const SECRET_KEYS = ["waToken", "smsAuthKey"] as const;

export async function messagingSettings(organizationId: string): Promise<MessagingSettings> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { settingsJson: true } });
  let settings: any = {};
  try {
    settings = org?.settingsJson ? JSON.parse(org.settingsJson) : {};
  } catch {
    settings = {};
  }
  return { ...MESSAGING_DEFAULTS, ...(settings.messaging || {}) };
}

/** What each channel can do with the settings as they are. */
export function channels(s: MessagingSettings) {
  const whatsapp = !!(s.waPhoneNumberId && s.waToken);
  const sms = !!(s.smsAuthKey && s.smsOtpTemplateId);
  return {
    whatsapp,
    sms,
    otp: s.testMode || (whatsapp && !!s.waOtpTemplate) || sms,
    demands: s.testMode || (whatsapp && !!s.waDemandTemplate),
  };
}

/** Settings safe to show in the browser: secrets become "set" flags and their last 4 characters. */
export function publicSettings(s: MessagingSettings) {
  const hide = (v: string) => (v ? `••••${v.slice(-4)}` : "");
  return { ...s, waToken: hide(s.waToken), smsAuthKey: hide(s.smsAuthKey), hasWaToken: !!s.waToken, hasSmsAuthKey: !!s.smsAuthKey, can: channels(s) };
}

/** An Indian mobile as 91 + 10 digits, or null. Accepts +91, 0 and spaces. */
export function indianMobile(raw: string | null | undefined): string | null {
  const digits = (raw || "").replace(/\D/g, "");
  const ten = digits.length === 10 ? digits : digits.length === 11 && digits[0] === "0" ? digits.slice(1) : digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : null;
  return ten && /^[6-9]\d{9}$/.test(ten) ? `91${ten}` : null;
}

export class MessagingError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
    public code = "MESSAGING"
  ) {
    super(message);
  }
}

interface SendResult {
  ok: boolean;
  logId: string;
  status: "SENT" | "FAILED" | "TEST";
  error?: string;
}

const GRAPH = "https://graph.facebook.com/v21.0";

async function log(organizationId: string, data: { channel: string; provider: string; kind: string; to: string; text: string; ref?: { type: string; id: string } }, outcome: { status: SendResult["status"]; error?: string; providerRef?: string }) {
  const row = await prisma.messageLog.create({
    data: {
      organizationId,
      channel: data.channel,
      provider: data.provider,
      kind: data.kind,
      to: data.to,
      text: data.text,
      status: outcome.status,
      error: outcome.error?.slice(0, 500) || null,
      providerRef: outcome.providerRef || null,
      refType: data.ref?.type || null,
      refId: data.ref?.id || null,
    },
  });
  return { ok: outcome.status !== "FAILED", logId: row.id, status: outcome.status, error: outcome.error } as SendResult;
}

async function post(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
}

/**
 * A WhatsApp template message. `params` fill {{1}}, {{2}}... of the template
 * body in order. `text` is the same message in words, for the log.
 */
export async function sendWhatsAppTemplate(
  organizationId: string,
  input: { to: string; template: string; params: string[]; kind: string; text: string; ref?: { type: string; id: string }; button?: string; language?: string }
): Promise<SendResult> {
  const s = await messagingSettings(organizationId);
  const to = indianMobile(input.to);
  const entry = { channel: "WHATSAPP", provider: s.testMode ? "TEST" : "META", kind: input.kind, to: to || input.to, text: input.text, ref: input.ref };
  if (!to) return log(organizationId, entry, { status: "FAILED", error: "Not a valid Indian mobile number" });
  if (s.testMode) return log(organizationId, entry, { status: "TEST" });
  if (!s.waPhoneNumberId || !s.waToken || !input.template) return log(organizationId, entry, { status: "FAILED", error: "WhatsApp is not set up in Settings → Messages" });
  const components: any[] = input.params.length ? [{ type: "body", parameters: input.params.map((text) => ({ type: "text", text })) }] : [];
  // Sign-in code templates have a "copy code" button that carries the code too.
  if (input.button) components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: input.button }] });
  try {
    const res = await post(
      `${GRAPH}/${encodeURIComponent(s.waPhoneNumberId)}/messages`,
      { Authorization: `Bearer ${s.waToken}` },
      { messaging_product: "whatsapp", to, type: "template", template: { name: input.template, language: { code: input.language || s.waLanguage || "en" }, ...(components.length ? { components } : {}) } }
    );
    if (!res.ok) return log(organizationId, entry, { status: "FAILED", error: res.json?.error?.message || `WhatsApp said ${res.status}` });
    return log(organizationId, entry, { status: "SENT", providerRef: res.json?.messages?.[0]?.id });
  } catch (e: any) {
    return log(organizationId, entry, { status: "FAILED", error: e?.message || "Could not reach WhatsApp" });
  }
}

/** A sign-in code: WhatsApp when its code template is set up, otherwise SMS. */
export async function sendSignInCode(organizationId: string, phone: string, code: string, company: string): Promise<SendResult> {
  const s = await messagingSettings(organizationId);
  // The log keeps the code only in test mode, where reading it there is the point.
  const text = `${s.testMode ? code : "••••••"} is your code to sign in to ${company}. It works for 10 minutes. Do not share it.`;
  if (s.testMode || (s.waPhoneNumberId && s.waToken && s.waOtpTemplate)) {
    return sendWhatsAppTemplate(organizationId, { to: phone, template: s.waOtpTemplate, params: [code], button: code, kind: "OTP", text });
  }
  const to = indianMobile(phone);
  const entry = { channel: "SMS", provider: "MSG91", kind: "OTP", to: to || phone, text };
  if (!to) return log(organizationId, entry, { status: "FAILED", error: "Not a valid Indian mobile number" });
  if (!s.smsAuthKey || !s.smsOtpTemplateId) throw new MessagingError("Sign-in by code is not switched on yet. Use the link the sales office sent you.", 503, "MESSAGING_OFF");
  try {
    // MSG91 Flow API: the DLT-approved template has a ##otp## variable.
    const res = await post("https://control.msg91.com/api/v5/flow", { authkey: s.smsAuthKey }, { template_id: s.smsOtpTemplateId, short_url: "0", recipients: [{ mobiles: to, otp: code }] });
    if (!res.ok || res.json?.type === "error") return log(organizationId, entry, { status: "FAILED", error: res.json?.message || `SMS said ${res.status}` });
    return log(organizationId, entry, { status: "SENT", providerRef: res.json?.message || res.json?.request_id });
  } catch (e: any) {
    return log(organizationId, entry, { status: "FAILED", error: e?.message || "Could not reach the SMS service" });
  }
}
