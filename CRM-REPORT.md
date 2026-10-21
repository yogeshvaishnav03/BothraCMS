# BuildTrack Pro / BothraCMS — Full Codebase & Architecture Report

> **How to use this file:** It is a self-contained description of the CRM in `C:\Users\Owner\Desktop\crm`, written so another AI assistant (e.g. ChatGPT) can understand the whole system without seeing the code. It was produced by reading the source code directly (not just the project's own docs). Where the project's own docs claim something the code does not back up, this report says so.
>
> Report date: 21 Oct 2026.

---

## 1. What the product is

**BuildTrack Pro** (also branded **BothraCMS**, package name `build-track-pro`) is a multi-tenant web application for **construction companies** (Indian market: INR currency, Asia/Kolkata timezone, GST, Hindi UI option). Despite being called a "CRM", it is really a **construction ERP / site-operations platform**. It connects:

- Projects, tasks and daily site reports
- Materials, site stores and an authoritative stock ledger (receipts, issues, transfers)
- Purchase orders to vendors (with approval and WhatsApp/email dispatch links)
- Vendors & contractors (parties), bills, payments, payment approvals and ledgers
- Measurement Book (L × B × D × N field measurements → contractor bills)
- Workforce registry, GPS attendance and daily contractor headcount
- A "Day Book" (daily activity ledger across all modules)
- Document folders with per-folder permissions and file attachments
- Internal team chat (direct + group) and in-app notifications
- Audit log, reports (CSV export), and a Super Admin console across tenants

Target users: company owner/Super Admin, org admins, project managers, site supervisors (mobile-first), storekeepers, accountants, HR/attendance viewers and read-only auditors.

---

## 2. Tech stack

### Frontend / UI
| Area | Technology |
|---|---|
| Framework | **Next.js 14** (App Router), **React 18**, **TypeScript** |
| Rendering | Almost every page is a large **client component** (`"use client"`) that fetches JSON from `/api/*` with `fetch()` — not server components |
| Styling | **Tailwind CSS 3** (+ `clsx`, `tailwind-merge`), small `globals.css` |
| Icons | `lucide-react` |
| Tables | Custom spreadsheet-style table component `components/ui/ExcelTable.tsx` (sorting, filtering, column headers, toolbar) |
| i18n | Custom React context `lib/i18n.tsx` — **English + Hindi** (`en`, `hi`) |
| UX extras | `Shell.tsx` (sidebar/top bar/mobile dock, notification bell), `QuickActionLauncher.tsx` (quick-action drawer), `InteractiveGuideModal.tsx` (bilingual in-app guide/tutorial) |
| Client state | No Redux/React Query. Local `useState` per page. `lib/client-cache.ts` is now a pass-through that **deletes old localStorage business data** (earlier versions stored data in the browser) |
| Real-time | **Polling only**: notifications every 5 s (Shell), chat messages every 4 s. No WebSockets/Pusher, despite `.env.example` mentioning Pusher |

### Backend
| Area | Technology |
|---|---|
| API | Next.js **Route Handlers** under `src/app/api/**/route.ts` (REST-style JSON) |
| Business logic | Service classes in `src/services/*` (Finance, Inventory, Attendance, MeasurementBook, Dashboard, WorkforceHeadcount, Reminder, Seed) |
| ORM / DB | **Prisma 5**. `schema.prisma` declares **SQLite** (`prisma/dev.db`). `scripts/prepare-db.js` rewrites the provider to **PostgreSQL** at build time if `DATABASE_URL` starts with `postgres://` and then runs `prisma db push` (no migration files are used) |
| Auth | Email + password, **bcryptjs** hashes, **JWT (HS256) via `jose`**, 7-day expiry, HTTP-only cookie (Bearer token also accepted) |
| Validation | **Zod** schemas in each route |
| Security | `src/middleware.ts`: auth gate for pages & APIs, CSRF check (Origin/Referer vs host + `TRUSTED_ORIGINS`), Bearer exemption. Rate limiting (`lib/rate-limiter.ts`, DB-backed with in-memory fallback). Security headers in `next.config.mjs` (HSTS, X-Frame-Options DENY, nosniff, etc.) |
| Files | `lib/storage.ts`: pluggable **Local disk** provider or **S3 / Cloudflare R2** provider (hand-written SigV4 signing, no AWS SDK). Uploads limited to 5 MB, PNG/JPEG/WEBP/PDF etc., with magic-byte validation |
| Money | Stored as **integer paise** (`lib/financial-math.ts`) |
| Testing | **Vitest** (31 unit/integration test files in `src/__tests__`), **Playwright** (11 e2e specs in `e2e/`, runs against `next start -p 3005`) |
| Deploy | Vercel (`vercel.json`) or Node/PM2/Docker. Backup/restore scripts for SQLite |

### Dependencies (package.json)
Runtime: `next`, `react`, `react-dom`, `@prisma/client`, `bcryptjs`, `jose`, `zod`, `lucide-react`, `clsx`, `tailwind-merge`.
Dev: `prisma`, `typescript`, `tailwindcss`, `postcss`, `autoprefixer`, `eslint`, `vitest`, `@playwright/test`, `tsx`.

### npm scripts
`dev`, `build` (prepare-db + next build), `start` (prepare-db + next start), `lint`, `prisma:generate|migrate|push`, `seed`, `test` (vitest), `test:e2e` (playwright), `db:backup`, `db:restore`, `admin:bootstrap` (create Super Admin).

---

## 3. Folder structure

```
crm/
├── .env / .env.example          # env config (DATABASE_URL, SESSION_SECRET, S3_*, TRUSTED_ORIGINS…)
├── package.json, tsconfig.json, next.config.mjs, tailwind.config.ts, postcss.config.js
├── vercel.json, playwright.config.ts, vitest.config.ts, .eslintrc.json
├── prisma/
│   ├── schema.prisma            # 33 models (see §5)
│   ├── seed.ts                  # CLI seed
│   ├── dev.db, dev.db.bak       # local SQLite databases (~1.1 MB each, git-ignored)
├── scripts/                     # ops scripts
│   ├── prepare-db.js            # switches sqlite/postgres provider, runs db push
│   ├── create-super-admin.ts    # bootstrap first Super Admin
│   ├── db-backup.js / db-restore.js
│   ├── seed-100-demo-data.js, seed-daybook-demo-data.js, seed-projects-and-orders.js
│   ├── migrate-data-to-db.js, check-db.js, performance-benchmark.js
│   └── verify-*.js              # staging/baseline/backup verification scripts
├── src/
│   ├── middleware.ts            # auth + CSRF + redirect guard
│   ├── app/                     # Next.js App Router
│   │   ├── layout.tsx, globals.css
│   │   ├── page.tsx             # Dashboard (≈3,300 lines / 173 KB, single file)
│   │   ├── login/               # login page
│   │   ├── admin/               # Super Admin console (tenants, approvals, demo seed)
│   │   ├── projects/, projects/[id]/
│   │   ├── tasks/
│   │   ├── day-book/
│   │   ├── materials/, materials/[id]/
│   │   ├── measurement-book/
│   │   ├── parties/, parties/[id]/   # vendors & contractors
│   │   ├── finance/
│   │   ├── workforce/, attendance/
│   │   ├── reports/, audit/, chat/, settings/
│   │   └── api/                 # ~60 route files (see §6)
│   ├── components/
│   │   ├── layout/Shell.tsx               # app shell, nav, notifications
│   │   ├── ui/ExcelTable.tsx              # spreadsheet-style table
│   │   ├── ui/QuickActionLauncher.tsx     # quick actions drawer
│   │   ├── ui/InteractiveGuideModal.tsx   # bilingual in-app guide
│   │   ├── materials/PlaceOrderModal.tsx  # purchase order flow
│   │   ├── attachments/AttachmentManager.tsx
│   │   └── audit/AuditHistoryModal.tsx
│   ├── lib/
│   │   ├── db.ts                # Prisma client singleton
│   │   ├── auth.ts, server-auth.ts, jwt-secret.ts   # JWT/session/user context
│   │   ├── permissions.ts       # roles → permissions map, assertPermission()
│   │   ├── rate-limiter.ts, api-response.ts (jsonSuccess/jsonError/handleApiError)
│   │   ├── storage.ts           # Local / S3 / R2 storage providers
│   │   ├── financial-math.ts, formatters.ts
│   │   ├── i18n.tsx             # en/hi translations
│   │   ├── order-notifications.ts  # builds WhatsApp/email links for POs
│   │   ├── client-cache.ts      # purges legacy localStorage data
│   │   └── dynamic-store.ts     # OLD in-memory demo store — not imported anywhere (dead code)
│   ├── services/                # business logic (see §7)
│   └── __tests__/               # 31 Vitest files
├── e2e/                         # 11 Playwright specs
├── storage/ (backups/, data/, uploads/)   # local file storage
├── docs/                        # ~37 markdown docs (PRD, architecture, phase reports…)
├── SECURITY_REMEDIATION/        # copies of middleware/jwt/health code + tests + docs
└── ~15 root-level *.md reports  # audits, readiness, blockers, deployment guides
```

Page code is large: the 17 page files total ≈ 24,000 lines; there are ~340 uses of `: any`.

---

## 4. Architecture (how it fits together)

```
Browser (desktop office / supervisor phone)
   │  HTTPS, HTTP-only JWT cookie
   ▼
src/middleware.ts ──► public paths (/login, /api/auth/login, /api/health…) pass
   │                   otherwise: verify JWT (HS256); for mutating API calls with
   │                   cookie auth, verify Origin/Referer (CSRF); redirect pages to /login
   ▼
Next.js App Router
   ├── Pages (client components) ── fetch('/api/…') ──┐
   └── API route handlers (/api/**/route.ts) ◄────────┘
          │ getUserContext(req)  → { userId, organizationId, role, … }
          │ assertPermission(role, "finance:write") etc.
          │ Zod validation
          ▼
      Services (FinanceService, InventoryService, AttendanceService, …)
          │ prisma.$transaction(...) for multi-row writes + AuditEvent rows
          ▼
      Prisma ORM ──► SQLite (local) / PostgreSQL (production)
      Storage provider ──► local disk (storage/uploads) or S3/R2
```

Key architectural rules (enforced in code):
1. **Multi-tenancy:** every business table has `organizationId`; every query is scoped to the caller's org. Non-admin roles are further limited to assigned projects (`ProjectAssignment`).
2. **RBAC:** 8 roles × 20 permissions in `lib/permissions.ts`:
   - Roles: `SUPER_ADMIN`, `ORG_ADMIN`, `PROJECT_MANAGER`, `SITE_SUPERVISOR`, `ACCOUNTANT`, `STOREKEEPER`, `HR_VIEWER`, `AUDITOR`.
   - Permissions: `org:settings, users:manage, sites:manage, projects:read/write, tasks:read/write, inventory:read/receipt/issue/transfer/adjust, finance:read/write/reverse, attendance:read/write/correct, reports:read, audit:read`.
3. **Stock is ledger-derived:** stock on hand = sum of `StockMovement` rows; `StockBalance` is a cached projection updated in the same transaction. Negative stock is rejected. Transfers create a paired TRANSFER_OUT / TRANSFER_IN in one transaction.
4. **Finance:** bills (with lines) are liabilities; payments are allocated to bills via `PaymentAllocation`; outstanding = bills − allocations. Payments have idempotency keys; reversals restore open balances and are audited.
5. **Approvals:** purchase orders and payments raised by non-admins go to `PENDING_APPROVAL` and are approved/rejected from the Super Admin console.
6. **Audit:** most mutations write an `AuditEvent` (actor, entity, before/after JSON, reason).
7. **Soft delete:** projects, tasks, materials, parties, bills, payments, workers, attendance, folders, attachments have `archivedAt/archivedById/archiveReason`.

---

## 5. Data model (Prisma, 33 models)

| Domain | Models |
|---|---|
| Tenancy & users | `Organization` (currency, timezone, settingsJson, status), `User` (role, status, lastLoginAt), `Site` (code, address, lat/lng), `Store` (per site, e.g. YARD) |
| Projects & work | `Project` (site, manager, dates, budget, archive), `ProjectAssignment`, `Task` (assignee, dueAt, reminderAt, completed/verified by), `TaskStatusHistory`, `TaskComment`, `DailySiteReport` (progress, blockers, safety notes) |
| Inventory | `MaterialCategory`, `Material` (sku, unit, minStock), `StockBalance`, `StockMovement` (RECEIPT/ISSUE/TRANSFER_IN/OUT/ADJUSTMENT, vendor, project, task, reversalOf), `PurchaseOrder` (order number, qty, rate, status, expected delivery, notification sent) |
| Finance | `Party` (VENDOR/CONTRACTOR), `Bill`, `BillLine`, `Payment` (method, paying account, status, approval, reversal, idempotency), `PaymentAllocation` |
| Measurement Book | `MeasurementBookEntry` (L/B/D/N, status DRAFT→SUBMITTED→VERIFIED→APPROVED, linked billId) |
| Workforce | `WorkforceMember` (employeeCode, trade, wage, default site), `AttendanceSession` (check-in/out time + GPS + accuracy, corrections), `WorkforceHeadcount` (daily contractor headcount per site) |
| Documents | `DocumentFolder` (nested via parentId), `FolderPermission` (VIEW/UPLOAD/DELETE per user), `Attachment` (linked to project/folder/task/stock movement/attendance/material/payment) |
| Collaboration | `Conversation`, `ConversationParticipant` (lastReadAt), `ChatMessage` (text + image), `Notification` |
| System | `AuditEvent`, `RateLimitRecord`, `IdempotencyRecord` (also used to store base64 copies of uploaded files) |

Money fields are integer paise.

---

## 6. API surface (all under `/api`)

| Area | Routes (methods) |
|---|---|
| Auth | `auth/login` POST, `auth/logout` POST, `auth/me` GET, `auth/change-password` POST |
| Super Admin | `admin/tenants` GET (list orgs) / PATCH (suspend/activate), `admin/seed` POST (generate demo data) |
| Org setup | `organization` GET/PATCH, `sites` GET/POST, `stores` GET/POST |
| Dashboard | `dashboard/kpi` GET |
| Projects | `projects` GET/POST, `projects/[id]` GET/PATCH/DELETE, `projects/[id]/assignments` GET/POST/DELETE, `projects/[id]/folders` GET/POST, `projects/[id]/folders/[folderId]` GET/PATCH/DELETE, `…/[folderId]/permissions` |
| Tasks | `tasks` GET/POST/DELETE, `tasks/[id]` GET/PATCH, `tasks/[id]/status` PATCH, `tasks/[id]/comments` GET/POST |
| Daily reports | `daily-reports` GET/POST, `day-book` GET/POST |
| Materials & stock | `materials` GET/POST/DELETE, `materials/[id]` GET/PATCH/DELETE, `materials/[id]/ledger` GET, `inventory/receipts` POST, `inventory/issues` POST, `inventory/transfers` POST |
| Purchase orders | `orders` GET/POST, `orders/[id]` GET/PATCH, `orders/[id]/approve` POST, `orders/[id]/reject` POST |
| Parties | `parties` GET/POST/DELETE, `parties/[id]` GET/PATCH, `parties/[id]/statement` GET |
| Finance | `finance/bills` GET/POST, `finance/payments` GET/POST, `finance/payments/[id]/approve|reject|reverse` POST |
| Measurement Book | `measurement-book` GET/POST |
| Workforce | `workforce` GET/POST/DELETE, `workforce/headcount` GET/POST/DELETE |
| Attendance | `attendance` GET, `attendance/check-in` POST, `attendance/check-out` POST, `attendance/history` GET, `attendance/[id]/correct` POST |
| Files | `uploads` POST/GET, `uploads/[id]` GET (streams file, access-checked), `attachments` GET/POST, `attachments/[id]` PUT/DELETE |
| Chat | `chat/conversations` GET, `chat/conversations/direct` POST, `chat/conversations/group` POST, `chat/conversations/[id]/messages` GET/POST, `chat/employees` GET, `chat/unread-count` GET |
| Other | `notifications` GET/PATCH (also triggers due-task reminders), `audit` GET, `health` GET |

Standard response shape: `{ success: true, data }` or `{ success: false, error: { code, message } }` via `lib/api-response.ts`.

---

## 7. Main business logic (services)

- **FinanceService** — `createBill` (lines, GST math), `recordPayment` (idempotency, paying account, allocations to bills, approval status logic), `approvePayment`, `rejectPayment`, `reversePayment` (restores bill balances, audited), `getPartyStatement` (running ledger).
- **InventoryService** — `receiveGoods` (GRN, +stock, optional challan photo), `issueGoods` (−stock, linked to project/task, blocks negative stock), `transferGoods` (paired movements in one transaction), `adjustStock`, `getMaterialLedger`, `reconcileStockBalance`, `getAuthoritativeStockSummary`, low-stock alerts (notification when balance < minStock).
- **AttendanceService** — `checkIn` (one open session per worker/day/site, GPS snapshot), `checkOut`, `correctAttendance` (mandatory reason + audit), `getDailyAttendance`.
- **MeasurementBookService** — `createEntry` (L×B×D×N quantity), `updateStatus` (DRAFT→SUBMITTED→VERIFIED→APPROVED), `convertToBill` (atomic, rejects double billing), `listEntries`.
- **WorkforceHeadcountService** — daily contractor headcount per site: list/save (upsert)/delete/summary.
- **DashboardService** — KPIs: active projects, tasks due today / overdue, workers present today, low-stock items, payments made today, outstanding payables (aging), scoped by org/site/user.
- **ReminderService** — delivers due-task reminder notifications, mark read / mark all read.
- **Purchase orders** (logic inside `api/orders`) — PO number `PO-YYYYMMDD-XXXX`; non-Super-Admin orders go to `PENDING_APPROVAL`; on approval, `order-notifications.ts` builds a pre-filled **WhatsApp (wa.me) link and email (mailto)** for the vendor.
- **Seed services** — `seed-service.ts` (one-click full demo tenant) and `day-book-seed-service.ts` (demo data for the Day Book).

---

## 8. UI pages (what each screen does)

| Route | Screen |
|---|---|
| `/login` | Email/password login |
| `/` | Executive dashboard: KPI cards, tasks due/overdue, low stock, payables, today's attendance, quick check-in/out, recent uploads, headcount |
| `/day-book` | Daily ledger of all activity for a date/site: payments, bills, receipts, issues, attendance, headcount, daily reports; "Load Demo Data" button |
| `/projects`, `/projects/[id]` | Project directory, budget/timeline, assignments, document folders & folder permissions, attachments, tasks |
| `/tasks` | Task list/board, personal tasks, status workflow (TODO→IN_PROGRESS→BLOCKED→COMPLETED→VERIFIED), comments, reminders |
| `/materials`, `/materials/[id]` | Material catalog, stock per store, GRN / issue / transfer forms, ledger with running balance, purchase orders (Place Order modal) |
| `/measurement-book` | MB entries, approval stages, convert to contractor bill |
| `/parties`, `/parties/[id]` | Vendors & contractors, ledger statement |
| `/finance` | Bills, payments, allocations, approval queue, reversals, payables aging |
| `/workforce` | Worker registry, daily contractor headcount (all-sites filter) |
| `/attendance` | GPS check-in/out, history, corrections |
| `/reports` | Stock, payables and attendance reports with Excel-style tables and **CSV export** |
| `/audit` | Audit log viewer |
| `/chat` | Direct and group chat with image sharing, unread counts (polling) |
| `/settings` | Organization profile (name/currency/timezone/settings), change password, language switch |
| `/admin` | Super Admin only: tenants list + suspend, cross-tenant PO & payment approval queues, one-click demo data |

UI style: Tailwind, card layouts, mobile dock + quick-action drawer for supervisors, English/Hindi toggle, in-app interactive guide.

---

## 9. What is COMPLETE (implemented and wired end-to-end in code)

- Login/logout, JWT sessions, change password, auth middleware, CSRF protection, rate limiting, security headers.
- Multi-tenant scoping and 8-role RBAC on API routes; project-level assignments.
- Sites and stores creation (yard store auto-created per site).
- Projects (CRUD + soft archive), project assignments, nested document folders with folder ACLs, attachments.
- Tasks with status history, comments, attachments, due-date reminders (in-app).
- Daily site reports.
- Material catalog, GRN, issue, transfer, ledger, low-stock alerts, negative-stock prevention.
- Purchase orders with approval/rejection and WhatsApp/email dispatch links.
- Vendors/contractors, bills with lines, payments with allocations, idempotency, approval queue, reversal, party statements.
- Measurement Book with 4-stage workflow and conversion to bills.
- Workforce registry, daily headcount, GPS attendance check-in/out, supervisor corrections.
- Dashboard KPIs from the database.
- Day Book view.
- Chat (direct + group, images, unread counts) and in-app notifications.
- Audit log + viewer, CSV reports.
- Super Admin console: tenant list, suspend/activate, approval queues.
- File storage abstraction with local disk and S3/R2, upload type/size/magic-byte validation.
- English/Hindi UI.
- Test suites: 31 Vitest files + 11 Playwright e2e specs; backup/restore scripts.

The project's own docs (`docs/PHASE_4_FINAL_RELEASE_STATUS.md`) claim 270/270 tests passing, 0 TypeScript errors and a clean build, and classify it as "READY FOR CONTROLLED PRODUCTION DEPLOYMENT". **This report did not run the tests or build**; those numbers are the project's own claims.

---

## 10. What is INCOMPLETE, MISSING or RISKY (found in the code)

### 10.1 Missing features (asked for in the PRD but not implemented)
1. **User management is missing.** There is no API or UI to create, invite, edit, deactivate users or change their roles. Users only come from `scripts/create-super-admin.ts` or the demo seed. (PRD persona 1: "invites users, assigns permissions".)
2. **Tenant (organization) creation is missing.** `/api/admin/tenants` only lists and suspends; there is no "create new company" flow.
3. **Stock adjustment has no endpoint.** `InventoryService.adjustStock` exists and the `inventory:adjust` permission exists, but no API route or UI calls it. Physical stock counts are therefore not possible.
4. **Credit notes are not implemented** (PRD Epic E formula "Bills − Credit Notes − Payments").
5. **Sites and stores cannot be edited or deleted** (GET/POST only).
6. **Measurement Book status change / convert-to-bill**: service functions exist; the only MB route is `GET/POST /api/measurement-book` — verify the UI reaches `updateStatus`/`convertToBill` through that POST (route matrix suggests it multiplexes actions).
7. **Reports are limited** to three CSV exports (stock, payables, attendance). No PDF, no project cost report, no P&L, no date-range financial summaries.
8. **No external notifications.** WhatsApp/SMS/email are only pre-filled `wa.me`/`mailto` links the user must click. No WhatsApp API, SMS gateway or email sending, even though `.env.example` lists keys for them.
9. **No real-time push.** Chat and notifications are polled every 4–5 s; Pusher in `.env.example` is not used.
10. **Due-task reminders have no scheduler.** They are only delivered when someone's browser polls `/api/notifications`; there is no cron job.
11. **No database migrations.** Schema is applied with `prisma db push`; there is no `prisma/migrations` history, which is risky for production schema changes.
12. **Production deployment not done.** Per the project's own docs, live deployment and production smoke tests are "NOT RUN" (needs PostgreSQL, SESSION_SECRET, S3 bucket, domain, `TRUSTED_ORIGINS`).

### 10.2 Logic bugs / risks to fix before real use
1. **Day Book auto-seeds fake data into real companies.** `GET /api/day-book` checks whether the selected date has any activity; if not, it calls `DayBookSeedService.seedDemoDataForOrg` and **writes demo projects, parties, bills, payments, stock movements, attendance and possibly a user into the live tenant**. Any logged-in user opening an empty date triggers it. The "Load Demo Data" button (POST) does the same. This should be removed or restricted to Super Admin in demo tenants.
2. **Super Admin "Add Demo Data" creates accounts with a known password** (`Password123!` for `superadmin@ / admin@ / pm@ / supervisor@ / store@ / finance@buildtrack.pro`). Running it on a production tenant creates guessable logins.
3. **Payment approval can be bypassed.** In `FinanceService.recordPayment`, any role with `finance:write` (e.g. `ACCOUNTANT`) can send `autoApprove: true` and the payment is posted immediately without Super Admin approval.
4. **SESSION_SECRET auto-generation in `next.config.mjs`.** If the secret is missing, the build generates a random one and appends it to `.env`. On serverless/multiple instances this can yield different secrets per instance (random logouts). Production should fail fast instead. The secret is also passed via `nextConfig.env`, which would inline it into any client bundle that references it — keep it server-only.
5. **Uploaded files are duplicated into the database** as base64 inside `IdempotencyRecord` (fallback for serverless). This bloats the DB and bypasses the storage provider.
6. **SQLite is the default database.** Fine for local, not for multi-user production; the Postgres switch happens by rewriting `schema.prisma` at build time.
7. **Dead / duplicate code:** `lib/dynamic-store.ts` (≈38 KB in-memory demo store) is not imported anywhere; `SECURITY_REMEDIATION/implementations/*` are copies of `middleware.ts`, `jwt-secret.ts` and the health route; `SECURITY_REMEDIATION/README.md` and `README_DELIVERABLES.md` are identical.
8. **Maintainability:** very large single-file pages (dashboard ≈3,300 lines / 173 KB, finance ≈124 KB, day-book ≈120 KB), ~340 `any` types, no shared data-fetching layer.
9. **Documentation sprawl and contradictions:** ~50 markdown reports (phases 2–7, multiple security audits). Numbers disagree (e.g. `REMAINING_BLOCKERS.md` says 105 tests in 10 suites; Phase 4 says 270 tests in 31 files). Several docs link to a different machine path (`d:/yogesh/BothraCMS-main/...`). The README still says to run `prisma migrate dev`, but the project uses `db push`.
10. `.env.example` uses `S3_BUCKET`/`AWS_*` names while `REMAINING_BLOCKERS.md` tells you to set `STORAGE_PROVIDER`/`STORAGE_BUCKET`/…; the code reads `S3_BUCKET`/`AWS_*`/`R2_*`. Use the code's names.

### 10.3 Partially done / needs verification
- Low-stock alert notifications are in-app only.
- Budget tracking exists on projects, but there is no consolidated project cost vs. budget report (material + labour + bills).
- Offline support for supervisors is claimed in the README ("offline-friendly") but there is no service worker or offline queue.
- E2E Playwright suite exists, but no CI configuration (no `.github/workflows`) was found in the folder.

---

## 11. Environment variables used

`DATABASE_URL` (also accepts `POSTGRES_PRISMA_URL`, `POSTGRES_URL`), `DIRECT_URL`, `SESSION_SECRET` (≥32 chars), `NODE_ENV`, `PORT`, `TRUSTED_ORIGINS`, `NEXT_PUBLIC_APP_URL`, `STORAGE_DIR`, `S3_BUCKET` / `AWS_S3_BUCKET` / `R2_BUCKET`, `AWS_ACCESS_KEY_ID` / `R2_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` / `R2_SECRET_ACCESS_KEY`, `AWS_REGION` / `S3_REGION`, `S3_ENDPOINT` / `R2_ENDPOINT`, `DEFAULT_TIMEZONE`, `DEFAULT_CURRENCY`. Listed but unused: `WHATSAPP_*`, `SMS_*`, `PUSHER_*`.

---

## 12. Suggested next steps (priority order)

1. Remove automatic demo seeding from `GET /api/day-book`; gate all demo seeding behind Super Admin + a non-production flag; stop creating known-password accounts.
2. Close the `autoApprove` payment bypass (only `SUPER_ADMIN`/`ORG_ADMIN` may auto-post).
3. Build **user management** (invite/create, role change, deactivate, reset password) and **tenant creation**.
4. Add the **stock adjustment / stock count** endpoint + UI, and **credit notes**.
5. Move to PostgreSQL with real Prisma migrations; make missing `SESSION_SECRET` a hard failure in production.
6. Add a scheduled job (Vercel Cron or similar) for reminders and low-stock alerts; optionally WhatsApp Business API / email sending.
7. Split the giant page files into components + a shared data hook; reduce `any`.
8. Delete dead code (`dynamic-store.ts`, `SECURITY_REMEDIATION/implementations`) and consolidate the docs into one current README + architecture doc.
9. Add CI (lint, typecheck, vitest, playwright) and run the production smoke tests after deploying.
