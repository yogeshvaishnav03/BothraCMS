import crypto from "crypto";
import path from "path";
import { prisma } from "@/lib/db";
import { GRAPH, indianMobile, MessagingError, messagingSettings, post, sendWhatsAppTemplate } from "@/lib/messaging";
import { backupFileToDatabase, getStorageProvider } from "@/lib/storage";
import { notifyPeople } from "@/lib/notify";
import { formatNotificationMessage } from "@/lib/order-notifications";

/**
 * Two-way WhatsApp through the business number: orders and messages go out
 * to vendors (and buyers, and staff), and their replies come back into the
 * app through Meta's webhook.
 *
 * - WhatsApp lets a business write freely only within 24 hours of the other
 *   side's last message. Outside that, only an approved template can be
 *   sent (the order template for orders).
 * - Ordinary WhatsApp groups made on a phone cannot be reached by the API.
 *   A vendor's group link is kept so the office can open it and paste.
 */

export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const MEDIA_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
  "audio/ogg": ".ogg",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "video/mp4": ".mp4",
};

export interface Counterpart {
  kind: "VENDOR" | "BUYER" | "STAFF" | "UNKNOWN";
  name: string;
  partyId?: string;
  bookingId?: string;
  staffUserId?: string;
  href?: string;
}

/** Who a WhatsApp number belongs to: a vendor or contractor, a buyer, or a member of staff. */
export async function findCounterpart(organizationId: string, waId: string): Promise<Counterpart> {
  // Numbers are stored as typed ("+91 98220 55443"), so narrow on the last two digits and compare in full here.
  const tail = waId.slice(-2);
  const parties = await prisma.party.findMany({
    where: { organizationId, OR: [{ phone: { contains: tail } }, { whatsappNumber: { contains: tail } }] },
    select: { id: true, name: true, phone: true, whatsappNumber: true },
  });
  const party = parties.find((p) => indianMobile(p.whatsappNumber) === waId || indianMobile(p.phone) === waId);
  if (party) return { kind: "VENDOR", name: party.name, partyId: party.id, href: `/parties/${party.id}` };

  const bookings = await prisma.salesBooking.findMany({
    where: { organizationId, customerPhone: { contains: tail } },
    select: { id: true, customerName: true, customerPhone: true, status: true },
    orderBy: { createdAt: "desc" },
  });
  const booking = bookings.find((b) => indianMobile(b.customerPhone) === waId);
  if (booking) return { kind: "BUYER", name: booking.customerName, bookingId: booking.id, href: `/sales?booking=${booking.id}` };

  const users = await prisma.user.findMany({ where: { organizationId, phone: { contains: tail } }, select: { id: true, name: true, phone: true } });
  const staff = users.find((u) => indianMobile(u.phone) === waId);
  if (staff) return { kind: "STAFF", name: staff.name, staffUserId: staff.id };

  return { kind: "UNKNOWN", name: `+${waId}` };
}

/** Meta signs each webhook call with the app secret: X-Hub-Signature-256 = sha256=HMAC(body). */
export function validSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const want = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const got = header.slice(7);
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/** The builder whose WhatsApp number the webhook call is about. */
export async function orgForPhoneNumberId(phoneNumberId: string) {
  if (!/^\d{5,30}$/.test(phoneNumberId)) return null;
  const orgs = await prisma.organization.findMany({ where: { settingsJson: { contains: `"waPhoneNumberId":"${phoneNumberId}"` } }, select: { id: true } });
  return orgs[0]?.id ?? null;
}

/** The builder whose verify token Meta sends when the webhook is set up. */
export async function orgForVerifyToken(token: string) {
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(token)) return null;
  const orgs = await prisma.organization.findMany({ where: { settingsJson: { contains: `"waVerifyToken":"${token}"` } }, select: { id: true } });
  return orgs[0]?.id ?? null;
}

export const newVerifyToken = () => `bothra_${crypto.randomBytes(18).toString("base64url")}`;

/** Copies a photo or document a vendor sent into the app's file store. */
async function saveMedia(organizationId: string, mediaId: string, token: string, entity: { type: string; id: string }, name?: string) {
  const meta = await fetch(`${GRAPH}/${encodeURIComponent(mediaId)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  if (!meta.ok) return null;
  const info = (await meta.json()) as { url?: string; mime_type?: string; file_size?: number };
  const mime = (info.mime_type || "").split(";")[0].trim();
  if (!info.url || !MEDIA_EXT[mime] || (info.file_size && info.file_size > MAX_MEDIA_BYTES)) return null;
  const res = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_MEDIA_BYTES) return null;
  const fileId = crypto.randomUUID();
  const diskFileName = `${organizationId}_${fileId}${MEDIA_EXT[mime]}`;
  const fileName = (name ? path.basename(name) : `whatsapp-${fileId.slice(0, 8)}${MEDIA_EXT[mime]}`).replace(/[^a-zA-Z0-9._-]/g, "_");
  await getStorageProvider().put(diskFileName, buffer, mime);
  await backupFileToDatabase(organizationId, [`FILE_BLOB_${fileId}`, `FILE_BLOB_${diskFileName}`], buffer).catch(() => {});
  // Files need someone as the uploader: the first admin, with a note that it came from WhatsApp.
  const admin = await prisma.user.findFirst({ where: { organizationId, role: { in: ["ORG_ADMIN", "SUPER_ADMIN"] } }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!admin) return null;
  await prisma.attachment.create({
    data: { organizationId, entityType: entity.type, entityId: entity.id, fileId, fileName, fileSize: buffer.length, mimeType: mime, category: mime.startsWith("image/") ? "PHOTO" : "GENERAL", diskFileName, uploadedById: admin.id, notes: "Received on WhatsApp" },
  });
  return { fileId, mime, fileName };
}

/** The words of an incoming message, for the chat and the log. */
function messageText(m: any): { kind: string; text: string; mediaId?: string; fileName?: string } {
  switch (m.type) {
    case "text":
      return { kind: "TEXT", text: String(m.text?.body ?? "") };
    case "image":
      return { kind: "IMAGE", text: String(m.image?.caption ?? ""), mediaId: m.image?.id };
    case "document":
      return { kind: "DOCUMENT", text: String(m.document?.caption ?? m.document?.filename ?? ""), mediaId: m.document?.id, fileName: m.document?.filename };
    case "audio":
      return { kind: "AUDIO", text: "Voice note", mediaId: m.audio?.id };
    case "video":
      return { kind: "VIDEO", text: String(m.video?.caption ?? "Video"), mediaId: m.video?.id };
    case "location":
      return { kind: "LOCATION", text: `Location: https://maps.google.com/?q=${m.location?.latitude},${m.location?.longitude}${m.location?.name ? ` (${m.location.name})` : ""}` };
    case "button":
      return { kind: "TEXT", text: String(m.button?.text ?? "") };
    case "interactive":
      return { kind: "TEXT", text: String(m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "") };
    default:
      return { kind: "OTHER", text: `(${m.type || "unsupported"} message: open WhatsApp on the business phone to see it)` };
  }
}

const STATUS_RANK: Record<string, number> = { TEST: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };

/**
 * One webhook call from Meta: new messages and delivery updates. The caller
 * has already checked the signature for this builder.
 */
export async function handleWebhook(organizationId: string, value: any) {
  const s = await messagingSettings(organizationId);
  let received = 0;

  for (const st of value?.statuses ?? []) {
    const status = String(st.status || "").toUpperCase();
    if (!STATUS_RANK[status] || !st.id) continue;
    const row = await prisma.whatsAppMessage.findUnique({ where: { providerRef: String(st.id) } });
    if (!row || row.organizationId !== organizationId) continue;
    // Updates can arrive out of order; a message never goes back from read to delivered.
    if ((STATUS_RANK[row.status] ?? 0) >= STATUS_RANK[status] && status !== "FAILED") continue;
    await prisma.whatsAppMessage.update({ where: { id: row.id }, data: { status, error: status === "FAILED" ? String(st.errors?.[0]?.title || st.errors?.[0]?.message || "Not delivered").slice(0, 300) : row.error } });
  }

  const names = new Map<string, string>((value?.contacts ?? []).map((c: any) => [String(c.wa_id), String(c.profile?.name || "")]));
  for (const m of value?.messages ?? []) {
    const waId = indianMobile(String(m.from || "")) || String(m.from || "");
    if (!waId || !m.id) continue;
    if (await prisma.whatsAppMessage.findUnique({ where: { providerRef: String(m.id) } })) continue; // Meta retries
    const who = await findCounterpart(organizationId, waId);
    const body = messageText(m);
    const replyToRef = m.context?.id ? String(m.context.id) : null;
    const answered = replyToRef ? await prisma.whatsAppMessage.findUnique({ where: { providerRef: replyToRef }, select: { purchaseOrderId: true, organizationId: true } }) : null;
    let file: { fileId: string; mime: string; fileName: string } | null = null;
    if (body.mediaId && s.waToken) {
      file = await saveMedia(organizationId, body.mediaId, s.waToken, who.partyId ? { type: "PARTY", id: who.partyId } : { type: "WHATSAPP", id: waId }, body.fileName).catch((e) => { console.error("[WHATSAPP_INBOX] media", e?.message); return null; });
    }
    const row = await prisma.whatsAppMessage.create({
      data: {
        organizationId,
        direction: "IN",
        waId,
        kind: body.kind,
        text: body.text.slice(0, 4000) || (file ? file.fileName : ""),
        fileId: file?.fileId ?? null,
        mimeType: file?.mime ?? null,
        fileName: file?.fileName ?? null,
        providerRef: String(m.id),
        replyToRef,
        status: "RECEIVED",
        partyId: who.partyId ?? null,
        bookingId: who.bookingId ?? null,
        staffUserId: who.staffUserId ?? null,
        purchaseOrderId: answered?.organizationId === organizationId ? answered.purchaseOrderId : null,
        createdAt: m.timestamp ? new Date(Number(m.timestamp) * 1000) : undefined,
      },
    });
    received++;

    // The bell (and phone push) for whoever looks after this kind of chat.
    const name = who.kind === "UNKNOWN" && names.get(String(m.from)) ? `${names.get(String(m.from))} (+${waId})` : who.name;
    const recipients = await inboxPeople(organizationId, who.kind);
    await notifyPeople({
      organizationId,
      actorUserId: "WHATSAPP",
      userIds: recipients,
      type: "WHATSAPP_REPLY",
      title: `WhatsApp from ${name}`,
      message: (row.text || body.kind).slice(0, 200),
      href: `/whatsapp?with=${waId}`,
      entityType: "WHATSAPP",
      entityId: row.id,
    }).catch((e) => console.error("[WHATSAPP_INBOX] notify", e));
  }
  return { received };
}

/** Who sees a kind of chat: vendors for purchasing and accounts, buyers for sales, the rest for admins. */
export async function inboxPeople(organizationId: string, kind: Counterpart["kind"]) {
  const roles =
    kind === "VENDOR"
      ? ["SUPER_ADMIN", "ORG_ADMIN", "ACCOUNTANT", "STOREKEEPER", "PROJECT_MANAGER"]
      : kind === "BUYER"
        ? ["SUPER_ADMIN", "ORG_ADMIN", "ACCOUNTANT"]
        : ["SUPER_ADMIN", "ORG_ADMIN"];
  const users = await prisma.user.findMany({ where: { organizationId, status: "ACTIVE", role: { in: roles } }, select: { id: true } });
  return users.map((u) => u.id);
}

/** Roles that may open a kind of chat. */
export function canSeeChat(role: string, kind: Counterpart["kind"]) {
  if (role === "SUPER_ADMIN" || role === "ORG_ADMIN") return true;
  if (kind === "VENDOR") return ["ACCOUNTANT", "STOREKEEPER", "PROJECT_MANAGER"].includes(role);
  if (kind === "BUYER") return role === "ACCOUNTANT";
  return false;
}

/** When the other side last wrote, which opens the 24-hour reply window. */
export async function lastIncomingAt(organizationId: string, waId: string) {
  const last = await prisma.whatsAppMessage.findFirst({ where: { organizationId, waId, direction: "IN" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  return last?.createdAt ?? null;
}

export function replyWindowOpen(lastIn: Date | null, now = new Date()) {
  return !!lastIn && now.getTime() - lastIn.getTime() < REPLY_WINDOW_MS;
}

/** A typed message, allowed only within 24 hours of their last message. */
export async function sendChatText(organizationId: string, input: { to: string; text: string; sentById: string; purchaseOrderId?: string | null; now?: Date }) {
  const to = indianMobile(input.to);
  if (!to) throw new MessagingError("Not a valid Indian mobile number");
  const text = input.text.trim();
  if (!text) throw new MessagingError("Type a message first");
  if (text.length > 4000) throw new MessagingError("A WhatsApp message can be at most 4,000 characters");
  const s = await messagingSettings(organizationId);
  if (!s.testMode && !replyWindowOpen(await lastIncomingAt(organizationId, to), input.now)) {
    throw new MessagingError("It is more than 24 hours since their last message, so WhatsApp only allows an approved template. Send the order template, or open the chat on your phone.", 409, "WINDOW_CLOSED");
  }
  const who = await findCounterpart(organizationId, to);
  const base = { organizationId, direction: "OUT", waId: to, kind: "TEXT", text, partyId: who.partyId ?? null, bookingId: who.bookingId ?? null, staffUserId: who.staffUserId ?? null, purchaseOrderId: input.purchaseOrderId ?? null, sentById: input.sentById };
  if (s.testMode) return prisma.whatsAppMessage.create({ data: { ...base, status: "TEST" } });
  if (!s.waPhoneNumberId || !s.waToken) throw new MessagingError("WhatsApp is not set up in Settings → Messages", 503, "MESSAGING_OFF");
  try {
    const res = await post(`${GRAPH}/${encodeURIComponent(s.waPhoneNumberId)}/messages`, { Authorization: `Bearer ${s.waToken}` }, { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: true, body: text } });
    if (!res.ok) return prisma.whatsAppMessage.create({ data: { ...base, status: "FAILED", error: String(res.json?.error?.message || `WhatsApp said ${res.status}`).slice(0, 300) } });
    return prisma.whatsAppMessage.create({ data: { ...base, status: "SENT", providerRef: res.json?.messages?.[0]?.id || null } });
  } catch (e: any) {
    return prisma.whatsAppMessage.create({ data: { ...base, status: "FAILED", error: String(e?.message || "Could not reach WhatsApp").slice(0, 300) } });
  }
}

/** A short line for a purchase order, for the order template. */
export function orderSummary(po: { quantity: number; unitCode: string; unitRate?: number | null; totalAmount?: number | null; expectedDeliveryDate?: Date | string | null; deliveryLocation?: string | null; material: { name: string } }) {
  const rs = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  const parts = [`${po.quantity} ${po.unitCode} ${po.material.name}`];
  if (po.unitRate) parts.push(`at ${rs(po.unitRate)}/${po.unitCode}`);
  if (po.totalAmount) parts.push(`total ${rs(po.totalAmount)}`);
  if (po.deliveryLocation) parts.push(`deliver to ${po.deliveryLocation}`);
  if (po.expectedDeliveryDate) parts.push(`by ${new Date(po.expectedDeliveryDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}`);
  return parts.join(", ").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").slice(0, 600);
}

/**
 * Sends a purchase order to the vendor's WhatsApp: the full order when they
 * wrote in the last 24 hours, otherwise the approved order template.
 */
export async function sendOrderToVendor(organizationId: string, orderId: string, sentById: string) {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id: orderId, organizationId },
    include: {
      vendor: { select: { id: true, name: true, phone: true, whatsappNumber: true } },
      material: { select: { name: true, sku: true } },
      organization: { select: { name: true } },
      store: { select: { name: true } },
      site: { select: { name: true } },
      creator: { select: { name: true } },
    },
  });
  if (!po) throw new MessagingError("Order not found", 404, "NOT_FOUND");
  if (["PENDING_APPROVAL", "REJECTED", "CANCELLED"].includes(po.status)) throw new MessagingError("Only an approved order can be sent to the vendor", 409, "NOT_APPROVED");
  const to = indianMobile(po.vendor.whatsappNumber) || indianMobile(po.vendor.phone);
  if (!to) throw new MessagingError(`${po.vendor.name} has no mobile number for WhatsApp. Add it on the vendor's page.`);
  const deliveryLocation = po.store ? `${po.site?.name || "Site"} — ${po.store.name}` : po.site?.name || null;
  const s = await messagingSettings(organizationId);
  if (s.testMode || replyWindowOpen(await lastIncomingAt(organizationId, to))) {
    const fullText = formatNotificationMessage({
      orderNumber: po.orderNumber,
      organizationName: po.organization.name,
      vendorName: po.vendor.name,
      materialName: po.material.name,
      materialSku: po.material.sku,
      quantity: po.quantity,
      unitCode: po.unitCode,
      unitRate: po.unitRate,
      totalAmount: po.totalAmount,
      deliveryLocation,
      expectedDeliveryDate: po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : null,
      notes: po.notes,
      orderedByName: po.creator?.name || "Site office",
      approvedByName: po.approvedBy,
    });
    return sendChatText(organizationId, { to, text: fullText, sentById, purchaseOrderId: po.id });
  }
  if (!s.waOrderTemplate) throw new MessagingError("Add an order template in Settings → Messages first. The vendor has not written in the last 24 hours, so WhatsApp only allows a template.", 409, "NO_TEMPLATE");
  const summary = orderSummary({ ...po, deliveryLocation });
  const text = `New order ${po.orderNumber} from ${po.organization.name}: ${summary}. Please reply here to confirm.`;
  const r = await sendWhatsAppTemplate(organizationId, { to, template: s.waOrderTemplate, params: [po.orderNumber, po.organization.name, summary], kind: "ORDER", text, ref: { type: "PURCHASE_ORDER", id: po.id } });
  return prisma.whatsAppMessage.update({ where: { id: r.chatId! }, data: { partyId: po.vendor.id, sentById } });
}

/** The chats, newest first, with the last message and how many are unread. */
export async function conversations(organizationId: string, role: string) {
  const recent = await prisma.whatsAppMessage.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 1000 });
  const byNumber = new Map<string, typeof recent>();
  for (const m of recent) byNumber.set(m.waId, [...(byNumber.get(m.waId) || []), m]);
  const out = [];
  for (const [waId, list] of byNumber) {
    const who = await findCounterpart(organizationId, waId);
    if (!canSeeChat(role, who.kind)) continue;
    const last = list[0];
    const lastIn = list.find((m) => m.direction === "IN")?.createdAt ?? null;
    out.push({ waId, ...who, last: { text: last.text, direction: last.direction, kind: last.kind, at: last.createdAt, status: last.status }, unread: list.filter((m) => m.direction === "IN" && !m.readAt).length, windowOpen: replyWindowOpen(lastIn) });
  }
  return out;
}
