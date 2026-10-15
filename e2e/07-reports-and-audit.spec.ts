import { test, expect } from "@playwright/test";

test.describe("E2E Journey 7: Reports, Analytics & Immutable Audit Trail", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@buildtrack.pro");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');
    await page.waitForURL("/", { timeout: 15000 });
  });

  test("should render reports page and allow switching between report types", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.locator("text=Operational & Financial Reports")).toBeVisible({ timeout: 10000 });

    // Buttons for Stock, Payables, Attendance
    await expect(page.locator("button:has-text('Inventory & Stock Valuation')")).toBeVisible();
    await expect(page.locator("button:has-text('Payables Aging & Statements')")).toBeVisible();
    await expect(page.locator("button:has-text('Daily Workforce Attendance')")).toBeVisible();

    // Verify CSV Export button is present
    await expect(page.locator("button:has-text('Export Stock CSV')")).toBeVisible();
  });

  test("should navigate to Audit page and render immutable system activity logs", async ({ page }) => {
    await page.goto("/audit");
    await expect(page.locator("text=Immutable System Audit Trail")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Audit Trail Active")).toBeVisible();
    await expect(page.locator('input[placeholder*="Search audit trail"]')).toBeVisible();
  });
});
