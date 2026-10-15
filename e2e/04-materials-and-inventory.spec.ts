import { test, expect } from "@playwright/test";

test.describe("E2E Journey 4: Materials Inventory & Stock Management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@buildtrack.pro");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');
    await page.waitForURL("/", { timeout: 15000 });
  });

  test("should render materials directory with inventory cards and action buttons", async ({ page }) => {
    await page.goto("/materials");
    await expect(page.locator("text=Materials Master & Site Inventory")).toBeVisible({ timeout: 10000 });

    // Verify action buttons exist
    await expect(page.locator("button:has-text('+ Goods Receipt')")).toBeVisible();
    await expect(page.locator("button:has-text('- Issue Stock')")).toBeVisible();
    await expect(page.locator("button:has-text('Transfer Stock')")).toBeVisible();

    // Verify stock items exist
    await expect(page.locator("text=Tata Tiscon Fe550D TMT Rebar 12mm")).toBeVisible();
  });

  test("should open Receive Stock modal, render form fields, and close cleanly", async ({ page }) => {
    await page.goto("/materials");

    // Click Receive Stock
    await page.click("button:has-text('+ Goods Receipt')");

    // Modal should be visible
    await expect(page.locator("text=Receive Goods into Site Store")).toBeVisible();
    await expect(page.locator("text=Select Material")).toBeVisible();
    await expect(page.locator("text=Receiving Store / Yard")).toBeVisible();

    // Close modal
    await page.click("button:has-text('Cancel')");
    await expect(page.locator("text=Receive Goods into Site Store")).not.toBeVisible();
  });

  test("should open Transfer Stock modal and render source and target store selectors", async ({ page }) => {
    await page.goto("/materials");

    // Click Transfer Stock
    await page.click("button:has-text('Transfer Stock')");

    // Modal should be visible
    await expect(page.locator("text=Transfer Stock Across Stores")).toBeVisible();
    await expect(page.locator("text=Source Store (From)")).toBeVisible();

    // Close modal
    await page.click("button:has-text('Cancel')");
    await expect(page.locator("text=Transfer Stock Across Stores")).not.toBeVisible();
  });
});
