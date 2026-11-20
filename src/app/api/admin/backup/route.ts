import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow 60s for full database export

const ALLOWED_ADMIN_ROLES = ["SUPER_ADMIN", "ORG_ADMIN", "ADMIN", "OWNER"];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token") || req.headers.get("x-backup-token") || req.headers.get("authorization")?.replace("Bearer ", "");

    let user: any = null;
    try {
      user = await getUserContext(req);
    } catch {
      user = null;
    }

    const sessionSecret = process.env.SESSION_SECRET || "";
    const isTokenAuthorized = Boolean(token && sessionSecret && token === sessionSecret);
    const isUserAuthorized = Boolean(user && ALLOWED_ADMIN_ROLES.includes(user.role));

    if (!isUserAuthorized && !isTokenAuthorized) {
      return jsonError("Unauthorized: Super Admin or Org Admin privileges required to download database backup", "UNAUTHORIZED", 401);
    }

    const startTime = Date.now();
    const tables: Record<string, any[]> = {};
    const tableCounts: Record<string, number> = {};

    // Collect all data delegates from Prisma safely
    for (const [modelKey, delegate] of Object.entries(prisma)) {
      if (
        typeof (delegate as any)?.findMany === "function" &&
        !modelKey.startsWith("$") &&
        !modelKey.startsWith("_")
      ) {
        try {
          const records = await (delegate as any).findMany();
          if (Array.isArray(records)) {
            // Sanitize sensitive password hash from user records
            if (modelKey.toLowerCase() === "user") {
              tables[modelKey] = records.map((u: any) => {
                const { password, ...rest } = u;
                return rest;
              });
            } else {
              tables[modelKey] = records;
            }
            tableCounts[modelKey] = records.length;
          }
        } catch (err: any) {
          console.warn(`[BACKUP NOTICE] Could not query table ${modelKey}:`, err?.message || err);
        }
      }
    }

    const totalRecords = Object.values(tableCounts).reduce((acc, curr) => acc + curr, 0);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dateFormatted = new Date().toISOString().slice(0, 10);

    const backupPayload = {
      version: "1.0.0",
      system: "BothraCMS / BuildTrack Pro",
      company: "Bothra Construction Group / Bothra Infrastructure & Builders",
      exportedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      exportedBy: user ? { id: user.id, name: user.name, role: user.role, email: user.email } : "API Token",
      summary: {
        totalTables: Object.keys(tableCounts).length,
        totalRecords,
        tables: tableCounts,
      },
      data: tables,
    };

    const jsonString = JSON.stringify(backupPayload, null, 2);
    const sha256Checksum = crypto.createHash("sha256").update(jsonString).digest("hex");

    // Attach checksum to top level
    const finalPayload = {
      checksum: sha256Checksum,
      ...backupPayload,
    };

    const finalJsonString = JSON.stringify(finalPayload, null, 2);
    const fileName = `bothra_cms_database_backup_${dateFormatted}_${timestamp}.json`;

    return new NextResponse(finalJsonString, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Backup-Checksum": sha256Checksum,
        "X-Backup-Records": String(totalRecords),
        "X-Backup-Tables": String(Object.keys(tableCounts).length),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
