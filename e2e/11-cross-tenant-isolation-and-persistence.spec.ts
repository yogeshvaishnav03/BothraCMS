import { test, expect } from "@playwright/test";

test.describe("E2E Journey 11: Cross-Tenant Isolation & Data Persistence", () => {
  test("should enforce strict cross-tenant isolation and reject cross-organization IDOR access", async ({ request }) => {
    // 1. Authenticate as Org Admin
    const loginRes = await request.post("/api/auth/login", {
      data: {
        email: "admin@buildtrack.pro",
        password: "Password123!",
      },
    });
    expect(loginRes.status()).toBe(200);

    // 2. Fetch project list for current organization (Apex Infrastructure)
    const projRes = await request.get("/api/projects");
    expect(projRes.status()).toBe(200);
    const projData = await projRes.json();
    expect(projData.success).toBe(true);
    expect(projData.data.length).toBeGreaterThan(0);
    const validProjectId = projData.data[0].id;

    // 3. Attempting to access an ID outside organization scope or invalid ID returns 404/Not Found
    const invalidIdRes = await request.get("/api/projects/non-existent-foreign-project-id");
    expect(invalidIdRes.status()).toBe(404);
    const invalidJson = await invalidIdRes.json();
    expect(invalidJson.success).toBe(false);

    // 4. Attempting to access a statement with non-existent party ID returns 404
    const invalidPartyRes = await request.get("/api/parties/party-foreign-org-999/statement");
    expect(invalidPartyRes.status()).toBe(404);

    // 5. Attempting to download a document outside organization scope returns 404
    const foreignDocRes = await request.get("/api/uploads/foreign-doc-id-12345");
    expect(foreignDocRes.status()).toBe(404);
  });

  test("should persist operational data accurately across page reloads in browser", async ({ page }) => {
    // 1. Login
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@buildtrack.pro");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');
    await page.waitForURL("/", { timeout: 15000 });

    // 2. Navigate to materials page
    await page.goto("/materials");
    await expect(page.locator("text=Materials Master & Site Inventory")).toBeVisible({ timeout: 10000 });

    // Verify initial stock row is present
    await expect(page.locator("text=Tata Tiscon Fe550D TMT Rebar 12mm")).toBeVisible();

    // 3. Perform hard page reload
    await page.reload();

    // 4. Verify data persists and rehydrates properly without errors or layout collapse
    await expect(page.locator("text=Materials Master & Site Inventory")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Tata Tiscon Fe550D TMT Rebar 12mm")).toBeVisible();
    await expect(page.locator("button:has-text('+ Goods Receipt')")).toBeVisible();
  });

  test("should handle empty search results and invalid inputs gracefully without crash", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@buildtrack.pro");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');
    await page.waitForURL("/", { timeout: 15000 });

    // Navigate to /tasks
    await page.goto("/tasks");
    await expect(page.locator("text=Site Tasks & Daily Work Tracking")).toBeVisible({ timeout: 10000 });

    // Type a search string that matches no tasks
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill("NON_EXISTENT_TASK_XYZ_999");

    // UI should show empty state or filtered list without JavaScript exception
    await expect(page.locator("text=Site Tasks & Daily Work Tracking")).toBeVisible();
  });
});
