import { test, expect } from "@playwright/test";

test.describe("E2E Journey 2: Super Admin Dashboard & Multi-Tenant Access Control", () => {
  test("should deny non-superadmin access to the /admin route with Restricted Platform Administration banner", async ({ page }) => {
    // Login as ORG_ADMIN
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@buildtrack.pro");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');
    await page.waitForURL("/", { timeout: 15000 });

    // Super Admin link should NOT exist in navigation for ORG_ADMIN
    await expect(page.locator('a[href="/admin"]')).not.toBeVisible();

    // Navigate directly to /admin
    await page.goto("/admin");

    // Must show Restricted Platform Administration UI
    await expect(page.locator("text=Restricted Platform Administration")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=require global SUPER_ADMIN credentials")).toBeVisible();

    // Tenant administration table must NOT be accessible
    await expect(page.locator("text=Super Admin Tenant Directory")).not.toBeVisible();
  });

  test("should allow Super Admin to access /admin, view tenant metrics and table", async ({ page, isMobile }) => {
    // Login as SUPER_ADMIN
    await page.goto("/login");
    await page.fill('input[type="email"]', "superadmin@buildtrack.pro");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');
    await page.waitForURL("/", { timeout: 15000 });

    // Super Admin link should be visible in navigation
    if (isMobile) {
      const mobileMenuBtn = page.locator("header.lg\\:hidden button").last();
      await mobileMenuBtn.click();
      await expect(page.getByRole("link", { name: "Super Admin" })).toBeVisible();
    } else {
      await expect(page.locator('aside a[href="/admin"]')).toBeVisible();
    }

    // Navigate to /admin
    await page.goto("/admin");

    // Super Admin header and metric cards
    await expect(page.locator("text=Super Admin Tenant Directory")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Total Organizations")).toBeVisible();
    await expect(page.locator("text=Active Tenants")).toBeVisible();

    // Verify tenant rows are rendered
    await expect(page.getByRole("cell", { name: "Apex Infrastructure & Builders" })).toBeVisible();
  });
});
