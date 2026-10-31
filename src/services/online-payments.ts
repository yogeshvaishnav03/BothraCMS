import crypto from "crypto";
import { prisma } from "@/lib/db";
import type { UserContext } from "@/lib/auth";
import { istDateKey } from "@/lib/ist-date";
import { notifyPeople } from "@/lib/notify";
import { messagingSettings } from "@/lib/messaging";
import { canTakePayments, createPaymentLink, fetchPaymentFee, paymentSettings, PaymentError, verifyLinkCallback, verifyWebhook } from "@/lib/online-payments";
import { SalesService } from "@/services/sales-service";
import { FinanceService } from "@/services/finance-service";

const due = (i: { amount: number; gstAmount: number }) => i.amount + i.gstAmount;
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
/** A link is good for 30 minutes; one that has 5 minutes left is reused rather than made again. */
const LINK_MINUTES = 30;

/**
 * Starts a payment from the buyer's page for one instalment's balance.
 * Returns the Razorpay page to send the buyer to.
 */
export async function startOnlinePayment(input: { portalToken: string; installmentId: string; baseUrl: string }) {
  const booking = await prisma.salesBooking.findUnique({
    where: { portalToken: input.portalToken },
    include: { unit: { include: { project: { select: { name: true } } } }, installments: true },
  });
  if (!booking || booking.status !== "ACTIVE") throw new PaymentError("This link is not valid.", 404, "NOT_FOUND");
  const inst = booking.installments.find((i) => i.id === input.installmentId);
  if (!inst) throw new PaymentError("Instalment not found", 404, "NOT_FOUND");
  if (!inst.dueDate) throw new PaymentError("This instalment is not due yet.", 409, "NOT_DUE");
  const balance = due(inst) - inst.receivedAmount;
  if (balance <= 0) throw new PaymentError("This instalment is already paid.", 409, "ALREADY_PAID");
  const s = await paymentSettings(booking.organizationId);
  if (!canTakePayments(s)) throw new PaymentError("Online payment is not switched on.", 409, "PAYMENTS_OFF");

  const reuse = await prisma.onlinePayment.findFirst({
    where: { installmentId: inst.id, status: "CREATED", amount: balance, shortUrl: { not: null }, expiresAt: { gt: new Date(Date.now() + 5 * 60_000) } },
    orderBy: { createdAt: "desc" },
  });
  if (reuse?.shortUrl) return { url: reuse.shortUrl, onlinePaymentId: reuse.id };

  const referenceId = `OP${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const expiresAt = new Date(Date.now() + LINK_MINUTES * 60_000);
  const row = await prisma.onlinePayment.create({
    data: { organizationId: booking.organizationId, bookingId: booking.id, installmentId: inst.id, amount: balance, referenceId, expiresAt },
  });
  const phone = booking.customerPhone.replace(/\D/g, "").slice(-10);
  const link = await createPaymentLink(s, {
    amount: balance,
    referenceId,
    description: `${booking.unit.project.name} ${booking.unit.unitNumber}: ${inst.label} (booking ${booking.bookingNumber})`,
    customer: { name: booking.customerName, contact: phone.length === 10 ? `+91${phone}` : null, email: booking.customerEmail },
    callbackUrl: `${input.baseUrl.replace(/\/$/, "")}/api/portal/pay/callback`,
    expiresAt,
    notes: { booking: booking.bookingNumber, unit: booking.unit.unitNumber, instalment: inst.label.slice(0, 200) },
  }).catch(async (err) => {
    // No link was made, so nothing to keep.
    await prisma.onlinePayment.delete({ where: { id: row.id } }).catch(() => {});
    throw err;
  });
  await prisma.onlinePayment.update({ where: { id: row.id }, data: { linkId: link.id, shortUrl: link.short_url } });
  return { url: link.short_url, onlinePaymentId: row.id };
}

/** The web address Razorpay sends the buyer back to: Settings → Messages "site URL" if set, else this request's. */
export async function paymentBaseUrl(organizationId: string, requestOrigin: string) {
  const m = await messagingSettings(organizationId);
  return m.siteUrl || requestOrigin;
}

/**
 * Books a paid link as receipts. Safe to call more than once (the buyer's
 * return and the webhook both call it): only the call that moves the row
 * from CREATED to PAID books anything.
 */
export async function completeOnlinePayment(input: {
  linkId: string;
  paymentId: string;
  method?: string | null;
  /** Razorpay's fee and the GST on it, in paise, when the webhook carries them. */
  fee?: number | null;
  feeTax?: number | null;
  source: "RETURN" | "WEBHOOK";
}) {
  const op = await prisma.onlinePayment.findUnique({ where: { linkId: input.linkId } });
  if (!op) return null;
  // The fee is noted whichever call comes first; it never holds up the receipt.
  if (op.fee == null && input.fee != null) {
    await prisma.onlinePayment.update({ where: { id: op.id }, data: { fee: input.fee, feeTax: input.feeTax ?? null } }).catch(() => {});
  }
  const claimed = await prisma.onlinePayment.updateMany({
    where: { id: op.id, status: { in: ["CREATED", "EXPIRED"] } },
    data: { status: "PAID", paymentId: input.paymentId, method: input.method || null, paidAt: new Date() },
  });
  if (claimed.count === 0) {
    // Already booked; the webhook coming second still tells us how it was paid.
    if (input.method && !op.method) await prisma.onlinePayment.update({ where: { id: op.id }, data: { method: input.method } });
    return prisma.onlinePayment.findUnique({ where: { id: op.id } });
  }

  const booking = await prisma.salesBooking.findUnique({
    where: { id: op.bookingId },
    include: { unit: true, installments: { orderBy: { sortOrder: "asc" } } },
  });
  // Receipts are entered in the name of the person who made the booking.
  const ctx = { userId: booking?.createdBy || "", organizationId: op.organizationId, role: "ORG_ADMIN", email: "", name: "Online payment" } as unknown as UserContext;
  const receiptIds: string[] = [];
  let left = op.amount;
  let note: string | null = null;
  try {
    if (!booking) throw new Error("The booking is gone.");
    // The instalment paid for first; anything over (the office booked part of it meanwhile) goes on the next ones.
    const order = [...booking.installments.filter((i) => i.id === op.installmentId), ...booking.installments.filter((i) => i.id !== op.installmentId)];
    for (const inst of order) {
      if (left <= 0) break;
      const fresh = await prisma.salesInstallment.findUnique({ where: { id: inst.id } });
      const room = fresh ? due(fresh) - fresh.receivedAmount : 0;
      if (room <= 0) continue;
      const take = Math.min(room, left);
      const r = await SalesService.receive(ctx, inst.id, { amount: take, date: istDateKey(), mode: "ONLINE", reference: `Razorpay ${input.paymentId}` });
      receiptIds.push(r.id);
      left -= take;
    }
    if (left > 0) note = `${rupees(left)} more than was due on the booking. Refund it in Razorpay or keep it as an advance.`;
    await prisma.onlinePayment.update({ where: { id: op.id }, data: { receiptIds: JSON.stringify(receiptIds), note } });
  } catch (err) {
    note = `Paid on Razorpay (${input.paymentId}) but the receipt could not be booked: ${(err as Error).message}`;
    await prisma.onlinePayment.update({ where: { id: op.id }, data: { status: "NOT_BOOKED", receiptIds: JSON.stringify(receiptIds), note } });
  }

  const who = booking ? `${booking.customerName} (${booking.unit.unitNumber})` : "A buyer";
  await notifyPeople({
    organizationId: op.organizationId,
    actorUserId: "system",
    userIds: [booking?.createdBy],
    includeAdmins: true,
    type: "SALES_ONLINE_PAYMENT",
    title: note ? "Online payment needs a look" : "Payment received online",
    message: `${who} paid ${rupees(op.amount)} online${input.method ? ` by ${input.method}` : ""}.${note ? ` ${note}` : ""}`,
    href: "/finance",
    entityType: "SALES_BOOKING",
    entityId: op.bookingId,
    severity: note ? "WARNING" : "INFO",
  }).catch(() => {});
  if (booking) await prisma.auditEvent
    .create({
      data: {
        organizationId: op.organizationId,
        actorUserId: booking.createdBy,
        action: "SALES_ONLINE_PAYMENT",
        entityType: "SALES_BOOKING",
        entityId: op.bookingId,
        reason: `Paid online (${input.source === "WEBHOOK" ? "Razorpay webhook" : "buyer returned"})`,
        afterJson: JSON.stringify({ amount: op.amount, paymentId: input.paymentId, method: input.method || null, receiptIds, note }),
      },
    })
    .catch(() => {});
  // Ask Razorpay for its fee when the webhook did not bring it; the monthly booking asks again if this fails.
  if (op.fee == null && input.fee == null) {
    try {
      const s = await paymentSettings(op.organizationId);
      const f = canTakePayments(s) ? await fetchPaymentFee(s, input.paymentId) : null;
      if (f?.fee != null) await prisma.onlinePayment.update({ where: { id: op.id }, data: { fee: f.fee, feeTax: f.tax } });
    } catch {
      // Not needed for the receipt.
    }
  }
  return prisma.onlinePayment.findUnique({ where: { id: op.id } });
}

/** The buyer back from Razorpay. Returns where to send them. */
export async function onlinePaymentReturn(q: { paymentId: string; linkId: string; referenceId: string; status: string; signature: string }) {
  const op = q.linkId ? await prisma.onlinePayment.findUnique({ where: { linkId: q.linkId } }) : null;
  if (!op || op.referenceId !== q.referenceId) return { token: null, result: "unknown" as const };
  const booking = await prisma.salesBooking.findUnique({ where: { id: op.bookingId }, select: { portalToken: true } });
  const token = booking?.portalToken || null;
  const s = await paymentSettings(op.organizationId);
  if (!verifyLinkCallback(s.keySecret, q)) return { token, result: "unverified" as const };
  if (q.status !== "paid") return { token, result: "not-paid" as const };
  const done = await completeOnlinePayment({ linkId: q.linkId, paymentId: q.paymentId, source: "RETURN" });
  return { token, result: done?.status === "PAID" ? ("paid" as const) : ("check" as const) };
}

/** Razorpay's webhook. Only payment_link.paid books anything; other events are acknowledged and left. */
export async function onlinePaymentWebhook(rawBody: string, signature: string | null) {
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new PaymentError("Bad body", 400, "BAD_REQUEST");
  }
  const link = body?.payload?.payment_link?.entity;
  const payment = body?.payload?.payment?.entity;
  if (!link?.id) return { handled: false };
  const op = await prisma.onlinePayment.findUnique({ where: { linkId: String(link.id) } });
  if (!op) return { handled: false };
  const s = await paymentSettings(op.organizationId);
  if (!verifyWebhook(s.webhookSecret, rawBody, signature)) throw new PaymentError("Signature does not match", 401, "BAD_SIGNATURE");
  if (body.event !== "payment_link.paid" || !payment?.id) return { handled: false };
  await completeOnlinePayment({
    linkId: op.linkId!,
    paymentId: String(payment.id),
    method: payment.method ? String(payment.method) : null,
    fee: typeof payment.fee === "number" ? payment.fee : null,
    feeTax: typeof payment.tax === "number" ? payment.tax : null,
    source: "WEBHOOK",
  });
  return { handled: true };
}

/**
 * Razorpay's fees, month by month. Razorpay takes its fee (with GST on it)
 * out of what it pays into the bank, so the receipts are booked in full and
 * the fees are booked once a month as a bank charge.
 */
export async function razorpayFees(organizationId: string) {
  const paid = await prisma.onlinePayment.findMany({
    where: { organizationId, status: { in: ["PAID", "NOT_BOOKED"] }, paidAt: { not: null } },
    select: { id: true, amount: true, fee: true, feeTax: true, feeBookedIn: true, paidAt: true },
    orderBy: { paidAt: "desc" },
  });
  const months = new Map<string, { month: string; payments: number; amount: number; fee: number; tax: number; unknown: number; booked: number; bookedIn: string | null }>();
  for (const p of paid) {
    const month = istDateKey(p.paidAt!).slice(0, 7);
    const m = months.get(month) || { month, payments: 0, amount: 0, fee: 0, tax: 0, unknown: 0, booked: 0, bookedIn: null };
    m.payments += 1;
    m.amount += p.amount;
    if (p.fee == null) m.unknown += 1;
    else {
      m.fee += p.fee;
      m.tax += p.feeTax || 0;
    }
    if (p.feeBookedIn) {
      m.booked += 1;
      m.bookedIn = p.feeBookedIn;
    }
    months.set(month, m);
  }
  return Array.from(months.values()).sort((a, b) => b.month.localeCompare(a.month));
}

/**
 * Books one month's Razorpay fees as a single payment to "Razorpay" (bank
 * charges, under overheads). Fees not known yet are asked from Razorpay first.
 * Booking a month again only adds the payments that came in since.
 */
export async function bookRazorpayFees(user: UserContext, month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new PaymentError("Pick a month.", 422, "BAD_MONTH");
  const [y, m] = month.split("-").map(Number);
  // Months are counted in India time, as the summary is.
  const from = new Date(Date.UTC(y, m - 1, 1) - 330 * 60000);
  const to = new Date(Date.UTC(y, m, 1) - 330 * 60000);
  const rows = await prisma.onlinePayment.findMany({
    where: { organizationId: user.organizationId, status: { in: ["PAID", "NOT_BOOKED"] }, paidAt: { gte: from, lt: to }, feeBookedIn: null },
  });
  if (!rows.length) throw new PaymentError("Nothing left to book for this month.", 409, "NOTHING_TO_BOOK");

  const s = await paymentSettings(user.organizationId);
  for (const r of rows.filter((r) => r.fee == null && r.paymentId)) {
    if (!canTakePayments(s)) break;
    try {
      const f = await fetchPaymentFee(s, r.paymentId!);
      if (f.fee != null) {
        await prisma.onlinePayment.update({ where: { id: r.id }, data: { fee: f.fee, feeTax: f.tax, method: r.method || f.method } });
        r.fee = f.fee;
        r.feeTax = f.tax;
      }
    } catch {
      // Left for next time; the rest are still booked.
    }
  }
  const ready = rows.filter((r) => r.fee != null);
  const fee = ready.reduce((a, r) => a + (r.fee || 0), 0);
  const tax = ready.reduce((a, r) => a + (r.feeTax || 0), 0);
  if (!ready.length) throw new PaymentError("Razorpay has not told us the fees for this month yet. Try again tomorrow.", 409, "FEES_UNKNOWN");

  // Each booking of a month gets its own key, so a second run adds only the new fees.
  const earlier = await prisma.onlinePayment.findMany({
    where: { organizationId: user.organizationId, feeBookedIn: { startsWith: `razorpay-fees-${month}` } },
    distinct: ["feeBookedIn"],
    select: { feeBookedIn: true },
  });
  const key = earlier.length ? `razorpay-fees-${month}-${earlier.length + 1}` : `razorpay-fees-${month}`;
  let paymentRecordId: string | null = null;
  if (fee > 0) {
    const lastDay = new Date(Date.UTC(y, m, 0, 6, 30));
    const r = await FinanceService.recordPayment({
      organizationId: user.organizationId,
      recipientType: "VENDOR",
      recipientName: "Razorpay",
      paymentDate: lastDay < new Date() ? lastDay : new Date(),
      amount: fee,
      method: "BANK_TRANSFER",
      referenceNumber: `Razorpay fees ${month}`,
      idempotencyKey: key,
      costHead: "OVERHEADS",
      notes: `Razorpay fees on ${ready.length} online payment${ready.length === 1 ? "" : "s"} in ${month}, taken out of the settlements. Includes ${rupees(tax)} GST.`,
      userId: user.userId,
      role: user.role as any,
      autoApprove: true,
    });
    paymentRecordId = r.payment.id;
  }
  await prisma.onlinePayment.updateMany({ where: { id: { in: ready.map((r) => r.id) } }, data: { feeBookedIn: key } });
  await prisma.auditEvent.create({
    data: {
      organizationId: user.organizationId,
      actorUserId: user.userId,
      action: "RAZORPAY_FEES_BOOKED",
      entityType: "PAYMENT",
      entityId: paymentRecordId || key,
      reason: `Razorpay fees for ${month}`,
      afterJson: JSON.stringify({ month, payments: ready.length, fee, tax, waiting: rows.length - ready.length }),
    },
  });
  return { month, fee, tax, payments: ready.length, waiting: rows.length - ready.length, paymentId: paymentRecordId };
}
