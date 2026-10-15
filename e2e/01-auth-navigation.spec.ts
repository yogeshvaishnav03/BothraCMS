import { test, expect } from "@playwright/test";

test.describe("E2E Journey 1: Authentication, Sessions & Navigation", () => {
  test("should load the login page with all brand and security elements", async ({ page }) => {
    await page.goto("/login");

    // Brand and security headers
    await expect(page.locator("text=Build Track PRO")).toBeVisible();
    await expect(page.locator("text=Sign In to Workspace")).toBeVisible();
    await expect(page.locator("text=SECURE")).toBeVisible();

    // Inputs and submit button
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitBtn = page.locator('button[type="submit"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();
  });

  test("should reject invalid login credentials and display error alert", async ({ page }) => {
    await page.goto("/login");

    await page.fill('input[type="email"]', "admin@buildtrack.pro");
    await page.fill('input[type="password"]', "WrongPassword999!");
    await page.click('button[type="submit"]');

    // Error banner should appear
    const errorAlert = page.locator("text=Invalid credentials");
    await expect(errorAlert).toBeVisible();

    // Should remain on login page
    expect(page.url()).toContain("/login");
  });

  test("should successfully login with valid credentials and navigate to dashboard", async ({ page, isMobile }) => {
    await page.goto("/login");

    await page.fill('input[type="email"]', "admin@buildtrack.pro");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');

    // Redirects to dashboard
    await page.waitForURL("/", { timeout: 15000 });
    await expect(page.locator("text=Site Operations Dashboard")).toBeVisible();

    // User name visible in shell
    if (isMobile) {
      await expect(page.locator("header.lg\\:hidden").getByText("Vikram Malhotra")).toBeVisible();
    } else {
      await expect(page.locator("aside").getByText("Vikram Malhotra")).toBeVisible();
      await expect(page.getByText("Active Site", { exact: true }).first()).toBeVisible();
    }
  });

  test("should redirect unauthenticated users away from protected routes", async ({ page, context }) => {
    // Clear cookies to simulate unauthenticated user
    await context.clearCookies();

    // Attempt to access finance directly
    await page.goto("/finance");
    await page.waitForURL(/\/login/, { timeout: 10000 });

    // Should be redirected to /login with from query param
    expect(page.url()).toContain("/login");
  });

  test("should logout successfully and terminate the authenticated session", async ({ page, isMobile }) => {
    // First login
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@buildtrack.pro");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');
    await page.waitForURL("/", { timeout: 15000 });

    if (isMobile) {
      // Open mobile menu drawer first
      const mobileMenuBtn = page.locator("header.lg\\:hidden button").last();
      await mobileMenuBtn.click();
      const logoutBtn = page.locator("button:has-text('Log Out')");
      await expect(logoutBtn).toBeVisible();
      await logoutBtn.click();
    } else {
      // Click logout button in desktop sidebar
      const logoutBtn = page.locator('button[title="Logout"]').first();
      await expect(logoutBtn).toBeVisible();
      await logoutBtn.click();
    }

    // Should redirect to /login
    await page.waitForURL(/\/login/, { timeout: 10000 });
    await expect(page.locator("text=Sign In to Workspace")).toBeVisible();
  });
});
