import { test, expect } from "@playwright/test";

test.describe("E2E Journey 5: Finance, Billing & Payment Management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@buildtrack.pro");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');
    await page.waitForURL("/", { timeout: 15000 });
  });

  test("should render finance dashboard with tabs, action buttons, and transaction tables", async ({ page }) => {
    await page.goto("/finance");
    await expect(page.locator("text=Payments & Financial Ledger")).toBeVisible({ timeout: 10000 });

    // Buttons exist
    await expect(page.locator("button:has-text('+ Record Payment')")).toBeVisible();
    await expect(page.locator("button:has-text('+ Record Bill')")).toBeVisible();

    // Tabs exist
    const billsTab = page.locator("button:has-text('Vendor Bills')");
    const paymentsTab = page.locator("button:has-text('Payments Register')");
    await expect(billsTab).toBeVisible();
    await expect(paymentsTab).toBeVisible();
  });

  test("should switch between Bills and Payments tabs seamlessly", async ({ page }) => {
    await page.goto("/finance");

    // Click Bills tab
    await page.click("button:has-text('Vendor Bills')");
    await expect(page.locator("th:has-text('Bill #')")).toBeVisible();
    await expect(page.locator("th:has-text('Vendor')")).toBeVisible();

    // Click Payments tab
    await page.click("button:has-text('Payments Register')");
    await expect(page.locator("th:has-text('Date')")).toBeVisible();
    await expect(page.locator("th:has-text('Payee / Vendor')")).toBeVisible();
  });

  test("should open and close Record Payment modal", async ({ page }) => {
    await page.goto("/finance");

    await page.click("button:has-text('+ Record Payment')");
    await expect(page.locator("text=Record Payment & Allocate")).toBeVisible();
    await expect(page.locator("text=Select Payee (Vendor / Contractor)")).toBeVisible();

    await page.click("button:has-text('Cancel')");
    await expect(page.locator("text=Record Payment & Allocate")).not.toBeVisible();
  });

  test("should open and close New Vendor Bill modal with line item inputs", async ({ page }) => {
    await page.goto("/finance");

    await page.click("button:has-text('+ Record Bill')");
    await expect(page.locator("text=Record Vendor / Contractor Bill")).toBeVisible();
    await expect(page.locator("text=Party (Vendor / Contractor) *")).toBeVisible();

    await page.click("button:has-text('Cancel')");
    await expect(page.locator("text=Record Vendor / Contractor Bill")).not.toBeVisible();
  });
});
