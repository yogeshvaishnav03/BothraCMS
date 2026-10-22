import { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/jwt-secret";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("buildtrack_session")?.value;
  const auth = req.headers.get("authorization");
  const token = cookie || (auth?.startsWith("Bearer ") ? auth.slice(7) : null);

  const secret = getJwtSecret();
  let errorDetail = null;
  let payload = null;

  if (token) {
    try {
      const result = await jwtVerify(token, secret, { algorithms: ["HS256"] });
      payload = result.payload;
    } catch (err: any) {
      errorDetail = {
        message: err.message,
        code: err.code,
        name: err.name,
        stack: err.stack,
      };
    }
  }

  return new Response(
    JSON.stringify({
      hasToken: Boolean(token),
      tokenLength: token?.length,
      payload,
      errorDetail,
      secretLength: secret.length,
      cookiePresent: Boolean(cookie),
      authHeaderPresent: Boolean(auth),
      allCookies: req.cookies.getAll().map(c => c.name),
    }, null, 2),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
