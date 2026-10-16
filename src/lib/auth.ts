import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { prisma } from "./db";
import { Role } from "./permissions";

import { getJwtSecret } from "./jwt-secret";
export { getJwtSecret };

const SESSION_COOKIE_NAME = "buildtrack_session";

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
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), { algorithms: ["HS256"] });
    if (!payload.userId || !payload.organizationId || !payload.role) {
      return null;
    }
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

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { organization: true },
    });

    if (
      user &&
      user.status === "ACTIVE" &&
      user.organization &&
      user.organization.status === "ACTIVE" &&
      user.organizationId === session.organizationId
    ) {
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

    return null;
  } catch (err) {
    console.error("[AUTH] Database check failed for session:", err);
    return null;
  }
}

export { SESSION_COOKIE_NAME };
