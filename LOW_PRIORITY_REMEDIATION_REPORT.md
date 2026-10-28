# BuildTrack Pro / BothraCMS — Low-Priority Remediation & Final QA Report

**Status:** Completed & Fully Verified  
**Date:** October 28, 2026  
**Auditor & Lead Engineers:** Senior Frontend Developer, Accessibility Reviewer & QA Engineer  
**Workspace:** `d:\yogesh\BothraCMS-main\BothraCMS-main`  
**Test Suite Status:** 13/13 Low-Priority Tests Passing (`src/__tests__/low-priority-remediation.test.ts`)  
**Cumulative Verification:** 43/43 Tests Passing (High, Medium, and Low Priority Suites)  
**Typecheck Status:** Clean (`tsc --noEmit` exited with code 0)  
**Lint Status:** Clean (`next lint` exited with 0 errors, 0 warnings)  
**Production Build Status:** Clean (`next build` compiled 40/40 static & dynamic routes cleanly)

---

## Executive Summary

Following the successful execution of the High-Priority architecture migration (PostgreSQL, Cloudflare R2 object storage, coordinated backup/recovery) and Medium-Priority functional fixes (audit restriction, date filtering, print layout, notification persistence, bill allocation), this phase executed the **Low-Priority issue log resolutions and comprehensive QA / accessibility audit** across BuildTrack Pro / BothraCMS.

All changes were implemented directly in the repository with zero mock implementations, preserving all existing security controls, tenant isolation boundaries, and business calculations.

### Key Remediation Highlights:
1. **Removed Recent Site Photos Lightbox Modal from Dashboard**:
   - Completely eliminated the dashboard lightbox modal popup, state (`lightboxPhoto`), and click triggers from `src/app/page.tsx`.
   - Replaced modal trigger with direct external links (`<ExternalLink />`) opening high-resolution original images in a new browser tab.
   - Preserved all stored photographs, database attachments, and authorized attachment management in `src/components/attachments/AttachmentManager.tsx` and across projects, tasks, and finance modules.
2. **Added Explanatory Guidance to Day Book Modal**:
   - Integrated dynamic, accessible explanatory guidance callouts inside the Day Book entry modal for all four operational modes (`PAYMENT`, `BILL`, `WORKFORCE`, `DSR`).
   - Detailed explicit purpose, required input fields (marked with `*`), and accounting/operational results (ledger debit, accounts payable liability, muster update, management log).
3. **Application-Wide Keyboard Accessibility & Scroll Locking**:
   - Implemented standard `Escape` key listeners and background scroll locks (`document.body.style.overflow = "hidden"`) across all modal dialogs in the application (`Modal.tsx`, `AuditHistoryModal.tsx`, `PlaceOrderModal.tsx`, `day-book`, `finance`, `projects`, `tasks`, `materials`, `attendance`, `parties`).
   - Added appropriate ARIA attributes (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`, accessible close button `aria-label`s).
4. **Project-Wide UI, Typography & Formatter Standardization**:
   - Created centralized `formatFileSize(bytes)` in `src/lib/formatters.ts` replacing ad-hoc calculations with human-readable file sizes (`B`, `KB`, `MB`, `GB`).
   - Standardized Title Case capitalization across navigation groups, headers, and localized strings (`"Site Work"`, `"Accounts Export"`, `"WhatsApp Inbox"`).
   - Audited internal links, verifying 0 dead links across all 40 application routes.
   - Completed end-to-end verification of attendance correction workflows and dialog controls.

---

## Phase 1 — Low-Priority Issue Log Resolutions

### Item 1: Remove Recent Site Photos Modal from Dashboard
- **Issue Log Description**: Remove the Recent Site Photos modal from the dashboard while preserving stored photos, file records, project documents, and photo viewing in other authorized areas.
- **Root Cause & Previous Implementation**:
  - `src/app/page.tsx` maintained `lightboxPhoto` state and rendered `{lightboxPhoto && (...)}` containing an intrusive fixed lightbox overlay. Clicking photo cards triggered this modal.
- **Implementation & Modifications (`src/app/page.tsx`)**:
  - Removed `const [lightboxPhoto, setLightboxPhoto] = useState<any>(null);`.
  - Removed state cleanups in `handleDashboardPhotoReplace` and `handleDashboardPhotoDelete`.
  - Removed `onClick={() => setLightboxPhoto(photo)}` and `cursor-pointer` from photo thumbnails and overlay cards.
  - Added an accessible "Open photo in new tab" anchor link (`<a href={photo.url} target="_blank" rel="noopener noreferrer">`) with `<ExternalLink />` icon on hover, allowing users to view full-resolution files directly without an in-app dashboard popup.
  - Deleted lines 3255-3311 containing the `{lightboxPhoto && (...)}` modal element.
- **Data Integrity & Protection**:
  - No database records (`Attachment` table) or object-storage keys were modified or removed.
  - Full photo attachment functionality (upload, replace, delete, download, view) remains operational across authorized areas (`AttachmentManager.tsx` in `/projects/[id]`, `/tasks`, `/finance`, and `/parties/[id]`).
- **Verification**: Verified via `src/__tests__/low-priority-remediation.test.ts` ("Item 1: Remove Recent Site Photos Modal from Dashboard").

---

### Item 2: Day Book Modal Explanatory Guidance
- **Issue Log Description**: Add concise explanatory text to the Day Book modal so users understand its purpose, required fields, and expected actions, without obscuring controls or duplicating instructions.
- **Implementation (`src/app/day-book/page.tsx`)**:
  - Added structured metadata `modalModeGuidance` providing specific, localized guidance for each tab:
    * **Payment Out (Immediate Outflow)**: *"Record cash, bank transfer, UPI, or cheque payment disbursed to a vendor, contractor, or staff member for site expenses, materials, or labor advances. You may optionally link this payment directly to an outstanding bill."*  
      **Required**: Recipient / Party, Amount, Payment Mode, Ref / Voucher / UTR No.  
      **Effect**: Deducts from site balance and updates financial vouchers ledger.
    * **Enter Bill (Payable Liability)**: *"Log an incoming vendor invoice, supplier bill, or subcontractor debit note. This registers liability on the balance sheet without disbursing funds until payment is made."*  
      **Required**: Vendor / Supplier, Bill #, Bill Date, Due Date, Pre-Tax Amount, GST Rate.  
      **Effect**: Adds to accounts payable balance and enables future payment allocation.
    * **Workforce Count (Site Labor Muster)**: *"Capture the total construction labor count deployed at the site today across skilled artisans, semi-skilled craftsmen, and general laborers."*  
      **Required**: Construction Site, Artisans, Craftsmen, Male/Female Laborers.  
      **Effect**: Updates daily attendance muster and manpower analytics.
    * **Site DSR (Site Operations)**: *"Submit end-of-day operational summary covering work accomplished, materials consumed, weather conditions, and site delays."*  
      **Required**: Project / Site, Work Execution Summary.  
      **Effect**: Records official daily site log for management review and client sign-off.
  - Embedded an accessible info banner (`bg-amber-50 border border-amber-200/80 rounded-xl`) with `<Info />` icon at the top of the modal body, dynamically reflecting the active tab.
  - Added `role="dialog"`, `aria-modal="true"`, `aria-labelledby="daybook-modal-title"`, and accessible close buttons.
- **Verification**: Verified via `src/__tests__/low-priority-remediation.test.ts` ("Item 2: Day Book Modal Explanatory Guidance").

---

## Phase 2 — Project-Wide UI, Typography & Formatter Audit

### 1. Formatter Centralization (`src/lib/formatters.ts`)
- Added `formatFileSize(bytes: number | null | undefined): string` handling zero, null, undefined, and values scaling from bytes up to terabytes (`B`, `KB`, `MB`, `GB`, `TB`).
- Replaced ad-hoc `(att.fileSize / 1024).toFixed(0) + " KB"` with `formatFileSize(att.fileSize)` in `src/components/attachments/AttachmentManager.tsx`.
- Verified consistent formatting across currency (`formatCurrency`), date/time (`formatDate`, `formatDateTime`), and physical quantities (`formatQuantity`).

### 2. Capitalization & Terminology Consistency
- Audited navigation, headers, and localized strings:
  * Changed `"Site work"` to `"Site Work"` in `src/components/layout/Shell.tsx` and `src/lib/i18n.tsx`.
  * Changed `"Accounts export"` to `"Accounts Export"` in `src/app/exports/page.tsx`, `src/components/layout/Shell.tsx`, and `src/lib/i18n.tsx`.
  * Changed `"WhatsApp inbox"` to `"WhatsApp Inbox"` in `src/app/whatsapp/page.tsx`, `src/app/settings/messages/page.tsx`, `src/components/layout/Shell.tsx`, and `src/lib/i18n.tsx`.
- Preserved all database schema identifiers, Prisma models, and public API endpoint contracts intact.

### 3. Route & Link Integrity Audit
- Scanned all internal `<Link href="...">` links against the route catalog in `src/app/`.
- Verified that **100% of internal links point to active, existing pages** (0 dead links found).

---

## Phase 3 — UX, Accessibility & Modal Keyboard Controls

### 1. Keyboard `Escape` Handling & Background Scroll Locking
Previously, several modal overlays permitted background document scrolling or required manual mouse clicks to dismiss. The following components were enhanced with `Escape` key listeners and `document.body.style.overflow = "hidden"` scroll locks:
- **Shared Modal Component (`src/components/ui/Modal.tsx`)**: Benefits `quality`, `equipment`, `payroll`, `sales`, and `drawings`.
- **Audit History Modal (`src/components/audit/AuditHistoryModal.tsx`)**: Added keyboard dismiss, scroll lock, backdrop click handler, and `aria-labelledby`.
- **Place Order Modal (`src/components/materials/PlaceOrderModal.tsx`)**: Added keyboard dismiss, scroll lock, and accessible modal markup.
- **Day Book Entry Modal (`src/app/day-book/page.tsx`)**: Added keyboard dismiss and scroll lock for both `showLogModal` and `kpiPopupType`.
- **Finance Modals (`src/app/finance/page.tsx`)**: Added keyboard dismiss and scroll lock for Payment, Bill, Reverse, and Attachment modals.
- **Projects Modals (`src/app/projects/page.tsx`)**: Added keyboard dismiss and scroll lock for Create Project, Create Site, and Daily Report modals.
- **Tasks Modals (`src/app/tasks/page.tsx`)**: Added keyboard dismiss and scroll lock for Create, Edit, Status, Comments, and Attachment modals.
- **Materials Modals (`src/app/materials/page.tsx`)**: Added keyboard dismiss and scroll lock for Receive, Issue, Transfer, Create Material, and Place Order modals.
- **Attendance Correction Modal (`src/app/attendance/page.tsx`)**: Added keyboard dismiss, scroll lock, and rendered the administrative time-tag correction dialog with mandatory justification ($\ge 5$ characters).
- **Parties Modals (`src/app/parties/page.tsx`)**: Added keyboard dismiss and scroll lock for Partner Edit and Bank Details modals.

### 2. Viewport & Responsive Design Verification
- Audited modals and layout containers at desktop ($\ge 1280\text{px}$), tablet ($768\text{px} - 1024\text{px}$), and mobile ($\le 640\text{px}$).
- Enforced `max-h-[90vh]` / `max-h-[92vh]` and `overflow-y-auto` with flex column layout to guarantee headers and submit controls remain pinned and accessible on small phone viewports.

---

## Phase 4 — Regression Testing Results

All 43 automated tests across the High-Priority, Medium-Priority, and Low-Priority suites passed cleanly:

```bash
$ npx vitest run src/__tests__/high-priority-remediation.test.ts src/__tests__/medium-priority-remediation.test.ts src/__tests__/low-priority-remediation.test.ts

 RUN  v2.1.9 D:/yogesh/BothraCMS-main/BothraCMS-main

 ✓ src/__tests__/low-priority-remediation.test.ts (13 tests) 38ms
   ✓ Item 1: Remove Recent Site Photos Modal from Dashboard > does not contain lightboxPhoto state in dashboard page
   ✓ Item 1: Remove Recent Site Photos Modal from Dashboard > does not render the lightbox modal overlay markup on the dashboard
   ✓ Item 1: Remove Recent Site Photos Modal from Dashboard > preserves gallery display and provides direct external link for full resolution view
   ✓ Item 1: Remove Recent Site Photos Modal from Dashboard > preserves AttachmentManager and authorized photo viewing across other modules
   ✓ Item 2: Day Book Modal Explanatory Guidance > defines clear guidance metadata for PAYMENT, BILL, WORKFORCE, and DSR modes
   ✓ Item 2: Day Book Modal Explanatory Guidance > renders the explanatory guidance banner inside the Day Book entry modal
   ✓ Item 2: Day Book Modal Explanatory Guidance > handles keyboard Escape key and locks body scrolling when modal is active
   ✓ Item 2: Day Book Modal Explanatory Guidance > includes accessible dialog attributes and accessible close button
   ✓ Phase 2: Project-Wide UI, Typography & Formatter Verification > formats file sizes correctly across units using formatFileSize
   ✓ Phase 2: Project-Wide UI, Typography & Formatter Verification > maintains consistent formatting for currency, dates, and quantities
   ✓ Phase 2: Project-Wide UI, Typography & Formatter Verification > enforces title case consistency across navigation and headers
   ✓ Phase 2: Project-Wide UI, Typography & Formatter Verification > enforces Escape key listener and body scroll locking in shared Modal component
   ✓ Phase 2: Project-Wide UI, Typography & Formatter Verification > enforces Escape key listener and body scroll lock across major feature pages

 ✓ src/__tests__/medium-priority-remediation.test.ts (16 tests) 6188ms
   ✓ Item 1: User Permissions (Supervisor Audit Log Denial) > denies audit log access for SITE_SUPERVISOR via permission check
   ✓ Item 1: User Permissions (Supervisor Audit Log Denial) > allows audit log access for SUPER_ADMIN
   ✓ Item 2: Quick Action Modal Scoping > filters actions based on user permissions
   ✓ Item 2: Quick Action Modal Scoping > appends activeSiteId to siteScoped actions
   ✓ Item 3: How to Use Modal > implements escape key listener and background scroll lock
   ✓ Item 3: How to Use Modal > applies responsive sizing and break-words for mobile/desktop
   ✓ Item 4: Day Book Date Filter > parses and filters records within date range
   ✓ Item 4: Day Book Date Filter > rejects invalid date formats with 422
   ✓ Item 4: Day Book Date Filter > recalculates totals based on filtered records
   ✓ Item 5: Day Book Print Layout > includes print-specific css classes and hides interactive elements
   ✓ Item 5: Day Book Print Layout > renders official signature blocks for verification
   ✓ Item 6: Notification Unread Count > persists notification read status to database
   ✓ Item 7: Reports & Analytics Data Verification > computes accurate stock, payables, and attendance summaries
   ✓ Item 8: Project Page Filters > filters projects by text query, site, and status with pagination
   ✓ Item 9: Payment Out Bill Selection & Isolation > prevents allocating payment to a bill of a different vendor
   ✓ Item 9: Payment Out Bill Selection & Isolation > prevents allocating payment to another organization's bill (tenant isolation)

 ✓ src/__tests__/high-priority-remediation.test.ts (14 tests) 5642ms
   ✓ Issue 1 & 2: Supervisor Active Projects & Dashboard Access > gives supervisor access to all active projects when unassigned
   ✓ Issue 1 & 2: Supervisor Active Projects & Dashboard Access > restricts supervisor if assigned to specific projects only
   ✓ Issue 3: Active Construction Site Filter > correctly filters projects by siteId
   ✓ Issue 4: Attendance Checkout Reminder & Correction > flags open attendance over 8 hours
   ✓ Issue 4: Attendance Checkout Reminder & Correction > requires mandatory justification of at least 5 chars for attendance correction
   ✓ Issue 5: Remove "Submit Daily Report" from Finance Account > denies daily report submission for ACCOUNTANT role
   ✓ Issue 5: Remove "Submit Daily Report" from Finance Account > permits daily report submission for operational roles
   ✓ Issue 6: Edit Bill with Mandatory Justification & Audit Trail > allows editing bill with valid reason and recalculates amounts
   ✓ Issue 6: Edit Bill with Mandatory Justification & Audit Trail > prevents reducing bill total below already disbursed payment amount
   ✓ Issue 7: Require Reference / Voucher Number on Payments > rejects payment creation without reference number
   ✓ Issue 8: Exclude Rejected & Reversed Payments from Disbursed Totals > excludes REJECTED and REVERSED payments from financial totals
   ✓ Phase 2: PostgreSQL Migration Integrity > verifies PostgreSQL migration file contains valid DDL
   ✓ Phase 3: Presigned Direct Upload Security > enforces bounded file size and validates MIME types
   ✓ Phase 4: Coordinated Backup Manifest & RPO/RTO > generates coordinate backup manifest linking database metadata to object storage

 Test Files  3 passed (3)
      Tests  43 passed (43)
   Duration  24.12s
```

### Static Analysis & Build Verification
1. **TypeScript Typecheck**:
   ```bash
   $ npx tsc --noEmit
   # Exit code: 0 (Zero type errors)
   ```
2. **ESLint Verification**:
   ```bash
   $ npm run lint
   # Exit code: 0 (✔ No ESLint warnings or errors)
   ```
3. **Next.js Production Build**:
   ```bash
   $ npm run build
   # Exit code: 0 (Compiled 40/40 routes cleanly, optimized production artifacts generated)
   ```

---

## Changed Files Manifest

| File | Purpose / Modifications |
| :--- | :--- |
| `src/app/page.tsx` | Removed `lightboxPhoto` state and dashboard lightbox modal; added `<ExternalLink />` anchor on photo cards; added `Escape` key handling and scroll lock for KPI and quick task modals. |
| `src/app/day-book/page.tsx` | Added `modalModeGuidance` map and explanatory guidance banner for Payment Out, Enter Bill, Workforce Count, and Site DSR; added `Escape` key listener and scroll lock for log entry and KPI popups; added accessible dialog attributes. |
| `src/lib/formatters.ts` | Added `formatFileSize(bytes)` standardizing human-readable file size formatting across the application. |
| `src/components/attachments/AttachmentManager.tsx` | Integrated `formatFileSize` for attachment list display; preserved authorized attachment operations. |
| `src/components/ui/Modal.tsx` | Added `Escape` key dismiss listener, body scroll lock (`document.body.style.overflow = "hidden"`), and accessibility attributes (`role="dialog"`, `aria-modal="true"`). |
| `src/components/audit/AuditHistoryModal.tsx` | Added `Escape` key listener, scroll lock, backdrop click dismiss, and accessible dialog attributes. |
| `src/components/materials/PlaceOrderModal.tsx` | Added `Escape` key listener, scroll lock, and accessible modal attributes. |
| `src/components/layout/Shell.tsx` | Standardized title casing for `"Site Work"`, `"Accounts Export"`, and `"WhatsApp Inbox"`. |
| `src/lib/i18n.tsx` | Updated localized strings for navigation to Title Case consistency. |
| `src/app/exports/page.tsx` | Standardized page header title to `"Accounts Export"`. |
| `src/app/whatsapp/page.tsx` | Standardized page header title to `"WhatsApp Inbox"`. |
| `src/app/settings/messages/page.tsx` | Standardized descriptive copy to `"WhatsApp Inbox"`. |
| `src/app/attendance/page.tsx` | Added Attendance Correction modal with mandatory justification, `Escape` key listener, scroll lock, and action button in table rows for privileged users. |
| `src/app/finance/page.tsx` | Added `Escape` key listener and scroll lock for Payment, Bill, Reverse, and Attachment modals. |
| `src/app/projects/page.tsx` | Added `Escape` key listener and scroll lock for Create Project, Create Site, and Daily Report modals. |
| `src/app/tasks/page.tsx` | Added `Escape` key listener and scroll lock for Create, Edit, Status, Comments, and Attachment modals. |
| `src/app/materials/page.tsx` | Added `Escape` key listener and scroll lock for Receive, Issue, Transfer, Create Material, and Place Order modals. |
| `src/app/parties/page.tsx` | Added `Escape` key listener and scroll lock for Partner Edit and Bank Details modals. |
| `src/__tests__/low-priority-remediation.test.ts` | Created automated test suite covering all low-priority items, formatters, and accessibility controls (13 passing tests). |

---

## Remaining Defects & Operational Status

- **Unresolved Defects**: **NONE (0)**.
- **Breaking Changes**: None. All public APIs, database schemas, and permissions remain fully backward compatible.
- **Production Readiness**: BuildTrack Pro / BothraCMS is verified, hardened, and ready for deployment upon user authorization.
