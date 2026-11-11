import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { pushKeys, pushToPeople } from "@/lib/push";

export const dynamic = "force-dynamic";

function isSafePushEndpoint(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    if (parsed.port && parsed.port !== "443") return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      !host ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return false;
    }
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const [, a, b] = ipv4.map(Number);
      if (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127)
      ) {
        return false;
      }
    }
    if (host.includes(":")) {
      if (host === "::1" || host === "::" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** The public key the phone needs to subscribe, and how many phones this person turned alerts on for. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    const endpoint = req.nextUrl.searchParams.get("endpoint");
    const [keys, devices, mine] = await Promise.all([
      pushKeys(user.organizationId),
      prisma.pushSubscription.count({ where: { organizationId: user.organizationId, userId: user.userId } }),
      endpoint ? prisma.pushSubscription.findFirst({ where: { organizationId: user.organizationId, userId: user.userId, endpoint }, select: { id: true } }) : null,
    ]);
    return jsonSuccess({ publicKey: keys.publicKey, devices, thisDevice: !!mine });
  } catch (error) {
    return handleApiError(error);
  }
}

const testOnlySchema = z.object({
  testOnly: z.literal(true),
});

const fullSubscribeSchema = z.object({
  endpoint: z.string().url().max(1000).refine(isSafePushEndpoint, "Push address must be a public https endpoint"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  test: z.boolean().optional(),
  testOnly: z.literal(false).optional(),
});

const subscribeSchema = z.union([testOnlySchema, fullSubscribeSchema]);

/** Turn on alerts for this phone/device (or send a test notification). */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    const body = subscribeSchema.parse(await req.json());

    if ("testOnly" in body && body.testOnly) {
      const result = await pushToPeople(user.organizationId, [user.userId], {
        title: "Alerts are on",
        body: "You will get Bothra CMS alerts on this device.",
        href: "/",
        tag: `push-test-${Date.now()}`,
      });
      return jsonSuccess({ subscribed: true, test: result }, 200);
    }

    const fullBody = body as z.infer<typeof fullSubscribeSchema>;
    const existing = await prisma.pushSubscription.findUnique({
      where: { endpoint: fullBody.endpoint },
      select: { id: true, organizationId: true, userId: true },
    });
    if (existing && (existing.organizationId !== user.organizationId || existing.userId !== user.userId)) {
      return jsonError("Push subscription endpoint belongs to another user", "FORBIDDEN", 403);
    }

    const userAgent = (req.headers.get("user-agent") || "").slice(0, 200) || null;
    const data = { organizationId: user.organizationId, userId: user.userId, p256dh: fullBody.keys.p256dh, auth: fullBody.keys.auth, userAgent, failures: 0 };
    await prisma.pushSubscription.upsert({ where: { endpoint: fullBody.endpoint }, create: { endpoint: fullBody.endpoint, ...data }, update: data });
    const result = fullBody.test
      ? await pushToPeople(user.organizationId, [user.userId], { title: "Alerts are on", body: "You will get Bothra CMS alerts on this device.", href: "/", tag: "push-test" })
      : null;
    return jsonSuccess({ subscribed: true, test: result }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

/** Turn off alerts for this phone. */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    const endpoint = req.nextUrl.searchParams.get("endpoint");
    const { count } = await prisma.pushSubscription.deleteMany({
      where: { organizationId: user.organizationId, userId: user.userId, ...(endpoint ? { endpoint } : {}) },
    });
    return jsonSuccess({ removed: count });
  } catch (error) {
    return handleApiError(error);
  }
}
