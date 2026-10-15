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

export function jsonSuccess<T>(data: T, status = 200, headers?: HeadersInit) {
  return NextResponse.json(
    {
      success: true,
      data,
    },
    { status, headers }
  );
}

export function jsonError(
  message: string,
  code = "BAD_REQUEST",
  status = 400,
  details?: any
) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        details,
      },
    },
    { status }
  );
}

export function handleApiError(error: unknown) {
  console.error("[API_ERROR]", error);

  if (error instanceof ZodError) {
    return jsonError("Validation error", "VALIDATION_ERROR", 422, error.flatten());
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
      error.message.includes("DELETE FROM");

    const clientMessage = isProduction && isInternalLeak
      ? "An internal database error occurred. Please contact your system administrator."
      : error.message;

    return jsonError(clientMessage, "INTERNAL_ERROR", 400);
  }

  return jsonError("An unexpected server error occurred", "SERVER_ERROR", 500);
}
