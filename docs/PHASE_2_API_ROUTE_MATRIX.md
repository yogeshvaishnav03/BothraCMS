# Phase 2: Complete API Route Audit Matrix

**Total Monitored API Routes:** 60  
**Application:** Build Track Pro / BothraCMS  
**Audit Scope:** HTTP methods, schemas, authentication, RBAC, tenant isolation, resource ownership, input validation, rate limiting, transaction integrity, and audit logging.

---

## 1. Authentication & System Core Routes

| Route | Methods | Expected Schema | Auth Required | Role / Permissions | Tenant Isolation | Resource Ownership | Rate Limiting | Audit Logging | Test Coverage |
|---|---|---|---|---|---|---|---|---|---|
| `/api/auth/login` | POST | `{ email: string, password: string }` | None (Public) | None | Authenticates within user's organization | N/A | Distributed DB limiter (30 IP / 5 acct) | Server Auth Log | `rate-limiter-and-error-disclosure.test.ts` |
| `/api/auth/logout` | POST | None | Cookie/Bearer | Any authenticated | Scoped to active session | Session cookie invalidated | Standard | Logout trace | `phase6-security-audit.test.ts` |
| `/api/auth/me` | GET | None | Cookie/Bearer | Any authenticated | Returns current user's org info | Bound to `token.userId` | Standard | None (Read) | `phase6-security-audit.test.ts` |
| `/api/health` | GET | None | None | None | N/A | System status check | Standard | None | `health-route.test.ts` |
| `/api/admin/seed` | POST | `{ secret?: string }` | Token / Secret | SUPER_ADMIN / Dev Seed | Scoped to seeded org | System-level initialization | Strict Rate Limit | System Log | `admin-seed.test.ts` |
| `/api/admin/tenants` | GET, POST | `{ name: string, currency?: string }` | Cookie/Bearer | SUPER_ADMIN | Platform-wide tenant registry | Organization container | Strict | Admin Audit | `phase6-security-audit.test.ts` |
| `/api/organization` | GET, PATCH | `{ name?: string, currency?: string, timezone?: string }` | Cookie/Bearer | ORG_ADMIN, SUPER_ADMIN | Enforced by `user.organizationId` | Modifies caller's org only | Standard | Mutation Audit | `phase6-security-audit.test.ts` |
| `/api/audit` | GET | Query: `{ entityType?, entityId?, page?, limit? }` | Cookie/Bearer | AUDITOR, ORG_ADMIN, SUPER_ADMIN | Filtered by `organizationId` | Read-only historical ledger | Standard | None (Read) | `phase6-security-audit.test.ts` |

---

## 2. File Uploads, Media & Attachments

| Route | Methods | Expected Schema | Auth Required | Role / Permissions | Tenant Isolation | Resource Ownership | Rate Limiting | Audit Logging | Test Coverage |
|---|---|---|---|---|---|---|---|---|---|
| `/api/uploads` | POST | `FormData { file: File, entityType?: string, entityId?: string }` | Cookie/Bearer | Authenticated (Role check by entity) | Enforced on creation (`organizationId`) | Validates caller can access target entity | File upload quota | Upload Log | `uploads-security-and-chat-access.test.ts` |
| `/api/uploads/[id]` | GET | Path: `id` | Cookie/Bearer | Role-gated by file type (Finance/Chat/General) | Strict matching on `organizationId` | Verifies conversation participation & finance read | Standard | None (Read) | `uploads-security-and-chat-access.test.ts` |
| `/api/attachments` | GET, POST | POST: `{ fileName, fileUrl, entityType, entityId }` | Cookie/Bearer | Authenticated (Project/Finance permissions) | Scoped to `user.organizationId` | Validates target entity ownership | Standard | Attachment Audit | `priority3-and-7-attachments-folders.test.ts` |
| `/api/attachments/[id]` | GET, DELETE | Path: `id` | Cookie/Bearer | `SUPER_ADMIN`, `ORG_ADMIN`, `PROJECT_MANAGER` | Strict matching on `organizationId` | Soft archival, verifies owner or manager | Standard | Deletion Audit | `priority6-soft-delete-and-archival.test.ts` |

---

## 3. Projects, Sites & Document Hierarchies

| Route | Methods | Expected Schema | Auth Required | Role / Permissions | Tenant Isolation | Resource Ownership | Rate Limiting | Audit Logging | Test Coverage |
|---|---|---|---|---|---|---|---|---|---|
| `/api/sites` | GET, POST | POST: `{ name, location?, organizationId? }` | Cookie/Bearer | `projects:read`, `projects:write` | Filtered by `user.organizationId` | Organization-scoped sites | Standard | Site Audit | `phase7-authoritative-data.test.ts` |
| `/api/projects` | GET, POST | POST: `{ name, code, siteId, startDate?, budget? }` | Cookie/Bearer | `projects:read`, `projects:write` | Filtered by `user.organizationId` | Auto-provisions General Site Operations if empty | Standard | Project Audit | `priority1-permissions-and-projects.test.ts` |
| `/api/projects/[id]` | GET, PUT, DELETE | PUT: `{ name?, status?, budget? }` | Cookie/Bearer | `projects:read`, `projects:write` | Enforces `where: { id, organizationId }` | Only assigned PMs or Admins can edit | Standard | Project Mutation Audit | `phase7-authoritative-data.test.ts` |
| `/api/projects/[id]/assignments` | GET, POST, DELETE | POST: `{ userId, role }` | Cookie/Bearer | `ORG_ADMIN`, `SUPER_ADMIN` | Enforces `where: { id, organizationId }` | Scoped to organization's project | Standard | Assignment Audit | `priority1-permissions-and-projects.test.ts` |
| `/api/projects/[id]/folders` | GET, POST | POST: `{ name, parentId? }` | Cookie/Bearer | `projects:read`, `projects:write` | Enforces `project.organizationId` | Validates parent folder belongs to project | Standard | Folder Audit | `priority5-folder-permissions.test.ts` |
| `/api/projects/[id]/folders/[folderId]` | GET, PUT, DELETE | PUT: `{ name? }` | Cookie/Bearer | Folder permissions check | Enforces project & org isolation | Prevents non-empty folder hard delete | Standard | Folder Mutation Audit | `priority5-folder-permissions.test.ts` |
| `/api/projects/[id]/folders/[folderId]/permissions` | GET, POST | POST: `{ userId, canView, canUpload, canDelete }` | Cookie/Bearer | `ORG_ADMIN`, `SUPER_ADMIN`, Project PM | Enforces project & org isolation | Validates user belongs to organization | Standard | Permission Audit | `priority5-folder-permissions.test.ts` |

---

## 4. Workforce, Attendance & Measurement Book

| Route | Methods | Expected Schema | Auth Required | Role / Permissions | Tenant Isolation | Resource Ownership | Rate Limiting | Audit Logging | Test Coverage |
|---|---|---|---|---|---|---|---|---|---|
| `/api/workforce` | GET, POST | POST: `{ name, phone, trade, dailyWage, siteId }` | Cookie/Bearer | `workforce:read`, `workforce:write` | Filtered by `user.organizationId` | Site must belong to tenant | Standard | Worker Audit | `phase1-features.test.ts` |
| `/api/workforce/headcount` | GET, POST, PUT | POST/PUT: `{ date, siteId, tradeCounts, shift }` | Cookie/Bearer | `workforce:write` | Relational table scoped to `organizationId` | Site validated against tenant | Standard | Headcount Audit | `workforce-headcount-database.test.ts` |
| `/api/attendance` | GET | Query: `{ date?, siteId?, workerId? }` | Cookie/Bearer | `workforce:read` | Scoped by `user.organizationId` | Site & worker verified in tenant | Standard | None (Read) | `phase4-release-gate.test.ts` |
| `/api/attendance/check-in` | POST | `{ workerId?, userId?, siteId, latitude?, longitude?, photoUrl? }` | Cookie/Bearer | Authenticated worker or site supervisor | Scoped by `user.organizationId` | Prevents duplicate daily check-in | Standard | Check-in Audit | `phase4-release-gate.test.ts` |
| `/api/attendance/check-out` | POST | `{ attendanceId, latitude?, longitude? }` | Cookie/Bearer | Authenticated worker or site supervisor | Scoped by `user.organizationId` | Matches open check-in session | Standard | Check-out Audit | `phase1-features.test.ts` |
| `/api/attendance/history` | GET | Query: `{ startDate, endDate, workerId? }` | Cookie/Bearer | `workforce:read` | Scoped by `user.organizationId` | User/worker within tenant | Standard | None (Read) | `phase4-release-gate.test.ts` |
| `/api/attendance/[id]/correct` | POST | `{ status, notes, reason }` | Cookie/Bearer | `ORG_ADMIN`, `PROJECT_MANAGER` | Enforces `where: { id, organizationId }` | Attendance record ownership | Standard | Correction Audit | `phase4-release-gate.test.ts` |
| `/api/measurement-book` | GET, POST, PUT | POST: `{ projectId, contractorId, itemDescription, length, breadth, depth, unit, rate }` | Cookie/Bearer | `projects:read`, `projects:write` | Database table scoped to `organizationId` | Dimension formulas validated | Standard | MB Audit | `measurement-book-and-storage.test.ts` |
| `/api/day-book` | GET, POST | POST: `{ date, siteId, income, expense, narration, category }` | Cookie/Bearer | `finance:read`, `finance:write` | Filtered by `user.organizationId` | Site must belong to tenant | Standard | DayBook Audit | `phase4-release-gate.test.ts` |

---

## 5. Finance, Payments & Parties

| Route | Methods | Expected Schema | Auth Required | Role / Permissions | Tenant Isolation | Resource Ownership | Rate Limiting | Audit Logging | Test Coverage |
|---|---|---|---|---|---|---|---|---|---|
| `/api/parties` | GET, POST | POST: `{ name, type, contact?, panGst? }` | Cookie/Bearer | `finance:read`, `finance:write` | Filtered by `user.organizationId` | Organization party registry | Standard | Party Audit | `priority4-vendors-contractors.test.ts` |
| `/api/parties/[id]` | GET, PUT, DELETE | PUT: `{ name?, contact? }` | Cookie/Bearer | `finance:read`, `finance:write` | Enforces `where: { id, organizationId }` | Party must belong to tenant | Standard | Party Mutation Audit | `priority6-soft-delete-and-archival.test.ts` |
| `/api/parties/[id]/statement` | GET | Query: `{ fromDate?, toDate? }` | Cookie/Bearer | `finance:read` | Scoped by `user.organizationId` | Calculates ledger for party | Standard | None (Read) | `priority4-vendors-contractors.test.ts` |
| `/api/finance/bills` | GET, POST | POST: `{ partyId, billNumber, amount, dueDate, projectId? }` | Cookie/Bearer | `finance:read`, `finance:write` | Scoped by `user.organizationId` | Party & project verified in tenant | Standard | Bill Audit | `business-rules.test.ts` |
| `/api/finance/payments` | GET, POST | POST: `{ partyId, billId?, amount, paymentMode, paymentDate }` | Cookie/Bearer | `ACCOUNTANT`, `ORG_ADMIN`, `SUPER_ADMIN` | Scoped by `user.organizationId` | Requires Super Admin approval workflow | Idempotency | Payment Audit | `payment-approval-workflow.test.ts` |
| `/api/finance/payments/[id]/approve` | POST | `{ approvalNotes? }` | Cookie/Bearer | `SUPER_ADMIN` exclusively | Enforces `where: { id, organizationId }` | Super Admin cross-check | Idempotency | Approval Audit | `payment-approval-workflow.test.ts` |
| `/api/finance/payments/[id]/reject` | POST | `{ rejectionReason: string }` | Cookie/Bearer | `SUPER_ADMIN` exclusively | Enforces `where: { id, organizationId }` | Rejection sets query status | Standard | Rejection Audit | `payment-approval-workflow.test.ts` |
| `/api/finance/payments/[id]/reverse` | POST | `{ reason: string }` | Cookie/Bearer | `SUPER_ADMIN`, `ORG_ADMIN` | Enforces `where: { id, organizationId }` | Restores bill balance, prevents double reversal | Idempotency | Reversal Audit | `phase6-security-audit.test.ts` |

---

## 6. Inventory, Stores & Procurement

| Route | Methods | Expected Schema | Auth Required | Role / Permissions | Tenant Isolation | Resource Ownership | Rate Limiting | Audit Logging | Test Coverage |
|---|---|---|---|---|---|---|---|---|---|
| `/api/stores` | GET, POST | POST: `{ name, siteId, location? }` | Cookie/Bearer | `inventory:read`, `inventory:write` | Scoped by `user.organizationId` | Site verified in tenant | Standard | Store Audit | `phase1-features.test.ts` |
| `/api/materials` | GET, POST | POST: `{ name, code, unit, minStock?, category? }` | Cookie/Bearer | `inventory:read`, `inventory:write` | Scoped by `user.organizationId` | Code unique within tenant | Standard | Material Audit | `priority1-stock-and-alerts.test.ts` |
| `/api/materials/[id]` | GET, PUT, DELETE | PUT: `{ minStock?, unit? }` | Cookie/Bearer | `inventory:read`, `inventory:write` | Enforces `where: { id, organizationId }` | Material in tenant | Standard | Material Mutation Audit | `priority6-soft-delete-and-archival.test.ts` |
| `/api/materials/[id]/ledger` | GET | Query: `{ storeId?, startDate?, endDate? }` | Cookie/Bearer | `inventory:read` | Scoped by `user.organizationId` | Computes authoritative stock | Standard | None (Read) | `priority2-stock-reconciliation.test.ts` |
| `/api/inventory/receipts` | POST | `{ storeId, materialId, quantity, unitCost?, supplierId?, challanNumber?, photoUrl? }` | Cookie/Bearer | `STOREKEEPER`, `ORG_ADMIN`, `SUPER_ADMIN` | Scoped by `user.organizationId` | Atomic ledger entry creation | Idempotency | Receipt Audit | `priority4-material-attendance-attachments.test.ts` |
| `/api/inventory/issues` | POST | `{ storeId, materialId, quantity, issueTo?, remarks?, photoUrl? }` | Cookie/Bearer | `STOREKEEPER`, `ORG_ADMIN`, `SUPER_ADMIN` | Scoped by `user.organizationId` | Rejects negative stock | Idempotency | Issue Audit | `phase4-release-gate.test.ts` |
| `/api/inventory/transfers` | POST | `{ fromStoreId, toStoreId, materialId, quantity }` | Cookie/Bearer | `STOREKEEPER`, `ORG_ADMIN`, `SUPER_ADMIN` | Scoped by `user.organizationId` | Rejects identical from/to store | Idempotency | Transfer Audit | `phase4-release-gate.test.ts` |
| `/api/orders` | GET, POST | POST: `{ supplierId, storeId, items: [...] }` | Cookie/Bearer | `inventory:write`, `ORG_ADMIN` | Scoped by `user.organizationId` | Supplier & store validated | Idempotency | PO Audit | `place-order-and-notifications.test.ts` |
| `/api/orders/[id]` | GET, PUT | PUT: `{ status?, items? }` | Cookie/Bearer | `inventory:write`, `ORG_ADMIN` | Enforces `where: { id, organizationId }` | Order in tenant | Standard | PO Mutation Audit | `place-order-and-notifications.test.ts` |
| `/api/orders/[id]/approve` | POST | None | Cookie/Bearer | `SUPER_ADMIN`, `ORG_ADMIN` | Enforces `where: { id, organizationId }` | Super Admin PO approval | Idempotency | PO Approval Audit | `place-order-and-notifications.test.ts` |
| `/api/orders/[id]/reject` | POST | `{ reason: string }` | Cookie/Bearer | `SUPER_ADMIN`, `ORG_ADMIN` | Enforces `where: { id, organizationId }` | Rejection reason recorded | Standard | PO Rejection Audit | `place-order-and-notifications.test.ts` |

---

## 7. Tasks, Collaboration & Chat Messaging

| Route | Methods | Expected Schema | Auth Required | Role / Permissions | Tenant Isolation | Resource Ownership | Rate Limiting | Audit Logging | Test Coverage |
|---|---|---|---|---|---|---|---|---|---|
| `/api/tasks` | GET, POST | POST: `{ title, description?, projectId?, assigneeId?, dueDate?, reminderAt? }` | Cookie/Bearer | `tasks:read`, `tasks:write` (Accountant permitted) | Scoped by `user.organizationId` | Auto-maps 'OTHER' or empty project | Standard | Task Audit | `priority2-tasks-accountability.test.ts` |
| `/api/tasks/[id]` | GET, PUT, DELETE | PUT: `{ title?, dueDate?, priority? }` | Cookie/Bearer | `tasks:read`, `tasks:write` | Enforces `where: { id, organizationId }` | Soft-deletes task | Standard | Task Mutation Audit | `priority6-soft-delete-and-archival.test.ts` |
| `/api/tasks/[id]/status` | PATCH | `{ status: string }` | Cookie/Bearer | Authenticated Assignee or PM | Enforces `where: { id, organizationId }` | Records actor and timestamp | Standard | Status Audit | `priority2-tasks-accountability.test.ts` |
| `/api/tasks/[id]/comments` | GET, POST | POST: `{ comment: string, type?: 'DISCUSSION' \| 'NEED_HELP' }` | Cookie/Bearer | Authenticated project member | Enforces `where: { id, organizationId }` | Author linked to session | Standard | Comment Audit | `priority2-tasks-accountability.test.ts` |
| `/api/chat/conversations` | GET, POST | POST: `{ type: 'DIRECT' \| 'GROUP', participantIds: string[], name? }` | Cookie/Bearer | Authenticated user | Filtered by `user.organizationId` | All participants must belong to tenant | Standard | Conversation Audit | `chat-and-groups.test.ts` |
| `/api/chat/conversations/direct` | POST | `{ recipientId: string }` | Cookie/Bearer | Authenticated user | Filtered by `user.organizationId` | Recipient validated in tenant | Standard | Chat Audit | `chat-and-groups.test.ts` |
| `/api/chat/conversations/group` | POST | `{ name: string, memberIds: string[] }` | Cookie/Bearer | Authenticated user | Filtered by `user.organizationId` | Members validated in tenant | Standard | Chat Audit | `chat-and-groups.test.ts` |
| `/api/chat/conversations/[id]/messages`| GET, POST | POST: `{ text?: string, imageUrl?: string }` | Cookie/Bearer | Authenticated participant | Enforces `where: { id, organizationId }` | Caller must be conversation participant | Standard | Message Log | `chat-and-groups.test.ts` |
| `/api/chat/employees` | GET | Query: `{ search? }` | Cookie/Bearer | Authenticated user | Filtered by `user.organizationId` | Returns active tenant colleagues only | Standard | None (Read) | `chat-and-groups.test.ts` |
| `/api/chat/unread-count` | GET | None | Cookie/Bearer | Authenticated user | Scoped to `user.userId` | Counts caller's unread messages | Standard | None (Read) | `chat-and-groups.test.ts` |
| `/api/notifications` | GET, PATCH | PATCH: `{ notificationId?: string, markAllRead?: boolean }` | Cookie/Bearer | Authenticated user | Scoped to `user.userId` | Updates caller's notifications | Standard | None (Read) | `place-order-and-notifications.test.ts` |
| `/api/daily-reports` | GET, POST | POST: `{ date, siteId, progressSummary, weather?, workerCount? }` | Cookie/Bearer | `projects:read`, `projects:write` | Filtered by `user.organizationId` | Site verified in tenant | Standard | Report Audit | `phase4-release-gate.test.ts` |
| `/api/dashboard/kpi` | GET | None | Cookie/Bearer | Authenticated user (Role filtered) | Filtered by `user.organizationId` | Scoped to assigned projects for PM/Worker | Standard | None (Read) | `phase6-security-audit.test.ts` |
