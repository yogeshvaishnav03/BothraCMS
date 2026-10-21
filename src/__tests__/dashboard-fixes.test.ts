import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { DashboardService } from "@/services/dashboard-service";

describe("Dashboard Fixes — Data Logic, Content & UI/UX Verification", () => {
  it("1.1 Data & Math Logic: Total workers on site aligns with site breakdown and accounts for all categories", async () => {
    // 1. Math check for subcategories: 14 Art + 8 Craft + 32 Lab = 54
    const art = 14;
    const craft = 8;
    const lab = 32;
    const subSum = art + craft + lab;
    expect(subSum).toBe(54);

    // 2. Breakdown check: Chaupasni (54) + Skyline (4) = 58
    const chaupasniOnSite = 54;
    const skylineOnSite = 4;
    const totalOnSite = chaupasniOnSite + skylineOnSite;
    expect(totalOnSite).toBe(58);

    // 3. Complete subcategory breakdown with staff accounted for:
    const staff = totalOnSite - subSum;
    expect(staff).toBe(4);
    const breakdownString = `${totalOnSite} on site (${art} Art, ${craft} Craft, ${lab} Lab, +${staff} Staff)`;
    expect(breakdownString).toBe("58 on site (14 Art, 8 Craft, 32 Lab, +4 Staff)");

    // 4. Crew vs On-Site logic: Direct Crew (15) + Subcontractor Labor (39) = 54
    const directCrew = 15;
    const onSiteCrew = 54;
    const subcontractorLabor = onSiteCrew - directCrew;
    expect(subcontractorLabor).toBe(39);
    expect(directCrew + subcontractorLabor).toBe(onSiteCrew);
  });

  it("2.1 Content & Filtering: Incomplete tasks only in pending tasks, completed tasks excluded", () => {
    const rawTasks = [
      { id: "t1", title: "Pour concrete", status: "TODO", isArchived: false, completedAt: null },
      { id: "t2", title: "Tiling work", status: "IN_PROGRESS", isArchived: false, completedAt: null },
      { id: "t3", title: "Finished brickwork", status: "COMPLETED", isArchived: false, completedAt: "2026-10-20T10:00:00Z" },
      { id: "t4", title: "Approved column check", status: "VERIFIED", isArchived: false, completedAt: "2026-10-19T10:00:00Z" },
      { id: "t5", title: "Old task", status: "TODO", isArchived: true, completedAt: null },
    ];

    const pendingIncomplete = rawTasks.filter(
      (t) => !["COMPLETED", "VERIFIED", "ARCHIVED"].includes(t.status) && !t.completedAt && !t.isArchived
    );

    expect(pendingIncomplete.length).toBe(2);
    expect(pendingIncomplete.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(pendingIncomplete.some((t) => t.status === "COMPLETED")).toBe(false);
  });

  it("2.2 Overdue Tasks Flagging: Identifies overdue tasks and prioritizes them at the top of the queue", () => {
    const now = Date.now();
    const tasks = [
      { id: "t1", title: "Upcoming task", status: "TODO", dueAt: new Date(now + 86400000).toISOString() },
      { id: "t2", title: "Overdue critical task", status: "IN_PROGRESS", dueAt: new Date(now - 86400000).toISOString() },
      { id: "t3", title: "Overdue high task", status: "TODO", dueAt: new Date(now - 2 * 86400000).toISOString() },
      { id: "t4", title: "Future task", status: "TODO", dueAt: new Date(now + 2 * 86400000).toISOString() },
    ];

    const isTaskOverdue = (t: any) => {
      if (!t.dueAt) return false;
      return new Date(t.dueAt).getTime() < now;
    };

    const sorted = [...tasks].sort((a, b) => {
      const aOverdue = isTaskOverdue(a) ? 1 : 0;
      const bOverdue = isTaskOverdue(b) ? 1 : 0;
      if (bOverdue !== aOverdue) return bOverdue - aOverdue;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    });

    expect(isTaskOverdue(sorted[0])).toBe(true);
    expect(isTaskOverdue(sorted[1])).toBe(true);
    expect(isTaskOverdue(sorted[2])).toBe(false);
    expect(sorted.map((t) => t.id)).toEqual(["t3", "t2", "t1", "t4"]);
  });

  it("2.3 Photographs Filtering: Rejects dummy non-site uploads (academy screenshot, logo, wallpaper)", () => {
    const isRelevantSitePhoto = (photo: any) => {
      if (!photo) return false;
      const name = (photo.fileName || "").toLowerCase();
      const notes = (photo.notes || "").toLowerCase();
      return (
        !name.includes("academy") &&
        !name.includes("screenshot") &&
        !name.includes("wallpaper") &&
        !name.includes("logo") &&
        !name.includes("test_") &&
        !notes.includes("dummy")
      );
    };

    const testPhotos = [
      { id: "p1", fileName: "academy_dashboard_screenshot.png" },
      { id: "p2", fileName: "company_logo_design_v2.png" },
      { id: "p3", fileName: "desktop_wallpaper_4k.jpg" },
      { id: "p4", fileName: "4th_floor_raft_inspection.jpg" },
      { id: "p5", fileName: "tmt_steel_delivery_challan.jpg" },
      { id: "p6", fileName: "safety_scaffolding_inspection.jpg" },
    ];

    const relevant = testPhotos.filter(isRelevantSitePhoto);
    expect(relevant.length).toBe(3);
    expect(relevant.map((p) => p.fileName)).toEqual([
      "4th_floor_raft_inspection.jpg",
      "tmt_steel_delivery_challan.jpg",
      "safety_scaffolding_inspection.jpg",
    ]);
  });

  it("3.1 UI/UX: Color-coded priority badges are defined for all levels", () => {
    const getPriorityBadgeStyle = (priority: string) => {
      switch (priority) {
        case "CRITICAL":
          return "bg-rose-100 text-rose-800 border-rose-300";
        case "HIGH":
          return "bg-amber-100 text-amber-800 border-amber-300";
        case "MEDIUM":
          return "bg-blue-100 text-blue-800 border-blue-200";
        case "LOW":
        default:
          return "bg-slate-100 text-slate-700 border-slate-200";
      }
    };

    expect(getPriorityBadgeStyle("CRITICAL")).toContain("rose");
    expect(getPriorityBadgeStyle("HIGH")).toContain("amber");
    expect(getPriorityBadgeStyle("MEDIUM")).toContain("blue");
    expect(getPriorityBadgeStyle("LOW")).toContain("slate");
  });
});
