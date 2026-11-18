import { NextRequest, NextResponse } from "next/server";
import { getUserContext } from "@/lib/auth";
import { clearDemoData } from "../../../../../scripts/clear-demo-data";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleClear(req);
}

export async function POST(req: NextRequest) {
  return handleClear(req);
}

async function handleClear(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    // Allow if authenticated user with administrative role, or if confirm=true parameter is present
    const url = new URL(req.url);
    const hasConfirm = url.searchParams.get("confirm") === "true";

    if (!hasConfirm && user && user.role !== "SUPER_ADMIN" && user.role !== "ORG_ADMIN") {
      return NextResponse.json(
        { success: false, error: "Only administrators can clear demo data." },
        { status: 403 }
      );
    }

    console.log("🧹 [ADMIN_API] Clear demo data requested...");
    const result = await clearDemoData();

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to purge demo data." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "All demo data (sites, projects, stores, materials, bills, payments, workers) has been completely removed. Organizations and user accounts have been preserved for manual data entry.",
      details: result,
    });
  } catch (error: any) {
    console.error("❌ [ADMIN_API] Clear demo data failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to clear demo data",
      },
      { status: 500 }
    );
  }
}
