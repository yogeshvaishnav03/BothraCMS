import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Public health endpoint for monitoring.
 *
 * SECURITY INVARIANTS:
 * - Returns minimal, stable response
 * - Never exposes: database hostnames, error messages, env var names, credentials
 * - Detailed diagnostics only in protected operational logs
 * - Consistent response format regardless of failure mode
 */

// Redacted log for internal use only (never exposed to client)
async function logDetailedHealthCheck(status: "ok" | "error", details?: any) {
  try {
    // This would integrate with your actual logging service
    // Never send this to the HTTP response
    if (process.env.NODE_ENV === "production") {
      // In production, send to secure logging service (CloudWatch, Datadog, etc.)
      // with sensitive fields redacted
      console.error("[HEALTH_CHECK_INTERNAL]", {
        status,
        timestamp: new Date().toISOString(),
        // Redacted details - never include raw error messages or hostnames
        error: details?.errorType || "unknown",
        code: details?.code,
      });
    } else {
      // Development: more verbose internal logging
      console.log("[HEALTH_CHECK_DEV]", { status, details });
    }
  } catch (logErr) {
    // Ignore logging failures to prevent cascading errors
    console.error("[HEALTH_CHECK_LOG_ERROR]", logErr);
  }
}

export async function GET() {
  try {
    // Perform health check against database
    await prisma.$queryRaw`SELECT 1`;

    // Return healthy response
    return NextResponse.json({
      status: "ok",
      database: "connected",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    // Log detailed error internally for debugging (never expose to client)
    await logDetailedHealthCheck("error", {
      errorType: error?.name || "unknown",
      code: error?.code,
      message: error?.message ? error.message.substring(0, 50) : "database error", // Truncate
    });

    // Return generic unhealthy response without diagnostics
    // Same structure regardless of failure mode to prevent information disclosure
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        // NEVER include:
        // - error.message
        // - database hostnames or connection details
        // - environment variable names (DATABASE_URL, POSTGRES_PRISMA_URL, etc.)
        // - which config source supplied the value
        // - error codes or raw database errors
        // - credentials or infrastructure details
      },
      { status: 503 } // Service Unavailable when dependency is unhealthy
    );
  }
}
