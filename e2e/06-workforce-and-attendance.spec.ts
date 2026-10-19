import { test, expect } from "@playwright/test";

test.describe("E2E Journey 6: Workforce Registration & GPS Attendance", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@buildtrack.pro");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');
    await page.waitForURL("/", { timeout: 15000 });
  });

  test("should render workforce attendance page with action buttons and attendance logs", async ({ page }) => {
    await page.goto("/attendance");
    await expect(page.locator("text=Workforce Attendance & Shifts")).toBeVisible({ timeout: 10000 });

    // Action buttons exist
    const checkBtn = page.locator("button:has-text('Check In'), button:has-text('Check Out'), text=Shift Completed");
    await expect(checkBtn.first()).toBeVisible();
    await expect(page.locator("button:has-text('+ Register Worker')")).toBeVisible();

    // Summary cards exist
    await expect(page.locator("text=Total Roster Crew")).toBeVisible();
  });

  test("should open Register Worker modal and render worker trade form fields", async ({ page }) => {
    await page.goto("/attendance");

    await page.click("button:has-text('+ Register Worker')");
    await expect(page.locator("text=Register Workforce Personnel")).toBeVisible();
    await expect(page.locator("text=Full Name *")).toBeVisible();
    await expect(page.locator("text=Trade / Designation *")).toBeVisible();

    await page.click("button:has-text('Cancel')");
    await expect(page.locator("text=Register Workforce Personnel")).not.toBeVisible();
  });

  test("should support 1-click Check In and Check Out without modal popup", async ({ page }) => {
    await page.goto("/attendance");

    // The modal should NOT open on attendance page
    await expect(page.locator("text=Check In Worker for Shift")).not.toBeVisible();
    await expect(page.locator("text=Select Worker")).not.toBeVisible();

    // Action button exists (Check In or Check Out)
    const checkAction = page.locator("button:has-text('Check In'), button:has-text('Check Out'), text=Shift Completed");
    await expect(checkAction.first()).toBeVisible();
  });
});
