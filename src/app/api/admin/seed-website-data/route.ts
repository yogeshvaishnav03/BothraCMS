import { NextRequest, NextResponse } from "next/server";
import { bootstrapWebsiteDataRuntime } from "@/lib/runtime-seeder";
import { loadWebsiteData } from "../../../../../scripts/load-website-data";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleSeed();
}

export async function POST(req: NextRequest) {
  return handleSeed();
}

async function handleSeed() {
  try {
    console.log("⚡ [SEED_ENDPOINT] Triggered website data seed...");
    
    // First try full load-website-data
    let result: any = null;
    try {
      result = await loadWebsiteData();
    } catch (fullLoadErr: any) {
      console.warn("Notice: full loader error, trying runtime seeder:", fullLoadErr?.message);
      const ok = await bootstrapWebsiteDataRuntime();
      result = { success: ok, mode: "runtime-fallback" };
    }

    return NextResponse.json({
      success: true,
      message: "Website data loaded successfully into database.",
      result,
    });
  } catch (error: any) {
    console.error("❌ [SEED_ENDPOINT] Seeding failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to seed website data",
      },
      { status: 500 }
    );
  }
}
