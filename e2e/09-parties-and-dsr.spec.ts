import { test, expect } from "@playwright/test";

test.describe("E2E Journey 9: Parties Ledger, Site Selection & Daily Site Reports", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@buildtrack.pro");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');
    await page.waitForURL("/", { timeout: 15000 });
  });

  test("should render vendors and contractors directory and allow navigation to party statement", async ({ page }) => {
    await page.goto("/parties");
    await expect(page.locator("text=Vendors & Contractors Directory")).toBeVisible({ timeout: 10000 });

    // Verify vendor list items exist
    await expect(page.locator("text=Asian Paints Ltd")).toBeVisible();
    await expect(page.locator("text=Outstanding Balance").first()).toBeVisible();

    // Click Open Ledger & Bills
    const firstStatementLink = page.locator('a[href^="/parties/"]').first();
    await expect(firstStatementLink).toBeVisible();
    await firstStatementLink.click();

    // Verify statement page
    await expect(page.locator("text=Vendor / Contractor Financial Statement")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Total Invoiced / Billed")).toBeVisible();
    await expect(page.locator("text=Print / Save as PDF")).toBeVisible();
  });

  test("should switch between Projects & Sites and Daily Site Reports tabs on /projects", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.locator("text=Construction Projects & Sites")).toBeVisible({ timeout: 10000 });

    // Buttons exist
    await expect(page.locator("button:has-text('+ Submit Daily Report')")).toBeVisible();

    // Click Daily Site Reports tab
    await page.click("button:has-text('Daily Site Reports')");
    await expect(page.locator("th:has-text('Progress Summary')")).toBeVisible({ timeout: 10000 });

    // Switch back to Active Projects
    await page.click("button:has-text('Active Projects')");
    await expect(page.locator("text=Tower A Structural Frame")).toBeVisible();
  });

  test("should open and close Submit Daily Report modal cleanly", async ({ page }) => {
    await page.goto("/projects");

    await page.click("button:has-text('+ Submit Daily Report')");
    await expect(page.locator("text=Submit Daily Site Operations Report")).toBeVisible();
    await expect(page.locator("text=Target Project *")).toBeVisible();
    await expect(page.locator("text=Daily Work Progress Summary *")).toBeVisible();

    await page.click("button:has-text('Cancel')");
    await expect(page.locator("text=Submit Daily Site Operations Report")).not.toBeVisible();
  });
});
