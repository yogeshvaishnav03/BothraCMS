process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function downloadCompleteLiveBackup() {
  const baseUrl = 'https://bothra-cms.vercel.app';
  console.log('==================================================================');
  console.log(`🌐 CONNECTING TO LIVE PRODUCTION WEBSITE: ${baseUrl}`);
  console.log('==================================================================');

  // 1. Authenticate with Super Admin credentials
  console.log('🔐 Authenticating as Master Super Admin...');
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'superadmin@buildtrack.pro',
      password: 'Password123!',
    }),
  });

  const setCookie = loginRes.headers.get('set-cookie');
  const loginJson = await loginRes.json().catch(() => ({}));

  if (!setCookie) {
    console.error('❌ Failed to authenticate with live website:', loginJson);
    process.exit(1);
  }

  const cookie = setCookie.split(';')[0];
  console.log(`✅ Authentication Successful! User: ${loginJson.data?.user?.name} (${loginJson.data?.user?.role})`);

  const headers = {
    Cookie: cookie,
    Accept: 'application/json',
  };

  // 2. Define all core business modules and endpoints to backup
  const endpoints = [
    { key: 'organizations', path: '/api/organization' },
    { key: 'users', path: '/api/users' },
    { key: 'sites', path: '/api/sites' },
    { key: 'projects', path: '/api/projects' },
    { key: 'tasks', path: '/api/tasks' },
    { key: 'parties', path: '/api/parties?type=ALL&includeArchived=true' },
    { key: 'workforceHeadcounts', path: '/api/workforce/headcount' },
    { key: 'workforceMembers', path: '/api/workforce' },
    { key: 'attendanceHistory', path: '/api/attendance/history' },
    { key: 'staffAttendance', path: '/api/staff-attendance' },
    { key: 'materials', path: '/api/materials' },
    { key: 'materialRequests', path: '/api/material-requests' },
    { key: 'purchaseOrders', path: '/api/orders' },
    { key: 'bills', path: '/api/finance/bills' },
    { key: 'payments', path: '/api/finance/payments' },
    { key: 'dayBook', path: '/api/day-book' },
    { key: 'measurementBook', path: '/api/measurement-book' },
    { key: 'measurementGroups', path: '/api/measurement-book/groups' },
    { key: 'dailyReports', path: '/api/daily-reports' },
    { key: 'workReports', path: '/api/work-reports' },
    { key: 'drawings', path: '/api/drawings' },
    { key: 'equipment', path: '/api/equipment' },
    { key: 'qualityInspections', path: '/api/quality/inspections' },
    { key: 'qualityIssues', path: '/api/quality/issues' },
    { key: 'salesBookings', path: '/api/sales/bookings' },
    { key: 'salesUnits', path: '/api/sales/units' },
    { key: 'salesLeads', path: '/api/sales/leads' },
    { key: 'notifications', path: '/api/notifications' },
    { key: 'auditEvents', path: '/api/audit' },
  ];

  const backupData = {
    version: '1.0.0',
    system: 'BothraCMS / BuildTrack Pro',
    company: loginJson.data?.user?.organizationName || 'Bothra Infrastructure & Builders',
    organizationId: loginJson.data?.user?.organizationId,
    backupTimestamp: new Date().toISOString(),
    sourceUrl: baseUrl,
    exportedBy: loginJson.data?.user,
    modules: {},
    summary: {},
  };

  let totalRecords = 0;
  console.log('\n📥 Downloading Live Database Modules...');

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${baseUrl}${ep.path}`, { headers });
      const json = await res.json().catch(() => null);

      let records = [];
      if (json) {
        if (Array.isArray(json.data)) {
          records = json.data;
        } else if (Array.isArray(json)) {
          records = json;
        } else if (json.data && typeof json.data === 'object') {
          // If response has nested list like { records: [...] } or { bills: [...] }
          const arrayProp = Object.keys(json.data).find((k) => Array.isArray(json.data[k]));
          if (arrayProp) {
            records = json.data[arrayProp];
          } else {
            records = [json.data];
          }
        }
      }

      backupData.modules[ep.key] = records;
      backupData.summary[ep.key] = records.length;
      totalRecords += records.length;
      console.log(`  ✓ ${ep.key.padEnd(22)} : ${records.length.toString().padStart(4)} record(s)`);
    } catch (err) {
      console.warn(`  ✗ ${ep.key.padEnd(22)} : Error (${err.message})`);
      backupData.modules[ep.key] = [];
      backupData.summary[ep.key] = 0;
    }
  }

  // 3. Save backup file to disk
  const backupDir = path.resolve(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const jsonContent = JSON.stringify(backupData, null, 2);
  const sha256 = crypto.createHash('sha256').update(jsonContent).digest('hex');

  const finalBackup = {
    checksumSha256: sha256,
    totalRecords,
    ...backupData,
  };

  const fileName = `bothra_cms_website_database_backup_${timestamp}.json`;
  const filePath = path.join(backupDir, fileName);

  fs.writeFileSync(filePath, JSON.stringify(finalBackup, null, 2), 'utf8');
  const fileSizeBytes = fs.statSync(filePath).size;

  console.log('\n==================================================================');
  console.log('✅ DATABASE BACKUP COMPLETED & SAVED TO DISK!');
  console.log('==================================================================');
  console.log(`📁 Backup File Location : ${filePath}`);
  console.log(`📊 Total Records Saved  : ${totalRecords}`);
  console.log(`📦 File Size            : ${(fileSizeBytes / 1024).toFixed(2)} KB (${fileSizeBytes} bytes)`);
  console.log(`🔐 SHA-256 Checksum     : ${sha256}`);
  console.log('==================================================================');

  return { filePath, fileName, totalRecords, fileSizeBytes, sha256, summary: backupData.summary };
}

downloadCompleteLiveBackup().catch((err) => {
  console.error('Fatal backup error:', err);
  process.exit(1);
});
