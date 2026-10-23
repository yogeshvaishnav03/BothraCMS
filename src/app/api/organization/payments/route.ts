import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { checkRazorpayKeys, PAYMENT_DEFAULTS, paymentSettings, publicPaymentSettings } from "@/lib/online-payments";

export const dynamic = "force-dynamic";

/** Settings → Online payments: Razorpay keys, and the last payments buyers made. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "users:manage");
    const [settings, rows] = await Promise.all([
      paymentSettings(user.organizationId),
      prisma.onlinePayment.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" }, take: 30 }),
    ]);
    const bookings = await prisma.salesBooking.findMany({
      where: { id: { in: Array.from(new Set(rows.map((r) => r.bookingId))) } },
      select: { id: true, bookingNumber: true, customerName: true, unit: { select: { unitNumber: true } } },
    });
    const byId = new Map(bookings.map((b) => [b.id, b]));
    const log = rows
      // A link made but never paid is noise once it has expired.
      .filter((r) => r.status !== "CREATED" || r.expiresAt > new Date())
      .map((r) => {
        const b = byId.get(r.bookingId);
        return {
          id: r.id,
          createdAt: r.createdAt,
          paidAt: r.paidAt,
          amount: r.amount,
          status: r.status,
          method: r.method,
          paymentId: r.paymentId,
          note: r.note,
          buyer: b ? `${b.customerName} · ${b.unit.unitNumber}` : "",
          bookingNumber: b?.bookingNumber || "",
        };
      });
    return jsonSuccess({ settings: publicPaymentSettings(settings), log });
  } catch (error) {
    return handleApiError(error);
  }
}

const schema = z.object({
  enabled: z.boolean().optional(),
  keyId: z
    .string()
    .trim()
    .refine((v) => v === "" || /^rzp_(test|live)_[A-Za-z0-9]+$/.test(v), "The key ID starts with rzp_test_ or rzp_live_")
    .optional(),
  // Secrets: left out = keep, "" = remove.
  keySecret: z.string().trim().max(100).optional(),
  webhookSecret: z.string().trim().max(100).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "users:manage");
    const input = schema.parse(await req.json());
    const org = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { settingsJson: true } });
    let all: any = {};
    try {
      all = org?.settingsJson ? JSON.parse(org.settingsJson) : {};
    } catch {
      all = {};
    }
    const next = { ...PAYMENT_DEFAULTS, ...(all.payments || {}), ...input };
    if (next.enabled && !(next.keyId && next.keySecret)) return jsonError("Add the Razorpay key ID and key secret before switching it on.", "BAD_REQUEST", 400);
    await prisma.organization.update({ where: { id: user.organizationId }, data: { settingsJson: JSON.stringify({ ...all, payments: next }) } });
    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "ONLINE_PAYMENT_SETTINGS_UPDATED",
        entityType: "ORGANIZATION",
        entityId: user.organizationId,
        // Never the secrets themselves.
        afterJson: JSON.stringify({ enabled: next.enabled, keyId: next.keyId, keySecretChanged: input.keySecret !== undefined, webhookSecretChanged: input.webhookSecret !== undefined }),
      },
    });
    return jsonSuccess({ settings: publicPaymentSettings(next) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Checks the saved keys with Razorpay. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "users:manage");
    const s = await paymentSettings(user.organizationId);
    if (!s.keyId || !s.keySecret) return jsonError("Save the key ID and key secret first.", "BAD_REQUEST", 400);
    await checkRazorpayKeys(s);
    return jsonSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
