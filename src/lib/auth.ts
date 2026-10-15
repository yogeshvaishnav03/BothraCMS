import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { prisma } from "./db";
import { Role } from "./permissions";

const SESSION_COOKIE_NAME = "buildtrack_session";

export function getJwtSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!secret || secret === "build_track_pro_fallback_session_secret_32chars" || secret.trim().length < 32) {
      throw new Error(
        "FATAL PRODUCTION CONFIGURATION ERROR: SESSION_SECRET is missing, insecure, or shorter than 32 characters. Production startup aborted to prevent token forgery."
      );
    }
  }
  return new TextEncoder().encode(secret || "build_track_pro_fallback_session_secret_32chars");
}

const JWT_SECRET = getJwtSecret();

export interface SessionPayload {
  userId: string;
  organizationId: string;
  email: string;
  name: string;
  role: Role;
}

export interface UserContext extends SessionPayload {
  organizationName: string;
  currency: string;
  timezone: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ["HS256"] });
    return {
      userId: payload.userId as string,
      organizationId: payload.organizationId as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;
    return verifySessionToken(token);
  } catch {
    return null;
  }
}

export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const token =
    req.cookies.get(SESSION_COOKIE_NAME)?.value ||
    req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifySessionToken(token);
}

export async function getUserContext(req?: NextRequest): Promise<UserContext | null> {
  const session = req ? await getSessionFromRequest(req) : await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { organization: true },
  });

  if (!user || user.status !== "ACTIVE" || user.organization.status !== "ACTIVE") {
    return null;
  }

  return {
    userId: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    organizationName: user.organization.name,
    currency: user.organization.currency,
    timezone: user.organization.timezone,
  };
}

export { SESSION_COOKIE_NAME };
