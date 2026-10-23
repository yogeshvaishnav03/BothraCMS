import crypto from "crypto";
import { prisma } from "@/lib/db";

/**
 * Online payment for buyers through Razorpay Payment Links.
 *
 * The buyer presses "Pay now" on their page; we make a payment link for the
 * instalment's balance and send them to Razorpay's page (UPI, cards, net
 * banking). Razorpay sends them back to us with a signed result, and also
 * calls our webhook, and whichever arrives first books the receipt.
 *
 * Settings live in the organization's settings under `payments`. The key
 * secret and webhook secret never go back to the browser. Test keys
 * (rzp_test_…) take test payments that move no money.
 */

export interface PaymentSettings {
  enabled: boolean;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

export const PAYMENT_DEFAULTS: PaymentSettings = { enabled: false, keyId: "", keySecret: "", webhookSecret: "" };
export const PAYMENT_SECRET_KEYS = ["keySecret", "webhookSecret"] as const;

export async function paymentSettings(organizationId: string): Promise<PaymentSettings> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { settingsJson: true } });
  let settings: any = {};
  try {
    settings = org?.settingsJson ? JSON.parse(org.settingsJson) : {};
  } catch {
    settings = {};
  }
  return { ...PAYMENT_DEFAULTS, ...(settings.payments || {}) };
}

/** Buyers see "Pay now" only when it is switched on and the keys are in. */
export const canTakePayments = (s: PaymentSettings) => s.enabled && !!s.keyId && !!s.keySecret;
export const isTestKey = (keyId: string) => keyId.startsWith("rzp_test_");

export function publicPaymentSettings(s: PaymentSettings) {
  const hide = (v: string) => (v ? `••••${v.slice(-4)}` : "");
  return {
    enabled: s.enabled,
    keyId: s.keyId,
    keySecret: hide(s.keySecret),
    webhookSecret: hide(s.webhookSecret),
    hasKeySecret: !!s.keySecret,
    hasWebhookSecret: !!s.webhookSecret,
    testKeys: isTestKey(s.keyId),
    ready: canTakePayments(s),
  };
}

export class PaymentError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
    public code = "PAYMENT"
  ) {
    super(message);
  }
}

const API = "https://api.razorpay.com/v1";

async function razorpay(s: PaymentSettings, path: string, init?: { method?: string; body?: unknown }) {
  const res = await fetch(`${API}${path}`, {
    method: init?.method || "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${s.keyId}:${s.keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  }).catch(() => {
    throw new PaymentError("Could not reach Razorpay. Try again in a minute.", 502, "RAZORPAY");
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const why = data?.error?.description || `Razorpay replied ${res.status}`;
    throw new PaymentError(res.status === 401 ? "Razorpay did not accept the key ID and secret." : why, 502, "RAZORPAY");
  }
  return data;
}

/** Checks the keys work, without taking any money. */
export async function checkRazorpayKeys(s: PaymentSettings) {
  await razorpay(s, "/payment_links?count=1");
  return true;
}

/**
 * What Razorpay kept from one payment, in paise. `fee` already includes the
 * GST on it (`tax`). Null until Razorpay has worked it out.
 */
export async function fetchPaymentFee(s: PaymentSettings, paymentId: string): Promise<{ fee: number | null; tax: number | null; method: string | null }> {
  const p = await razorpay(s, `/payments/${encodeURIComponent(paymentId)}`);
  return {
    fee: typeof p.fee === "number" ? p.fee : null,
    tax: typeof p.tax === "number" ? p.tax : null,
    method: p.method ? String(p.method) : null,
  };
}

export interface PaymentLink {
  id: string;
  short_url: string;
  status: string;
}

/** A Razorpay payment link for one amount, which sends the buyer back to `callbackUrl` when done. */
export function createPaymentLink(
  s: PaymentSettings,
  input: { amount: number; referenceId: string; description: string; customer: { name: string; contact?: string | null; email?: string | null }; callbackUrl: string; expiresAt: Date; notes: Record<string, string> }
): Promise<PaymentLink> {
  return razorpay(s, "/payment_links", {
    method: "POST",
    body: {
      amount: input.amount,
      currency: "INR",
      accept_partial: false,
      reference_id: input.referenceId,
      description: input.description.slice(0, 2000),
      customer: {
        name: input.customer.name.slice(0, 100),
        ...(input.customer.contact ? { contact: input.customer.contact } : {}),
        ...(input.customer.email ? { email: input.customer.email } : {}),
      },
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: input.notes,
      callback_url: input.callbackUrl,
      callback_method: "get",
      expire_by: Math.floor(input.expiresAt.getTime() / 1000),
    },
  });
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** The signature on the buyer's return from a payment link. */
export function verifyLinkCallback(
  keySecret: string,
  q: { paymentId: string; linkId: string; referenceId: string; status: string; signature: string }
) {
  const expected = crypto.createHmac("sha256", keySecret).update(`${q.linkId}|${q.referenceId}|${q.status}|${q.paymentId}`).digest("hex");
  return !!q.signature && safeEqual(expected, q.signature);
}

/** The signature on a webhook call (X-Razorpay-Signature over the raw body). */
export function verifyWebhook(webhookSecret: string, rawBody: string, signature: string | null) {
  if (!webhookSecret || !signature) return false;
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}
