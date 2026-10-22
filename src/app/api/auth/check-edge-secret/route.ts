import { NextRequest } from "next/server";
import { getJwtSecret } from "@/lib/jwt-secret";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = getJwtSecret();
  const hashBuffer = await crypto.subtle.digest("SHA-256", new Uint8Array(secret).buffer as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const secretHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

  return new Response(JSON.stringify({
    runtime: "edge-middleware-check",
    secretHash,
    chars: [secret[0], secret[1], secret[2], secret[secret.length - 1]],
    len: secret.length,
    secretSample: String.fromCharCode(secret[0], secret[1], secret[2]) + "..." + String.fromCharCode(secret[secret.length - 2], secret[secret.length - 1]),
    hasEnv: Boolean(process.env.SESSION_SECRET),
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
