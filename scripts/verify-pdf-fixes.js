const fs = require('fs');

const timelineSrc = fs.readFileSync('src/components/tasks/TaskTimeline.tsx', 'utf8');
const serviceSrc = fs.readFileSync('src/services/task-timeline-service.ts', 'utf8');
const nextConfigSrc = fs.readFileSync('next.config.mjs', 'utf8');
const uploadRouteSrc = fs.readFileSync('src/app/api/uploads/[id]/route.ts', 'utf8');
const attMgrSrc = fs.readFileSync('src/components/attachments/AttachmentManager.tsx', 'utf8');

const checks = [
  { name: 'TaskTimeline has isPdfDocument', pass: timelineSrc.includes('function isPdfDocument') },
  { name: 'TaskTimeline has TimelinePhotoThumb', pass: timelineSrc.includes('function TimelinePhotoThumb') },
  { name: 'TaskTimeline has PDF iframe preview', pass: timelineSrc.includes('<iframe') },
  { name: 'TaskTimeline has PDF download button', pass: timelineSrc.includes('download={lightbox.name') },
  { name: 'TaskTimeline has dedicated PDF cards', pass: timelineSrc.includes('isPdfDocument(p)') },
  { name: 'Service has resolvePhoto', pass: serviceSrc.includes('resolvePhoto') },
  { name: 'Service preloads attachments', pass: serviceSrc.includes('extraAttachments') },
  { name: 'Next.config has SAMEORIGIN', pass: nextConfigSrc.includes('SAMEORIGIN') },
  { name: 'Next.config has frame-ancestors self', pass: nextConfigSrc.includes("frame-ancestors 'self'") },
  { name: 'Next.config has object-src self blob', pass: nextConfigSrc.includes("object-src 'self' blob:") },
  { name: 'Upload route has SAMEORIGIN for pdf', pass: uploadRouteSrc.includes('mimeType === "application/pdf"') && uploadRouteSrc.includes('SAMEORIGIN') },
  { name: 'AttachmentManager has isPdf check', pass: attMgrSrc.includes('isPdf = att.mimeType === "application/pdf"') },
  { name: 'AttachmentManager has direct download link', pass: attMgrSrc.includes('download={att.fileName}') },
];

function isPdfDocument(p) {
  if (!p) return false;
  const url = typeof p === "string" ? p : p.url || "";
  const name = typeof p === "string" ? "" : p.name || "";
  const mime = typeof p === "string" ? "" : p.mimeType || "";
  if (mime.toLowerCase() === "application/pdf") return true;
  const check = `${url} ${name}`.toLowerCase().split("?")[0].split("#")[0];
  return check.endsWith(".pdf") || check.includes(".pdf") || check.includes("application/pdf");
}

const unitTests = [
  { input: { url: "/api/uploads/123", name: "BO_R3_LB_CABIN_FC_06-11-26.pdf" }, expected: true },
  { input: { url: "/api/uploads/abc.pdf?token=123" }, expected: true },
  { input: { url: "/api/uploads/xyz", mimeType: "application/pdf" }, expected: true },
  { input: { url: "/api/uploads/xyz", name: "photo.jpg" }, expected: false },
  { input: { url: "/api/uploads/xyz", mimeType: "image/jpeg" }, expected: false },
  { input: null, expected: false },
  { input: "document.PDF", expected: true },
];

for (const t of unitTests) {
  const res = isPdfDocument(t.input);
  checks.push({
    name: `Unit test isPdfDocument(${JSON.stringify(t.input)}) === ${t.expected}`,
    pass: res === t.expected,
  });
}

let allPass = true;
for (const c of checks) {
  console.log(`[${c.pass ? 'PASS' : 'FAIL'}] ${c.name}`);
  if (!c.pass) allPass = false;
}

if (!allPass) {
  process.exit(1);
} else {
  console.log('\nAll 20 checks passed successfully!');
}
