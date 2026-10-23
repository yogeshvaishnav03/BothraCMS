import webpush from "web-push";
import { prisma } from "@/lib/db";

/**
 * Phone push notifications (Web Push). Staff turn them on from the bell in
 * the app; their phone or browser gives us a subscription, and whatever goes
 * in their bell is pushed to it too.
 *
 * Push needs a key pair (VAPID). It is made the first time it is needed and
 * kept in the organization's settings under `push`; the private key never
 * goes to the browser. VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY on the server
 * take its place if set.
 *
 * Works in Chrome and Edge on Android and computers, and on iPhone (iOS
 * 16.4 or later) once the app is added to the home screen.
 */

interface Keys {
  publicKey: string;
  privateKey: string;
}

async function readSettings(organizationId: string) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { settingsJson: true } });
  try {
    return org?.settingsJson ? JSON.parse(org.settingsJson) : {};
  } catch {
    return {};
  }
}

export async function pushKeys(organizationId: string): Promise<Keys> {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  const settings = await readSettings(organizationId);
  if (settings.push?.publicKey && settings.push?.privateKey) return settings.push;
  const keys = webpush.generateVAPIDKeys();
  // Read again just before writing, so a setting saved meanwhile is kept.
  const fresh = await readSettings(organizationId);
  if (fresh.push?.publicKey && fresh.push?.privateKey) return fresh.push;
  await prisma.organization.update({ where: { id: organizationId }, data: { settingsJson: JSON.stringify({ ...fresh, push: { publicKey: keys.publicKey, privateKey: keys.privateKey } }) } });
  return keys;
}

/** Who the push services can contact about our messages: the site's address, or an admin's email. */
async function contact(organizationId: string) {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
  const settings = await readSettings(organizationId);
  const site = settings.messaging?.siteUrl;
  if (typeof site === "string" && site.startsWith("https://")) return site;
  const admin = await prisma.user.findFirst({ where: { organizationId, role: { in: ["SUPER_ADMIN", "ORG_ADMIN"] }, status: "ACTIVE" }, select: { email: true } });
  return `mailto:${admin?.email || "admin@localhost"}`;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Page to open when the notification is tapped. */
  href?: string;
  /** Notifications with the same tag replace each other on the phone. */
  tag?: string;
}

/**
 * Pushes a message to every phone these people turned alerts on for.
 * A subscription the push service says is gone (404, 410) is deleted; one
 * that fails 5 times in a row is deleted too.
 */
export async function pushToPeople(organizationId: string, userIds: string[], message: PushMessage) {
  if (!userIds.length) return { sent: 0, failed: 0 };
  const subs = await prisma.pushSubscription.findMany({ where: { organizationId, userId: { in: userIds } } });
  if (!subs.length) return { sent: 0, failed: 0 };
  const [keys, subject] = await Promise.all([pushKeys(organizationId), contact(organizationId)]);
  const payload = JSON.stringify({ title: message.title, body: message.body.slice(0, 240), href: message.href || "/", tag: message.tag });
  let sent = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
          TTL: 12 * 3600,
        });
        sent++;
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { failures: 0, lastSentAt: new Date() } });
      } catch (err: any) {
        failed++;
        const gone = err?.statusCode === 404 || err?.statusCode === 410 || s.failures + 1 >= 5;
        if (gone) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else await prisma.pushSubscription.update({ where: { id: s.id }, data: { failures: { increment: 1 } } }).catch(() => {});
      }
    })
  );
  return { sent, failed };
}
