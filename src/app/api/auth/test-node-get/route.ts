import { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/jwt-secret";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = getJwtSecret();
  const token = req.nextUrl.searchParams.get("token") || "";
  let verifyErr = null;
  let payload = null;

  try {
    const res = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    payload = res.payload;
  } catch (err: any) {
    verifyErr = {
      name: err.name,
      code: err.code,
      message: err.message,
    };
  }

  const hashBuffer = await crypto.subtle.digest("SHA-256", new Uint8Array(secret).buffer as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const secretHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);

  return new Response(JSON.stringify({
    runtime: "nodejs-compare",
    secretHash,
    verifyErr,
    payload,
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
