import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/api-response";

const REF = /^[A-Za-z0-9-]{8,80}$/;
const KEEP_DAYS = 30;
/** A send still marked "being handled" after this long died half way; let a retry take over. */
const STALE_MS = 2 * 60_000;

function replay(status: number, body: string | null) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Offline-Replay": "1" },
  });
}

/**
 * Runs a request saved on a phone (it carries an `X-Offline-Ref` header) only
 * once. If the phone sends it again because the reply never reached it, the
 * first reply is returned and nothing is created twice. Requests without the
 * header run as normal.
 */
export async function onceOnly(
  req: Request,
  user: { organizationId: string; userId: string },
  run: () => Promise<Response>
): Promise<Response> {
  const ref = req.headers.get("x-offline-ref");
  if (!ref || !REF.test(ref)) return run();
  const route = new URL(req.url).pathname;

  try {
    await prisma.offlineSend.create({ data: { ref, organizationId: user.organizationId, userId: user.userId, route } });
  } catch (e: any) {
    if (e?.code !== "P2002") throw e;
    const prev = await prisma.offlineSend.findUnique({ where: { ref } });
    if (!prev || prev.organizationId !== user.organizationId || prev.userId !== user.userId || prev.route !== route) {
      return jsonError("This saved item was already used for something else.", "REF_IN_USE", 409);
    }
    if (prev.status) return replay(prev.status, prev.response);
    if (Date.now() - prev.createdAt.getTime() < STALE_MS) {
      // The first send is still being handled. 503 tells the phone to try again later.
      return jsonError("Still being saved. It will be checked again shortly.", "IN_PROGRESS", 503);
    }
    await prisma.offlineSend.update({ where: { ref }, data: { createdAt: new Date() } });
  }

  const forget = () => prisma.offlineSend.delete({ where: { ref } }).catch(() => {});
  let res: Response;
  try {
    res = await run();
  } catch (e) {
    await forget();
    throw e;
  }
  if (!res.ok) {
    // Refused: nothing was saved, so a corrected retry may run.
    await forget();
    return res;
  }
  await prisma.offlineSend.update({ where: { ref }, data: { status: res.status, response: await res.clone().text() } });
  if (Math.random() < 0.02) {
    prisma.offlineSend.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 86_400_000) } } }).catch(() => {});
  }
  return res;
}
