import { test, expect } from "@playwright/test";

test.describe("E2E Journey 8: Mobile Responsiveness & Endpoint Security", () => {
  test("should enforce responsive layout on mobile viewport and toggle mobile navigation", async ({ page }) => {
    // Set mobile viewport (Pixel 5)
    await page.setViewportSize({ width: 393, height: 851 });

    // Login on mobile
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@buildtrack.pro");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');
    await page.waitForURL("/", { timeout: 15000 });

    // Desktop sidebar should be hidden
    await expect(page.locator("aside.hidden.lg\\:flex")).toBeHidden();

    // Mobile header should be visible
    const mobileHeader = page.locator("header.lg\\:hidden");
    await expect(mobileHeader).toBeVisible();
    await expect(mobileHeader.getByText("Build Track")).toBeVisible();

    // Mobile navigation toggle button
    const mobileMenuBtn = mobileHeader.locator("button").last();
    await expect(mobileMenuBtn).toBeVisible();
    await mobileMenuBtn.click();
    await expect(page.locator("text=Menu Navigation")).toBeVisible();
  });

  test("should enforce 401 Unauthorized on sensitive APIs when called without session", async ({ request }) => {
    // Unauthenticated GET request to finance
    const resBills = await request.get("/api/finance/bills");
    expect(resBills.status()).toBe(401);
    const jsonBills = await resBills.json();
    expect(jsonBills.success).toBe(false);

    // Unauthenticated GET request to admin tenants
    const resTenants = await request.get("/api/admin/tenants");
    expect(resTenants.status()).toBe(401);
    const jsonTenants = await resTenants.json();
    expect(jsonTenants.success).toBe(false);

    // Unauthenticated GET request to uploads
    const resUploads = await request.get("/api/uploads");
    expect(resUploads.status()).toBe(401);
    const jsonUploads = await resUploads.json();
    expect(jsonUploads.success).toBe(false);
  });
});
