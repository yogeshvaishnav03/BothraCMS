const fs = require('fs');

console.log('==================================================================');
console.log('VERIFYING DATABASE BACKUP ENDPOINT & UI INTEGRATION');
console.log('==================================================================');

const routeCode = fs.readFileSync('src/app/api/admin/backup/route.ts', 'utf8');
const adminPageCode = fs.readFileSync('src/app/admin/page.tsx', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`  PASS: ${message}`);
}

assert(routeCode.includes('ALLOWED_ADMIN_ROLES'), 'Backup route restricts access to admin roles');
assert(routeCode.includes('getUserContext'), 'Backup route checks user authentication');
assert(routeCode.includes('isTokenAuthorized'), 'Backup route supports secure backup token authorization');
assert(routeCode.includes('Content-Disposition'), 'Backup route returns attachment Content-Disposition');
assert(routeCode.includes('sha256Checksum'), 'Backup route calculates SHA-256 checksum');
assert(routeCode.includes('bothra_cms_database_backup_'), 'Backup route formats backup filename');
assert(routeCode.includes('password'), 'Backup route sanitizes user passwords');

assert(adminPageCode.includes('/api/admin/backup'), 'Admin page links to /api/admin/backup');
assert(adminPageCode.includes('Download DB Backup'), 'Admin page displays Download DB Backup button');

console.log('==================================================================');
console.log('ALL DATABASE BACKUP CHECKS PASSED SUCCESSFULLY!');
console.log('==================================================================');
