import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export async function POST(req: NextRequest): Promise<NextResponse>;
export async function POST(): Promise<NextResponse>;
export async function POST(req?: NextRequest): Promise<NextResponse> {
  const forwardedProto = req?.headers?.get("x-forwarded-proto");
  const isHttps = forwardedProto
    ? forwardedProto.split(",")[0].trim().toLowerCase() === "https"
    : req?.nextUrl?.protocol === "https:";

  const res = NextResponse.json({ success: true, message: "Logged out" });
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
