import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { pushKeys, pushToPeople } from "@/lib/push";

export const dynamic = "force-dynamic";

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
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "Push address must be https"),
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
