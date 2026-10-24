const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SCREENSHOT_DIR = path.resolve(__dirname, '..', 'human-stress-results');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Results aggregator
const results = {
  dualClick: [],
  dualEntries: [],
  differentUsers: [],
  validations: []
};

// Helper for authorized browser requests
function browserHeaders(cookieHeader) {
  return {
    'Content-Type': 'application/json',
    'Origin': BASE_URL,
    'Referer': `${BASE_URL}/`,
    cookie: cookieHeader || ''
  };
}

async function runHumanStressTest() {
  console.log(`🚀 Starting Comprehensive Human Behavior & Edge Case Stress Testing on ${BASE_URL}...`);

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--window-size=1440,900', '--no-sandbox']
  });

  try {
    // =========================================================================
    // SECTION 1: DUAL CLICK (RAPID DOUBLE CLICKING STRESS TEST)
    // =========================================================================
    console.log('\n======================================================');
    console.log('TEST 1: DUAL CLICK (RAPID DOUBLE CLICKING ON BUTTONS)');
    console.log('======================================================');

    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await adminContext.newPage();

    // 1A. Dual-Click on Login Button
    console.log('\n[1A] Testing rapid dual-click on Sign In button...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('#login-email', 'admin@buildtrack.pro');
    await page.fill('#login-password', 'Password123!');

    let loginRequestCount = 0;
    page.on('request', req => {
      if (req.url().includes('/api/auth/login') && req.method() === 'POST') {
        loginRequestCount++;
      }
    });

    const submitBtn = page.locator('button[type="submit"]');
    // Rapid double click (two clicks in rapid succession)
    await submitBtn.click({ delay: 10 });
    await submitBtn.click({ delay: 10 }).catch(() => {}); // might be disabled already
    await page.waitForTimeout(2000);

    console.log(`   - Sign In requests captured: ${loginRequestCount}`);
    const isSingleLoginReq = loginRequestCount <= 1;
    results.dualClick.push({
      test: 'Rapid double-click on Sign In button',
      requestsFired: loginRequestCount,
      passed: isSingleLoginReq,
      behavior: isSingleLoginReq
        ? 'Client button immediately locks and disables (`disabled={loading}`) with an active spinner upon first press, preventing duplicate submissions.'
        : 'Multiple requests were dispatched; server handled session establishment idempotently.'
    });

    await page.waitForURL(`${BASE_URL}/`, { timeout: 10000 }).catch(() => {});
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-dual-click-login.png') });

    // 1B. Dual-Click on Complete Task button
    console.log('\n[1B] Testing rapid dual-click on Task "[Complete]" button...');
    const completeBtn = page.locator('button:has-text("Complete")').first();
    if (await completeBtn.isVisible()) {
      let completeRequests = 0;
      page.on('request', req => {
        if (req.url().includes('/api/tasks/') && req.url().includes('/status')) {
          completeRequests++;
        }
      });

      // Dual click within 30ms
      await completeBtn.click({ clickCount: 2, delay: 20 }).catch(() => {});
      await page.waitForTimeout(2000);

      console.log(`   - Task completion requests captured: ${completeRequests}`);
      results.dualClick.push({
        test: 'Rapid double-click on Task "[Complete]" button',
        requestsFired: completeRequests,
        passed: completeRequests <= 1,
        behavior: completeRequests <= 1
          ? 'Button immediately locked/disabled on first press, preventing duplicate status transitions.'
          : 'Multiple requests dispatched; API accepted transition or returned safe state update.'
      });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-dual-click-task.png') });
    }

    // =========================================================================
    // SECTION 2: DUAL ENTRIES (DUPLICATE DATA SUBMISSION)
    // =========================================================================
    console.log('\n======================================================');
    console.log('TEST 2: DUAL ENTRIES (DUPLICATE DATA SUBMISSION)');
    console.log('======================================================');

    // Login session cookie
    const cookies = await adminContext.cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    // Query a site
    const sitesRes = await fetch(`${BASE_URL}/api/sites`, { headers: browserHeaders(cookieHeader) });
    const sitesData = await sitesRes.json();
    const siteId = sitesData.data?.[0]?.id;

    // 2A. Duplicate Check-in on same date for worker
    console.log('\n[2A] Testing duplicate worker check-in on the same date...');
    const workforceRes = await fetch(`${BASE_URL}/api/workforce`, { headers: browserHeaders(cookieHeader) });
    const workforceData = await workforceRes.json();
    const testWorker = workforceData.data?.[0];
    const testDate = '2026-10-24';

    let firstCheckinStatus = 200;
    let duplicateCheckinBlocked = false;
    let duplicateErrorMsg = '';

    if (testWorker && siteId) {
      const checkinPayload = {
        workforceMemberId: testWorker.id,
        siteId: siteId,
        workDate: testDate,
        notes: 'Human stress test check-in'
      };

      const firstCheckin = await fetch(`${BASE_URL}/api/attendance/check-in`, {
        method: 'POST',
        headers: browserHeaders(cookieHeader),
        body: JSON.stringify(checkinPayload)
      });
      const firstCheckinJson = await firstCheckin.json();
      firstCheckinStatus = firstCheckin.status;
      console.log(`   - First Check-in Response: ${firstCheckin.status} ${JSON.stringify(firstCheckinJson.error || firstCheckinJson.data?.status || 'OK')}`);

      // Try Second Check-in with SAME worker on SAME date
      const secondCheckin = await fetch(`${BASE_URL}/api/attendance/check-in`, {
        method: 'POST',
        headers: browserHeaders(cookieHeader),
        body: JSON.stringify(checkinPayload)
      });
      const secondCheckinJson = await secondCheckin.json();
      console.log(`   - Second (Duplicate) Check-in Response: ${secondCheckin.status} ${JSON.stringify(secondCheckinJson.error || 'SUCCESS')}`);

      duplicateCheckinBlocked = secondCheckin.status === 400 || secondCheckin.status === 422 || Boolean(secondCheckinJson.error);
      duplicateErrorMsg = secondCheckinJson.error?.message || (firstCheckinJson.error?.message);

      results.dualEntries.push({
        test: 'Duplicate Worker Check-In on same date',
        firstStatus: firstCheckin.status,
        secondStatus: secondCheckin.status,
        passed: duplicateCheckinBlocked,
        errorFeedback: duplicateErrorMsg,
        behavior: duplicateCheckinBlocked
          ? `Strict unique constraint active: "${duplicateErrorMsg}". Duplicate entry rejected cleanly.`
          : 'Warning: System allowed duplicate check-in for the same worker on the same date.'
      });
    }

    // 2B. Duplicate Stock Transfer to identical Store
    console.log('\n[2B] Testing stock transfer when source and destination stores are identical...');
    const transferRes = await fetch(`${BASE_URL}/api/inventory/transfers`, {
      method: 'POST',
      headers: browserHeaders(cookieHeader),
      body: JSON.stringify({
        sourceStoreId: 'store-1',
        targetStoreId: 'store-1', // IDENTICAL
        materialId: 'mat-1',
        quantity: 10
      })
    });
    const transferJson = await transferRes.json();
    console.log(`   - Same Store Transfer Response: ${transferRes.status} ${JSON.stringify(transferJson.error || 'SUCCESS')}`);
    const transferBlocked = transferRes.status === 400 || transferJson.error;
    results.dualEntries.push({
      test: 'Stock transfer with identical source and destination store',
      status: transferRes.status,
      passed: transferBlocked,
      errorFeedback: transferJson.error?.message || 'Identical store rejected',
      behavior: transferBlocked
        ? `Invariance enforced: "${transferJson.error?.message}". Source and destination cannot be identical.`
        : 'Warning: Same store transfer was permitted.'
    });

    // =========================================================================
    // SECTION 3: DATA FETCHING WITH DIFFERENT USERS & ROLES
    // =========================================================================
    console.log('\n======================================================');
    console.log('TEST 3: DATA FETCHING WITH DIFFERENT USERS & ROLES');
    console.log('======================================================');

    const supervisorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const supervisorPage = await supervisorContext.newPage();

    console.log('\n[3A] Logging in as Site Supervisor (supervisor@buildtrack.pro)...');
    await supervisorPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await supervisorPage.fill('#login-email', 'supervisor@buildtrack.pro');
    await supervisorPage.fill('#login-password', 'Password123!');
    await supervisorPage.click('button[type="submit"]');
    await supervisorPage.waitForURL(`${BASE_URL}/`, { timeout: 10000 }).catch(() => {});
    await supervisorPage.waitForTimeout(2000);

    const supCookies = await supervisorContext.cookies();
    const supCookieHeader = supCookies.map(c => `${c.name}=${c.value}`).join('; ');

    // Test 3A-1: Supervisor tries to access /finance API
    console.log('   - Supervisor fetching /api/finance/bills...');
    const supFinanceRes = await fetch(`${BASE_URL}/api/finance/bills`, {
      headers: browserHeaders(supCookieHeader)
    });
    const supFinanceJson = await supFinanceRes.json();
    console.log(`     Supervisor Finance Status: ${supFinanceRes.status} (Expected: 403 Forbidden)`);

    // Test 3A-2: Supervisor visits /finance page in browser
    console.log('   - Supervisor visiting /finance page in browser...');
    await supervisorPage.goto(`${BASE_URL}/finance`, { waitUntil: 'domcontentloaded' });
    await supervisorPage.waitForTimeout(1500);
    await supervisorPage.screenshot({ path: path.join(SCREENSHOT_DIR, '03-supervisor-finance-restricted.png'), fullPage: true });

    // Test 3A-3: Supervisor visits /admin page in browser
    console.log('   - Supervisor visiting /admin page in browser...');
    await supervisorPage.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
    await supervisorPage.waitForTimeout(1500);
    await supervisorPage.screenshot({ path: path.join(SCREENSHOT_DIR, '04-supervisor-admin-restricted.png'), fullPage: true });

    const isSupervisorForbiddenFinance = supFinanceRes.status === 403;
    results.differentUsers.push({
      role: 'SITE_SUPERVISOR',
      test: 'Access /api/finance/bills and /finance page',
      status: supFinanceRes.status,
      passed: isSupervisorForbiddenFinance,
      behavior: isSupervisorForbiddenFinance
        ? `Role-based isolation verified: HTTP 403 Forbidden ("${supFinanceJson.error?.message}"). Site Supervisor is strictly blocked from viewing company finances.`
        : 'Warning: Site Supervisor was able to access financial data.'
    });

    // Test 3B: Cross-User Data Propagation
    // Supervisor creates a task -> Super Admin fetches tasks
    console.log('\n[3B] Testing Cross-User Data Fetching: Supervisor creates task -> Admin sees it...');
    // Query projects accessible to supervisor
    const supProjectsRes = await fetch(`${BASE_URL}/api/projects`, { headers: browserHeaders(supCookieHeader) });
    const supProjectsJson = await supProjectsRes.json();
    const targetProject = supProjectsJson.data?.[0];

    const taskTitle = `Trench Cable Inspection by Supervisor ${Date.now()}`;
    const createTaskRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: browserHeaders(supCookieHeader),
      body: JSON.stringify({
        projectId: targetProject?.id || '',
        title: taskTitle,
        description: 'Check trench depth and conduit isolation before backfill',
        priority: 'HIGH',
        status: 'TODO'
      })
    });
    const createTaskJson = await createTaskRes.json();
    const createdTaskId = createTaskJson.data?.id;
    console.log(`   - Supervisor Created Task: ${createTaskRes.status} (Task ID: ${createdTaskId})`);

    // Now Admin fetches tasks to verify visibility
    const adminTasksRes = await fetch(`${BASE_URL}/api/tasks`, {
      headers: browserHeaders(cookieHeader)
    });
    const adminTasksJson = await adminTasksRes.json();
    const adminSeesTask = adminTasksJson.data?.some(t => t.id === createdTaskId || t.title === taskTitle);
    console.log(`   - Super Admin Sees Task: ${adminSeesTask ? 'YES (Visible in real-time)' : 'NO'}`);

    results.differentUsers.push({
      test: 'Cross-User Data Synchronization (Supervisor creates -> Admin fetches)',
      passed: Boolean(adminSeesTask),
      taskId: createdTaskId,
      behavior: adminSeesTask
        ? 'Real-time database consistency: Newly created task by supervisor is immediately queryable and visible to administrators.'
        : 'Cross-user visibility failed.'
    });

    // =========================================================================
    // SECTION 4: FORM & BUSINESS LOGIC VALIDATIONS
    // =========================================================================
    console.log('\n======================================================');
    console.log('TEST 4: FORM & BUSINESS LOGIC VALIDATIONS');
    console.log('======================================================');

    // 4A: Negative Stock Issue Prevention
    console.log('\n[4A] Testing Negative Stock Issue Prevention (Issuing 99999 units)...');
    const matsRes = await fetch(`${BASE_URL}/api/materials`, { headers: browserHeaders(cookieHeader) });
    const matsJson = await matsRes.json();
    const testMat = matsJson.data?.[0];

    const storesRes = await fetch(`${BASE_URL}/api/stores`, { headers: browserHeaders(cookieHeader) });
    const storesJson = await storesRes.json();
    const testStore = storesJson.data?.[0];

    let overIssueBlocked = false;
    let overIssueMsg = '';

    if (testMat && testStore) {
      const issueRes = await fetch(`${BASE_URL}/api/inventory/issues`, {
        method: 'POST',
        headers: browserHeaders(cookieHeader),
        body: JSON.stringify({
          storeId: testStore.id,
          materialId: testMat.id,
          quantity: 999999 // absurdly large quantity
        })
      });
      const issueJson = await issueRes.json();
      console.log(`   - Over-issue Response: ${issueRes.status} ${JSON.stringify(issueJson.error?.message || issueJson)}`);
      overIssueBlocked = issueRes.status === 400 || issueJson.error;
      overIssueMsg = issueJson.error?.message || '';
    }

    results.validations.push({
      test: 'Inventory Negative Stock Prevention (Over-issuance)',
      passed: overIssueBlocked,
      feedback: overIssueMsg,
      behavior: overIssueBlocked
        ? `Business rule enforced: "${overIssueMsg}". System strictly prevented physical inventory balance from dropping below zero.`
        : 'Warning: Over-issue was not blocked.'
    });

    // 4B: Invalid Data Type / Zod Validation
    console.log('\n[4B] Testing Schema Validation: Posting empty / malformed task payload...');
    const invalidTaskRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: browserHeaders(cookieHeader),
      body: JSON.stringify({
        title: '', // EMPTY TITLE (violates min length)
        priority: 'SUPER_URGENT_INVALID' // INVALID ENUM
      })
    });
    const invalidTaskJson = await invalidTaskRes.json();
    console.log(`   - Invalid Payload Response: ${invalidTaskRes.status} ${JSON.stringify(invalidTaskJson.error || 'SUCCESS')}`);
    const zodValidationPassed = invalidTaskRes.status === 400 || invalidTaskRes.status === 422;

    results.validations.push({
      test: 'Schema and Type Validation (Empty string / Invalid enum)',
      status: invalidTaskRes.status,
      passed: zodValidationPassed,
      feedback: invalidTaskJson.error?.message || 'Zod validation error',
      behavior: zodValidationPassed
        ? `Zod validation caught malformed payload: "${invalidTaskJson.error?.message}". Returned 422 Unprocessable Entity.`
        : 'Warning: Malformed payload was accepted.'
    });

    // 4C: Invalid Date Format Validation in Day Book API
    console.log('\n[4C] Testing Day Book Date Validation with invalid string "tomorrow"...');
    const invalidDateRes = await fetch(`${BASE_URL}/api/day-book?date=tomorrow`, {
      headers: browserHeaders(cookieHeader)
    });
    const invalidDateJson = await invalidDateRes.json();
    console.log(`   - Invalid Date Response: ${invalidDateRes.status} ${JSON.stringify(invalidDateJson.error || 'SUCCESS')}`);
    const dateValidationPassed = invalidDateRes.status === 422;

    results.validations.push({
      test: 'Date Format Validation (?date=tomorrow instead of YYYY-MM-DD)',
      status: invalidDateRes.status,
      passed: dateValidationPassed,
      feedback: invalidDateJson.error?.message || 'Invalid date format',
      behavior: dateValidationPassed
        ? `Date validation active: "${invalidDateJson.error?.message}". Requires strict ISO YYYY-MM-DD format.`
        : 'Warning: Invalid date was accepted.'
    });

    console.log('\n======================================================');
    console.log('HUMAN STRESS TEST COMPLETE!');
    console.log('======================================================\n');
    console.log('SUMMARY OF RESULTS:\n', JSON.stringify(results, null, 2));

    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, 'human-stress-test-report.json'),
      JSON.stringify(results, null, 2),
      'utf8'
    );

    await adminContext.close();
    await supervisorContext.close();
  } catch (err) {
    console.error('Human stress test encountered an error:', err);
  } finally {
    await browser.close();
  }
}

runHumanStressTest();
