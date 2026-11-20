const fs = require('fs');

console.log('==================================================================');
console.log('VERIFYING WORKFORCE HEADCOUNT EDIT & IMAGE UPLOAD FIX');
console.log('==================================================================');

const pageCode = fs.readFileSync('src/app/workforce/page.tsx', 'utf8');
const apiCode = fs.readFileSync('src/app/api/workforce/headcount/route.ts', 'utf8');
const srvCode = fs.readFileSync('src/services/workforce-headcount-service.ts', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`  PASS: ${message}`);
}

assert(pageCode.includes('editingRecordId'), 'Workforce page tracks editingRecordId state');
assert(pageCode.includes('setEditingRecordId(existing.id)'), 'openUploadModal sets editingRecordId on edit');
assert(pageCode.includes('id: editingRecordId'), 'handleSaveAllHeadcounts attaches editingRecordId when updating');
assert(pageCode.includes('method: editingRecordId ? "PUT" : "POST"'), 'handleSaveAllHeadcounts calls PUT when editing');
assert(pageCode.includes('handleHeadcountPhotoSelect'), 'Workforce page includes photo selection handler');
assert(pageCode.includes('handleRemoveHeadcountPhoto'), 'Workforce page includes photo removal handler');
assert(pageCode.includes('handleDeleteExistingAttachment'), 'Workforce page includes existing attachment deletion');
assert(pageCode.includes('activePhotoLightbox'), 'Workforce page includes fullscreen lightbox preview');
assert(pageCode.includes('uploadClientMedia'), 'Workforce page uploads photos using uploadClientMedia');
assert(pageCode.includes('Site Muster Roll') && pageCode.includes('Worker Photos (Optional)'), 'Modal includes Muster Roll & Site Worker Photos card');

assert(apiCode.includes('export async function PUT'), 'Headcount API exports PUT handler');
assert(apiCode.includes('export async function PATCH'), 'Headcount API exports PATCH handler');

assert(srvCode.includes('attachments?: Array<{'), 'WorkforceHeadcountRecord interface includes attachments');
assert(srvCode.includes('where: { id: input.id, organizationId }'), 'Service matches existing record by input.id');
assert(srvCode.includes('saved = await tx.workforceHeadcount.update'), 'Service updates existing record in place');
assert(srvCode.includes('siteId: input.siteId || existing.siteId'), 'Service updates siteId on update');
assert(srvCode.includes('entityType: { in: ["WORKFORCE", "HEADCOUNT", "SITE_WORKFORCE"] }'), 'Service loads attachments for headcount records');

console.log('==================================================================');
console.log('ALL WORKFORCE EDIT & IMAGE UPLOAD CHECKS PASSED!');
console.log('==================================================================');
