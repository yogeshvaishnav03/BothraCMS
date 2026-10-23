import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/db";
import { getJwtSecret } from "@/lib/jwt-secret";
import { channels, indianMobile, messagingSettings, MessagingError, sendSignInCode } from "@/lib/messaging";

/**
 * Buyers sign in to their page with a one-time code sent to the mobile number
 * on their booking. A signed-in buyer sees every active booking on that number.
 */

export const BUYER_COOKIE = "bothra_buyer";
const AUDIENCE = "buyer-portal";
const CODE_MINUTES = 10;
const MAX_TRIES = 5;
const MAX_CODES = 3; // per mobile in 15 minutes
const SIGNED_IN_DAYS = 30;

export class BuyerSignInError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
    public code = "SIGN_IN"
  ) {
    super(message);
  }
}

const hash = (phone: string, code: string) => createHmac("sha256", getJwtSecret()).update(`${phone}:${code}`).digest("hex");
const masked = (phone: string) => `+91 ${phone.slice(2, 4)}XXX XX${phone.slice(-3)}`;

/** Active bookings whose mobile number is this one (91 + 10 digits). */
async function bookingsOn(phone: string) {
  const rows = await prisma.salesBooking.findMany({
    where: { status: "ACTIVE", customerPhone: { contains: phone.slice(-4) } },
    include: { unit: { include: { project: { select: { name: true } } } }, organization: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.filter((b) => indianMobile(b.customerPhone) === phone);
}

export async function requestCode(rawPhone: string) {
  const phone = indianMobile(rawPhone);
  if (!phone) throw new BuyerSignInError("Enter your 10-digit mobile number.");
  const bookings = await bookingsOn(phone);
  if (bookings.length === 0) throw new BuyerSignInError("We could not find a booking with this mobile number. Ask the sales office to check the number on your booking.", 404, "NO_BOOKING");
  // Send through the first builder (usually the only one) that has messages set up.
  let organizationId: string | null = null;
  for (const orgId of Array.from(new Set(bookings.map((b) => b.organizationId)))) {
    if (channels(await messagingSettings(orgId)).otp) {
      organizationId = orgId;
      break;
    }
  }
  if (!organizationId) throw new MessagingError("Sign-in by code is not switched on yet. Use the link the sales office sent you.", 503, "MESSAGING_OFF");
  const recent = await prisma.buyerSignInCode.count({ where: { phone, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } } });
  if (recent >= MAX_CODES) throw new BuyerSignInError("Too many codes asked for. Try again in 15 minutes.", 429, "TOO_MANY");

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.buyerSignInCode.updateMany({ where: { phone, usedAt: null }, data: { usedAt: new Date() } });
  const row = await prisma.buyerSignInCode.create({ data: { organizationId, phone, codeHash: hash(phone, code), expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000) } });
  const company = bookings.find((b) => b.organizationId === organizationId)!.organization.name;
  const sent = await sendSignInCode(organizationId, phone, code, company);
  if (!sent.ok) {
    await prisma.buyerSignInCode.delete({ where: { id: row.id } });
    throw new BuyerSignInError(`We could not send the code just now. Try again in a minute, or use the link the sales office sent you.`, 502, "SEND_FAILED");
  }
  return { sentTo: masked(phone), minutes: CODE_MINUTES };
}

/** Checks the code. Returns a signed token to keep in the buyer's cookie. */
export async function verifyCode(rawPhone: string, rawCode: string) {
  const phone = indianMobile(rawPhone);
  const code = (rawCode || "").replace(/\D/g, "");
  if (!phone || code.length !== 6) throw new BuyerSignInError("Enter the 6-digit code.");
  const row = await prisma.buyerSignInCode.findFirst({ where: { phone, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (!row || row.attempts >= MAX_TRIES) throw new BuyerSignInError("This code has expired. Ask for a new one.", 400, "EXPIRED");
  const good = timingSafeEqual(Buffer.from(row.codeHash, "hex"), Buffer.from(hash(phone, code), "hex"));
  if (!good) {
    const tries = row.attempts + 1;
    await prisma.buyerSignInCode.update({ where: { id: row.id }, data: { attempts: tries, ...(tries >= MAX_TRIES ? { usedAt: new Date() } : {}) } });
    const left = MAX_TRIES - tries;
    throw new BuyerSignInError(left > 0 ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.` : "That code is not right. Ask for a new one.", 400, "WRONG_CODE");
  }
  await prisma.buyerSignInCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  const token = await new SignJWT({ phone }).setProtectedHeader({ alg: "HS256" }).setAudience(AUDIENCE).setIssuedAt().setExpirationTime(`${SIGNED_IN_DAYS}d`).sign(getJwtSecret());
  return { token, maxAge: SIGNED_IN_DAYS * 86400, homes: await homesFor(phone) };
}

/** The signed-in buyer's mobile (91 + 10 digits) from their cookie, or null. */
export async function buyerPhone(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), { algorithms: ["HS256"], audience: AUDIENCE });
    return typeof payload.phone === "string" ? payload.phone : null;
  } catch {
    return null;
  }
}

/** Every home on this mobile, each with its page link (made if the office never sent one). */
export async function homesFor(phone: string) {
  const bookings = await bookingsOn(phone);
  const homes = [];
  for (const b of bookings) {
    let token = b.portalToken;
    if (!token) {
      token = randomBytes(24).toString("base64url");
      await prisma.salesBooking.update({ where: { id: b.id }, data: { portalToken: token } });
    }
    homes.push({ token, bookingNumber: b.bookingNumber, customerName: b.customerName, unitNumber: b.unit.unitNumber, unitType: b.unit.unitType, project: b.unit.project.name, company: b.organization.name });
  }
  return homes;
}

/**
 * May this visitor see the page behind this link?
 * OK, SIGN_IN (the builder asks buyers to sign in and this one has not, or
 * signed in with another number) or null (no such page).
 */
export async function portalGate(portalToken: string, signedInPhone: string | null) {
  if (!portalToken || portalToken.length < 20) return null;
  const b = await prisma.salesBooking.findUnique({ where: { portalToken }, select: { organizationId: true, status: true, customerPhone: true } });
  if (!b || b.status !== "ACTIVE") return null;
  const s = await messagingSettings(b.organizationId);
  if (!s.buyerSignIn) return "OK" as const;
  return signedInPhone && indianMobile(b.customerPhone) === signedInPhone ? ("OK" as const) : ("SIGN_IN" as const);
}
