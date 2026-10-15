import { test, expect } from "@playwright/test";

test.describe("E2E Journey 3: Construction Projects & Site Operations", () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate as ORG_ADMIN
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@buildtrack.pro");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');
    await page.waitForURL("/", { timeout: 15000 });
  });

  test("should render projects directory with active projects and metrics", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.locator("text=Construction Projects & Sites")).toBeVisible({ timeout: 10000 });

    // Verify project cards exist
    await expect(page.locator("text=Tower A Structural Frame")).toBeVisible();
    await expect(page.locator("text=Approved Budget").first()).toBeVisible();
  });

  test("should open project detail view and render financial analytics and operational tabs", async ({ page }) => {
    await page.goto("/projects");

    // Click on the first project detail link
    const firstProjectLink = page.locator('a[href^="/projects/"]').first();
    await expect(firstProjectLink).toBeVisible();
    await firstProjectLink.click();

    // Verify project header and KPI cards
    await expect(page.locator("text=Project Budget")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Total Billed")).toBeVisible();
    await expect(page.locator("text=Budget Utilization")).toBeVisible();

    // Verify operational tabs exist
    await expect(page.locator("text=Daily Site Reports").first()).toBeVisible();
    await expect(page.locator("text=Tasks & Work Orders").first()).toBeVisible();
    await expect(page.locator("text=Material Consumption").first()).toBeVisible();
  });

  test("should navigate to Tasks page and display task tracking board", async ({ page }) => {
    await page.goto("/tasks");
    await expect(page.locator("text=Site Tasks & Daily Work Tracking")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=+ Create Site Task")).toBeVisible();
    await expect(page.locator("text=Update Status").first()).toBeVisible();
  });
});
