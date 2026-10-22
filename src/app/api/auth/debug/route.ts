import { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/jwt-secret";

export const dynamic = "force-dynamic";

/**
 * Diagnostic endpoint to verify JWT secret consistency between
 * Edge middleware and Node.js runtime on Vercel.
 */
export async function GET(req: NextRequest) {
  const secret = getJwtSecret();
  
  // Create a standard ArrayBuffer copy to satisfy TypeScript BufferSource
  const uint8Copy = new Uint8Array(secret);
  const hashBuffer = await crypto.subtle.digest("SHA-256", uint8Copy.buffer as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const secretHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  
  const token = req.nextUrl.searchParams.get("token");
  let tokenStatus = "no token provided";
  
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
      tokenStatus = `VALID - userId: ${payload.userId}, role: ${payload.role}`;
    } catch (err: any) {
      tokenStatus = `INVALID - ${err.message || err.code || "unknown error"}`;
    }
  }
  
  return new Response(
    JSON.stringify({
      secretHash: secretHash + "...",
      secretLength: secret.length,
      hasSessionSecret: Boolean(process.env.SESSION_SECRET),
      sessionSecretLength: process.env.SESSION_SECRET?.length || 0,
      nodeEnv: process.env.NODE_ENV,
      tokenStatus,
      timestamp: new Date().toISOString(),
    }, null, 2),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
