import { NextResponse } from "next/server";
import { ZodError } from "zod";

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

const NO_CACHE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export function jsonSuccess<T>(data: T, status = 200, headers?: HeadersInit) {
  const mergedHeaders = new Headers(headers);
  for (const [k, v] of Object.entries(NO_CACHE_HEADERS)) {
    if (!mergedHeaders.has(k)) {
      mergedHeaders.set(k, v);
    }
  }

  return NextResponse.json(
    {
      success: true,
      data,
    },
    { status, headers: mergedHeaders }
  );
}

export function jsonError(
  message: string,
  code = "BAD_REQUEST",
  status = 400,
  details?: any,
  headers?: HeadersInit
) {
  const mergedHeaders = new Headers(headers);
  for (const [k, v] of Object.entries(NO_CACHE_HEADERS)) {
    if (!mergedHeaders.has(k)) {
      mergedHeaders.set(k, v);
    }
  }

  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        details,
      },
    },
    { status, headers: mergedHeaders }
  );
}

export function handleApiError(error: unknown) {
  console.error("[API_ERROR]", error);

  if (error instanceof ZodError) {
    return jsonError("Validation error", "VALIDATION_ERROR", 422, error.flatten());
  }

  if (error && typeof error === "object" && "statusCode" in error && "code" in error) {
    const authErr = error as { message: string; statusCode: number; code: string };
    return jsonError(authErr.message, authErr.code, authErr.statusCode);
  }

  if (error instanceof Error) {
    if (error.message.startsWith("Forbidden:")) {
      return jsonError(error.message, "FORBIDDEN", 403);
    }
    if (error.message.startsWith("Unauthorized:")) {
      return jsonError(error.message, "UNAUTHORIZED", 401);
    }
    if (error.message.startsWith("NotFound:")) {
      return jsonError(error.message, "NOT_FOUND", 404);
    }
    const isProduction = process.env.NODE_ENV === "production";
    const isInternalLeak =
      error.message.includes("prisma") ||
      error.message.includes("PrismaClient") ||
      error.message.includes("SQLite") ||
      error.message.includes("sqlite3") ||
      error.message.includes("SELECT ") ||
      error.message.includes("INSERT ") ||
      error.message.includes("UPDATE ") ||
      error.message.includes("DELETE FROM") ||
      error.message.toLowerCase().includes("database unavailable") ||
      error.message.toLowerCase().includes("database connection") ||
      error.message.toLowerCase().includes("connection to database timed out");

    if (isInternalLeak) {
      const clientMessage = isProduction
        ? "An internal database error occurred. Please contact your system administrator."
        : error.message;
      return jsonError(clientMessage, "INTERNAL_ERROR", 500);
    }

    return jsonError(error.message, "BAD_REQUEST", 400);
  }

  return jsonError("An unexpected server error occurred", "SERVER_ERROR", 500);
}
