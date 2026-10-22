import { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/jwt-secret";

export const dynamic = "force-dynamic";

/**
 * Diagnostic endpoint to verify what getJwtSecret() returns
 * in Node.js runtime vs what token verification sees.
 */
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    const secret = getJwtSecret();
    const hashBuffer = await crypto.subtle.digest("SHA-256", new Uint8Array(secret).buffer as ArrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const secretHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);

    let verifyError = null;
    let payload = null;

    try {
      const res = await jwtVerify(token, secret, { algorithms: ["HS256"] });
      payload = res.payload;
    } catch (err: any) {
      verifyError = {
        name: err.name,
        code: err.code,
        message: err.message,
      };
    }

    return new Response(JSON.stringify({
      runtime: "nodejs",
      secretHash,
      secretLength: secret.length,
      hasSessionSecret: Boolean(process.env.SESSION_SECRET),
      sessionSecretLength: process.env.SESSION_SECRET?.length || 0,
      verifyError,
      payload,
    }, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
