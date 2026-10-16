# BothraCMS (BuildTrack Pro) — API Authorization & Multi-Tenant Boundary Matrix

**Audit Date:** October 17, 2026  
**Auditor:** Senior DevSecOps Engineer & API Architect  
**Architecture:** Next.js 14 App Router, Prisma ORM, Multi-Tenant PostgreSQL/SQLite  
**Status:** 100% Enforced Server-Side (UI checks are decorative; all authorization and tenant checks are executed on the server).

---

## 1. System-Wide Security Invariants

1. **Authentication:** Enforced by Next.js Edge Middleware (`src/middleware.ts`) and verified in route handlers via `getUserContext(req)` (`src/lib/auth.ts`). Unauthenticated requests receive HTTP 401 (`UNAUTHORIZED`).
2. **Multi-Tenant Isolation:** Every database operation scopes queries by `organizationId: user.organizationId`. Client-supplied organization IDs in request bodies or query parameters are ignored. In cross-tenant access attempts, queries return empty sets or HTTP 404 (`NOT_FOUND`), preventing tenant existence discovery and IDOR/BOLA attacks.
3. **Role-Based Access Control (RBAC):** Server-side guards (`assertPermission(user.role, permission)`) enforce role permissions before any business mutation. Unauthorized roles receive HTTP 403 (`FORBIDDEN`).
4. **Input Schema Validation:** All mutative endpoints parse incoming JSON payloads using strict `zod` schemas. Malformed inputs receive HTTP 422 (`VALIDATION_ERROR`).
5. **CSRF & Header Sanitization:** Middleware blocks cross-site mutative requests (`Origin`/`Referer` validation) with HTTP 403 and strips spoofed `x-user-*` headers.

---

## 2. Route-by-Route Authorization & Isolation Matrix

| # | Endpoint URL | Method | Auth Required | Required Role / Permission | Tenant Isolation Boundary | Input Validation Schema | Primary Mutation / Invariant Enforced | Expected Status Codes |
| :- | :--- | :---: | :---: | :--- | :--- | :--- | :--- | :--- |
| **1** | `/api/admin/tenants` | `GET` | Yes | `SUPER_ADMIN` | Global (Super Admin scope) | Query params (optional) | Aggregates tenant metrics across organizations | `200`, `401`, `403`, `500` |
| **2** | `/api/admin/tenants` | `PATCH` | Yes | `SUPER_ADMIN` | Target Org ID in body | `z.object({ organizationId, status, reason })` | Updates organization status (`ACTIVE`/`SUSPENDED`); creates audit event | `200`, `401`, `403`, `404`, `422`, `500` |
| **3** | `/api/auth/login` | `POST` | No (Public) | None | Public authentication | `z.object({ email, password })` | Verifies bcrypt password; issues signed HS256 JWT cookie; rate-limited (IP & Acct) | `200`, `400`, `401`, `422`, `429`, `503` |
| **4** | `/api/auth/logout` | `POST` | No | None | Clears session cookie | None | Sets session cookie `maxAge: 0` | `200` |
| **5** | `/api/auth/me` | `GET` | Yes | Valid Session | Scoped to active user & org | None | Returns verified user context and role permissions | `200`, `401` |
| **6** | `/api/health` | `GET` | No (Public) | None | None | None | Checks Prisma database connection; sanitized error output | `200`, `503` |
| **7** | `/api/organization` | `GET` | Yes | `org:settings` (`ORG_ADMIN`, `SUPER_ADMIN`) | `where: { id: user.organizationId }` | None | Returns organization profile, currency, and timezone | `200`, `401`, `403`, `404`, `500` |
| **8** | `/api/organization` | `PATCH` | Yes | `org:settings` (`ORG_ADMIN`, `SUPER_ADMIN`) | `where: { id: user.organizationId }` | `z.object({ name, currency, timezone })` | Updates organization profile; logs audit record | `200`, `401`, `403`, `422`, `500` |
| **9** | `/api/sites` | `GET` | Yes | `projects:read` | `where: { organizationId: user.organizationId }` | Query params (`status`) | Lists sites belonging to active organization | `200`, `401`, `403`, `500` |
| **10** | `/api/sites` | `POST` | Yes | `sites:manage` (`ORG_ADMIN`, `SUPER_ADMIN`) | `data: { organizationId: user.organizationId }` | `z.object({ code, name, address, latitude, longitude })` | Creates site and default site store; verifies code uniqueness | `201`, `400`, `401`, `403`, `409`, `422`, `500` |
| **11** | `/api/projects` | `GET` | Yes | `projects:read` | `where: { organizationId: user.organizationId }` | Query params (`siteId`, `status`) | Lists projects with manager and task counters | `200`, `401`, `403`, `500` |
| **12** | `/api/projects` | `POST` | Yes | `projects:write` | Scoped to site in organization | `createProjectSchema` | Creates project; validates site and manager ownership | `201`, `400`, `401`, `403`, `404`, `409`, `422`, `500` |
| **13** | `/api/projects/[id]` | `GET` | Yes | `projects:read` | `where: { id, organizationId: user.organizationId }` | Route param (`id`) | Returns project details, milestones, tasks, and site | `200`, `401`, `403`, `404`, `500` |
| **14** | `/api/tasks` | `GET` | Yes | `tasks:read` | `where: { organizationId: user.organizationId }` | Query params (`projectId`, `status`, `priority`) | Lists tasks with assignees and projects | `200`, `401`, `403`, `500` |
| **15** | `/api/tasks` | `POST` | Yes | `tasks:write` | Validates project & assignee in organization | `createTaskSchema` | Creates task; logs audit record | `201`, `400`, `401`, `403`, `404`, `422`, `500` |
| **16** | `/api/tasks/[id]/status` | `PATCH` | Yes | `tasks:write` | `where: { id, organizationId: user.organizationId }` | `z.object({ status, notes })` | Updates task status; records `TaskStatusHistory` entry | `200`, `400`, `401`, `403`, `404`, `422`, `500` |
| **17** | `/api/stores` | `GET` | Yes | `inventory:read` | `where: { organizationId: user.organizationId }` | Query params (`siteId`) | Lists warehouse stores in organization | `200`, `401`, `403`, `500` |
| **18** | `/api/materials` | `GET` | Yes | `inventory:read` | `where: { organizationId: user.organizationId }` | Query params (`category`, `lowStock`) | Returns catalog and stock balances across stores | `200`, `401`, `403`, `500` |
| **19** | `/api/materials` | `POST` | Yes | `inventory:adjust` | `data: { organizationId: user.organizationId }` | `createMaterialSchema` | Creates material; enforces unique material code | `201`, `400`, `401`, `403`, `409`, `422`, `500` |
| **20** | `/api/materials/[id]/ledger` | `GET` | Yes | `inventory:read` | Scopes material and movements to organization | Route param (`id`), query (`storeId`) | Returns chronologically ordered stock movements | `200`, `401`, `403`, `404`, `500` |
| **21** | `/api/inventory/receipts` | `POST` | Yes | `inventory:receipt` | Validates store & vendor in organization | `receiptSchema` | Atomically creates `StockMovement` (IN) and increments `StockBalance` | `201`, `400`, `401`, `403`, `404`, `422`, `500` |
| **22** | `/api/inventory/issues` | `POST` | Yes | `inventory:issue` | Validates store & material in organization | `issueSchema` | Negative balance prevention: throws if `currentStock < requested` | `200`, `400`, `401`, `403`, `404`, `422`, `500` |
| **23** | `/api/inventory/transfers` | `POST` | Yes | `inventory:transfer` | Validates source & target store in organization | `transferSchema` | Atomically decrements source store and increments target store | `200`, `400`, `401`, `403`, `404`, `422`, `500` |
| **24** | `/api/parties` | `GET` | Yes | `finance:read` | `where: { organizationId: user.organizationId }` | Query params (`partyType`) | Lists contractors/vendors with outstanding balances | `200`, `401`, `403`, `500` |
| **25** | `/api/parties` | `POST` | Yes | `finance:write` | `data: { organizationId: user.organizationId }` | `createPartySchema` | Creates vendor/contractor master record | `201`, `400`, `401`, `403`, `422`, `500` |
| **26** | `/api/parties/[id]/statement` | `GET` | Yes | `finance:read` | Scopes party, bills, payments to organization | Route param (`id`), query (`startDate`, `endDate`) | Calculates chronological ledger balance and running outstanding | `200`, `401`, `403`, `404`, `500` |
| **27** | `/api/finance/bills` | `GET` | Yes | `finance:read` | `where: { organizationId: user.organizationId }` | Query params (`partyId`, `status`) | Lists bills with lines and payment allocations | `200`, `401`, `403`, `500` |
| **28** | `/api/finance/bills` | `POST` | Yes | `finance:write` | Validates party & project in organization | `createBillSchema` | Atomically posts bill with lines in integer Paise | `201`, `400`, `401`, `403`, `404`, `422`, `500` |
| **29** | `/api/finance/payments` | `GET` | Yes | `finance:read` | `where: { organizationId: user.organizationId }` | Query params (`partyId`) | Lists recorded payments and allocations | `200`, `401`, `403`, `500` |
| **30** | `/api/finance/payments` | `POST` | Yes | `finance:write` | Validates party in organization | `recordPaymentSchema` | Idempotent payment recording (`idempotencyKey`) and atomic allocation | `201`, `400`, `401`, `403`, `404`, `422`, `500` |
| **31** | `/api/finance/payments/[id]/reverse` | `POST` | Yes | `finance:reverse` | `where: { id, organizationId: user.organizationId }` | `z.object({ reason })` | Reverses payment; restores bill balances; blocks double reversals | `200`, `400`, `401`, `403`, `404`, `422`, `500` |
| **32** | `/api/workforce` | `GET`, `POST` | Yes | `attendance:read`, `attendance:write` | `where: { organizationId: user.organizationId }` | `createWorkforceSchema` | Manages worker directory and wage rates in paise | `200`, `201`, `400`, `401`, `403`, `422`, `500` |
| **33** | `/api/attendance` | `GET` | Yes | `attendance:read` | `where: { organizationId: user.organizationId }` | Query params (`siteId`, `workDate`) | Lists attendance sessions with worker details | `200`, `401`, `403`, `500` |
| **34** | `/api/attendance/check-in` | `POST` | Yes | `attendance:write` | Scopes worker & site to organization | `checkInSchema` | Enforces single check-in per day; captures GPS coordinates | `201`, `400`, `401`, `403`, `404`, `422`, `500` |
| **35** | `/api/attendance/check-out` | `POST` | Yes | `attendance:write` | Scopes session to organization | `checkOutSchema` | Records check-out time and exit coordinates | `200`, `400`, `401`, `403`, `404`, `422`, `500` |
| **36** | `/api/attendance/[id]/correct` | `POST` | Yes | `attendance:correct` | Scopes session to organization | `correctAttendanceSchema` | Updates status; requires min 5-character reason; logs audit | `200`, `400`, `401`, `403`, `404`, `422`, `500` |
| **37** | `/api/measurement-book` | `GET` | Yes | `projects:read` | Scopes project to organization | Query params (`projectId`, `status`) | Lists measurement entries with dimension calculations | `200`, `401`, `403`, `500` |
| **38** | `/api/measurement-book` | `POST` | Yes | Role-dependent per action | Scopes entry & project to organization | Action dispatcher schema | Workflows: `CREATE`, `VERIFY`, `APPROVE`, `CONVERT_BILL` | `200`, `201`, `400`, `401`, `403`, `404`, `422`, `500` |
| **39** | `/api/daily-reports` | `GET`, `POST` | Yes | `projects:read`, `projects:write` | Scopes site & project to organization | `createDsrSchema` | Records daily progress, weather, labor, and plant issues | `200`, `201`, `400`, `401`, `403`, `404`, `422`, `500` |
| **40** | `/api/dashboard/kpi` | `GET` | Yes | Valid Session | Scopes all aggregations to organization | Query params (`siteId`, `startDate`, `endDate`) | Aggregates live financial, inventory, task, and attendance metrics | `200`, `401`, `403`, `500` |
| **41** | `/api/day-book` | `GET` | Yes | `finance:read` | Scopes cash/bank/materials to organization | Query params (`siteId`, `date`) | Compiles unified daily financial and inventory ledger | `200`, `401`, `403`, `500` |
| **42** | `/api/audit` | `GET` | Yes | `audit:read` (`ORG_ADMIN`, `SUPER_ADMIN`) | `where: { organizationId: user.organizationId }` | Query params (`limit`, `action`, `entityType`) | Returns tamper-evident immutable audit log entries | `200`, `401`, `403`, `500` |
| **43** | `/api/notifications` | `GET` | Yes | Valid Session | Scoped to active organization | None | Dynamically detects overdue bills and low-stock alerts | `200`, `401`, `500` |
| **44** | `/api/uploads` | `GET` | Yes | Valid Session | `where: { organizationId: user.organizationId }` | None | Lists uploaded documents with metadata | `200`, `401`, `500` |
| **45** | `/api/uploads` | `POST` | Yes | Valid Session | Enforces file ownership in organization | Multi-part form data | Magic bytes check; max 5 MB; stores on S3/R2/Local | `201`, `400`, `401`, `422`, `500` |
| **46** | `/api/uploads/[id]` | `GET` | Yes | Valid Session | Scoped by `AuditEvent` organizationId | Route param (`id`) | IDOR defense: returns 404 for other tenants; CSP sandbox | `200`, `401`, `404`, `500` |

---

## 3. IDOR Attack Simulation & Verification

The multi-tenant boundary security was empirically tested via automated suite `src/__tests__/phase6-security-audit.test.ts`:
1. **Cross-Tenant Billing Attack:** Tenant B attempted to post a bill specifying Tenant A's `partyId`. -> **Rejected with HTTP 404 (`Vendor/Contractor not found`)**.
2. **Cross-Tenant Inventory Theft Attack:** Tenant B attempted to issue materials from Tenant A's `storeId`. -> **Rejected with HTTP 404 (`Store not found or outside organization scope`)**.
3. **Cross-Tenant Attendance Manipulation Attack:** Tenant B attempted to log check-in for Tenant A's `workerId` at Tenant A's `siteId`. -> **Rejected with HTTP 404 (`Workforce member not found`)**.
4. **Cross-Tenant Document Disclosure Attack:** Tenant B attempted to download private documents uploaded by Tenant A (`/api/uploads/[fakeId]`). -> **Rejected with HTTP 404 (`NOT_FOUND`)**.
