# API Audit & Endpoint Security Specification

**BuildTrack Pro / BothraCMS Enterprise Construction Platform**  
*Phase 2 Security & Architecture Audit*  
*Date: 2026-10-20*  
*Total Discovered API Routes: 60*

---

## 1. Authentication & System Administration Endpoints

| HTTP Method & Route | Auth Required | Required Permission | Tenant Scope | Validation Rules | Database Operations | Test Coverage | Status |
|:---|:---|:---|:---|:---|:---|:---|:---:|
| `POST /api/auth/login` | None (Public) | None | N/A (Tenant derived via email) | `loginSchema`: valid email string, password >= 6 chars | `User.findUnique({ email })` | `phase4-release-gate.test.ts`, `phase6-security-audit.test.ts` | COMPLETE |
| `POST /api/auth/logout` | Optional | None | Session cookie cleared | None | None | `phase4-release-gate.test.ts` | COMPLETE |
| `GET /api/auth/me` | Yes | Authenticated Session | Scoped to `user.organizationId` | None | `User.findUnique`, `Organization.findUnique` | `phase4-release-gate.test.ts` | COMPLETE |
| `POST /api/admin/seed` | Yes (Dev/Test) | `SUPER_ADMIN` | Global | Seed initialization body | Creates `Organization`, `User`, default `Site`, `Store` | `admin-seed.test.ts` | COMPLETE |
| `GET /api/admin/tenants` | Yes | `SUPER_ADMIN` | Global (All Tenants) | None | `Organization.findMany`, `_count` | `phase4-release-gate.test.ts` | COMPLETE |
| `PATCH /api/admin/tenants` | Yes | `SUPER_ADMIN` | Target `organizationId` | `tenantStatusSchema`: valid status string | `Organization.update` | `phase4-release-gate.test.ts` | COMPLETE |
| `GET /api/health` | None (Public) | None | Unscoped | None | `prisma.$queryRaw\`SELECT 1\`` | `health-route.test.ts`, `phase4-release-gate.test.ts` | COMPLETE |

---

## 2. Organization, Sites & Projects

| HTTP Method & Route | Auth Required | Required Permission | Tenant Scope | Validation Rules | Database Operations | Test Coverage | Status |
|:---|:---|:---|:---|:---|:---|:---|:---:|
| `GET /api/organization` | Yes | `org:settings` / Org Member | `user.organizationId` | None | `Organization.findUnique` | `phase4-release-gate.test.ts` | COMPLETE |
| `PATCH /api/organization` | Yes | `org:settings` | `user.organizationId` | Org update schema | `Organization.update` | `phase4-release-gate.test.ts` | COMPLETE |
| `GET /api/sites` | Yes | Authenticated Session | `user.organizationId` | Query filters (`active`) | `Site.findMany` | `phase4-release-gate.test.ts`, `phase7-authoritative-data.test.ts` | COMPLETE |
| `POST /api/sites` | Yes | `sites:manage` | `user.organizationId` | `siteSchema`: name, code, address, optional yard store | `Site.create`, `Store.create` (Yard) | `phase4-release-gate.test.ts` | COMPLETE |
| `GET /api/projects` | Yes | `projects:read` | `user.organizationId` + Assigned Projects | Query filters (`siteId`, `status`) | `Project.findMany`, `ProjectAssignment` | `priority1-permissions-and-projects.test.ts` | COMPLETE |
| `POST /api/projects` | Yes | `projects:write` | `user.organizationId` | `projectSchema`: name, code, siteId, budgetAmount | `Project.create` | `phase4-release-gate.test.ts` | COMPLETE |
| `GET /api/projects/[id]` | Yes | `projects:read` | `user.organizationId` + Assigned Project | Project ID param | `Project.findFirstOrThrow` | `phase4-release-gate.test.ts`, `priority1-permissions-and-projects.test.ts` | COMPLETE |
| `PATCH /api/projects/[id]` | Yes | `projects:write` | `user.organizationId` | Update fields | `Project.update` | `phase4-release-gate.test.ts` | COMPLETE |
| `DELETE /api/projects/[id]` | Yes | `projects:write` | `user.organizationId` | Project ID param | `Project.update({ isArchived: true })` (Soft-delete) | `phase7-authoritative-data.test.ts`, `priority6-soft-delete-and-archival.test.ts` | COMPLETE |
| `GET /api/projects/[id]/assignments` | Yes | `projects:read` | `user.organizationId` | Project ID param | `ProjectAssignment.findMany` | `priority1-permissions-and-projects.test.ts` | COMPLETE |
| `POST /api/projects/[id]/assignments` | Yes | `projects:write` | `user.organizationId` | `assignmentSchema`: userId, role | `ProjectAssignment.upsert` | `priority1-permissions-and-projects.test.ts` | COMPLETE |
| `DELETE /api/projects/[id]/assignments` | Yes | `projects:write` | `user.organizationId` | Query params: `userId` | `ProjectAssignment.deleteMany` | `priority1-permissions-and-projects.test.ts` | COMPLETE |

---

## 3. Tasks & Operational Workflows

| HTTP Method & Route | Auth Required | Required Permission | Tenant Scope | Validation Rules | Database Operations | Test Coverage | Status |
|:---|:---|:---|:---|:---|:---|:---|:---:|
| `GET /api/tasks` | Yes | `tasks:read` | `user.organizationId` + Assigned Projects | Query filters (`projectId`, `status`, `assignedTo`) | `Task.findMany` | `phase4-release-gate.test.ts` | COMPLETE |
| `POST /api/tasks` | Yes | `tasks:write` | `user.organizationId` | `createTaskSchema`: title, projectId, priority, dueDate | `Task.create`, `TaskStatusHistory.create` | `priority2-tasks-accountability.test.ts` | COMPLETE |
| `GET /api/tasks/[id]` | Yes | `tasks:read` | `user.organizationId` | Task ID param | `Task.findFirst`, `TaskStatusHistory`, `TaskComment` | `priority2-tasks-accountability.test.ts` | COMPLETE |
| `PATCH /api/tasks/[id]` | Yes | `tasks:write` | `user.organizationId` | Task update schema | `Task.update`, `TaskStatusHistory.create` | `priority2-tasks-accountability.test.ts` | COMPLETE |
| `DELETE /api/tasks/[id]` | Yes | `tasks:write` | `user.organizationId` | Task ID param | `Task.update({ isArchived: true })` | `priority6-soft-delete-and-archival.test.ts` | COMPLETE |
| `POST /api/tasks/[id]/status` | Yes | `tasks:write` | `user.organizationId` | `statusUpdateSchema`: status, note | `Task.update`, `TaskStatusHistory.create` | `priority2-tasks-accountability.test.ts` | COMPLETE |
| `GET /api/tasks/[id]/comments` | Yes | `tasks:read` | `user.organizationId` | Task ID param | `TaskComment.findMany` | `priority2-tasks-accountability.test.ts` | COMPLETE |
| `POST /api/tasks/[id]/comments` | Yes | `tasks:write` | `user.organizationId` | `commentSchema`: message, optional attachments | `TaskComment.create` | `priority2-tasks-accountability.test.ts` | COMPLETE |
| `GET /api/daily-reports` | Yes | `tasks:read` | `user.organizationId` | Query filters (`siteId`, `date`) | `DailySiteReport.findMany` | `phase4-release-gate.test.ts` | COMPLETE |
| `POST /api/daily-reports` | Yes | `tasks:write` | `user.organizationId` | `reportSchema`: siteId, date, weather, progress, workforce | `DailySiteReport.create` | `phase4-release-gate.test.ts` | COMPLETE |
| `GET /api/day-book` | Yes | `finance:read` | `user.organizationId` | Query filters (`siteId`, `date`, `category`) | `Bill.findMany`, `Payment.findMany`, `WorkforceHeadcount.findMany` | Dynamic UI Daybook verification | COMPLETE |

---

## 4. Materials, Stores & Inventory

| HTTP Method & Route | Auth Required | Required Permission | Tenant Scope | Validation Rules | Database Operations | Test Coverage | Status |
|:---|:---|:---|:---|:---|:---|:---|:---:|
| `GET /api/materials` | Yes | `inventory:read` | `user.organizationId` | Query filters (`search`, `category`) | `Material.findMany`, `StockBalance` | `priority1-stock-and-alerts.test.ts` | COMPLETE |
| `POST /api/materials` | Yes | `inventory:adjust` / storekeeper | `user.organizationId` | `materialSchema`: name, code, unit, minStock | `Material.create` | `phase6-security-audit.test.ts` | COMPLETE |
| `GET /api/materials/[id]` | Yes | `inventory:read` | `user.organizationId` | Material ID param | `Material.findFirstOrThrow` | `priority1-stock-and-alerts.test.ts` | COMPLETE |
| `PATCH /api/materials/[id]` | Yes | `inventory:adjust` | `user.organizationId` | Material update schema | `Material.update` | `priority1-stock-and-alerts.test.ts` | COMPLETE |
| `DELETE /api/materials/[id]` | Yes | `inventory:adjust` | `user.organizationId` | Material ID param | `Material.update({ isArchived: true })` | `priority6-soft-delete-and-archival.test.ts` | COMPLETE |
| `GET /api/materials/[id]/ledger` | Yes | `inventory:read` | `user.organizationId` | Material ID param, date range | `StockMovement.findMany` | `priority2-stock-reconciliation.test.ts` | COMPLETE |
| `GET /api/stores` | Yes | `inventory:read` | `user.organizationId` | Query filters (`siteId`) | `Store.findMany` | `phase4-release-gate.test.ts` | COMPLETE |
| `POST /api/inventory/receipts` | Yes | `inventory:receipt` | `user.organizationId` | `receiptSchema`: storeId, materialId, quantity, partyId, challanNo | `StockMovement.create`, `StockBalance.upsert` | `priority4-material-attendance-attachments.test.ts` | COMPLETE |
| `POST /api/inventory/issues` | Yes | `inventory:issue` | `user.organizationId` | `issueSchema`: storeId, materialId, quantity, projectId, taskId | `StockMovement.create`, `StockBalance.upsert` | `priority4-material-attendance-attachments.test.ts` | COMPLETE |
| `POST /api/inventory/transfers` | Yes | `inventory:transfer` | `user.organizationId` | `transferSchema`: fromStoreId, toStoreId, materialId, quantity | `StockMovement.create` (OUT/IN pair) | `priority1-stock-and-alerts.test.ts` | COMPLETE |

---

## 5. Measurement Book, Finance & Bills

| HTTP Method & Route | Auth Required | Required Permission | Tenant Scope | Validation Rules | Database Operations | Test Coverage | Status |
|:---|:---|:---|:---|:---|:---|:---|:---:|
| `GET /api/measurement-book` | Yes | `projects:read` / `finance:read` | `user.organizationId` | Query filters (`projectId`, `partyId`, `status`) | `MeasurementBookEntry.findMany` | `measurement-book-and-storage.test.ts` | COMPLETE |
| `POST /api/measurement-book` | Yes | `projects:write` | `user.organizationId` | `entrySchema`: projectId, partyId, count, length, breadth, depth, agreedRate | `MeasurementBookEntry.create` | `measurement-book-and-storage.test.ts` | COMPLETE |
| `PATCH /api/measurement-book` | Yes | `projects:write` / `finance:write` | `user.organizationId` | Status transition: `SUBMITTED`, `VERIFIED`, `APPROVED`, `REJECTED`, `BILLED` | `MeasurementBookEntry.update`, `Bill.create` | `measurement-book-and-storage.test.ts` | COMPLETE |
| `GET /api/finance/bills` | Yes | `finance:read` | `user.organizationId` | Query filters (`partyId`, `status`, `projectId`) | `Bill.findMany`, `BillLine` | `business-rules.test.ts` | COMPLETE |
| `POST /api/finance/bills` | Yes | `finance:write` | `user.organizationId` | `billSchema`: partyId, projectId, billNumber, lines array, totalAmountPaise | `Bill.create`, `BillLine.createMany` | `business-rules.test.ts`, `phase6-security-audit.test.ts` | COMPLETE |
| `GET /api/finance/payments` | Yes | `finance:read` | `user.organizationId` | Query filters (`partyId`, `status`) | `Payment.findMany`, `PaymentAllocation` | `business-rules.test.ts` | COMPLETE |
| `POST /api/finance/payments` | Yes | `finance:write` | `user.organizationId` | `paymentSchema`: partyId, amountPaise, paymentMode, allocations array | `Payment.create`, `PaymentAllocation.createMany`, `Bill.update` | `business-rules.test.ts` | COMPLETE |
| `POST /api/finance/payments/[id]/approve` | Yes | `finance:write` | `user.organizationId` | Payment ID param | `Payment.update({ status: 'APPROVED' })` | `payment-approval-workflow.test.ts` | COMPLETE |
| `POST /api/finance/payments/[id]/reject` | Yes | `finance:write` | `user.organizationId` | Payment ID param, reason | `Payment.update({ status: 'REJECTED' })` | `payment-approval-workflow.test.ts` | COMPLETE |
| `POST /api/finance/payments/[id]/reverse` | Yes | `finance:reverse` | `user.organizationId` | `reversalSchema`: reason string | `Payment.update({ status: 'REVERSED' })`, `Bill.update`, `AuditEvent.create` | `business-rules.test.ts` | COMPLETE |
| `GET /api/parties` | Yes | `finance:read` / Org Member | `user.organizationId` | Query filters (`type`: VENDOR, CONTRACTOR) | `Party.findMany` | `priority4-vendors-contractors.test.ts` | COMPLETE |
| `POST /api/parties` | Yes | `finance:write` | `user.organizationId` | `partySchema`: name, type, gstin, phone, address | `Party.create` | `priority4-vendors-contractors.test.ts` | COMPLETE |
| `GET /api/parties/[id]` | Yes | `finance:read` | `user.organizationId` | Party ID param | `Party.findFirstOrThrow` | `priority4-vendors-contractors.test.ts` | COMPLETE |
| `PATCH /api/parties/[id]` | Yes | `finance:write` | `user.organizationId` | Party update schema | `Party.update` | `priority4-vendors-contractors.test.ts` | COMPLETE |
| `DELETE /api/parties/[id]` | Yes | `finance:write` | `user.organizationId` | Party ID param | `Party.update({ active: false })` | `priority6-soft-delete-and-archival.test.ts` | COMPLETE |
| `GET /api/parties/[id]/statement` | Yes | `finance:read` | `user.organizationId` | Party ID param, date range | `Bill.findMany`, `Payment.findMany` (Ledger balance) | `priority4-vendors-contractors.test.ts` | COMPLETE |

---

## 6. Purchase Orders, Workforce, Attendance & Uploads

| HTTP Method & Route | Auth Required | Required Permission | Tenant Scope | Validation Rules | Database Operations | Test Coverage | Status |
|:---|:---|:---|:---|:---|:---|:---|:---:|
| `GET /api/orders` | Yes | `inventory:read` / `finance:read` | `user.organizationId` | Query filters (`status`, `partyId`) | `PurchaseOrder.findMany` | `place-order-and-notifications.test.ts` | COMPLETE |
| `POST /api/orders` | Yes | `inventory:receipt` / storekeeper | `user.organizationId` | `orderSchema`: partyId, siteId, lines array, totalAmountPaise | `PurchaseOrder.create`, `Notification.create` | `place-order-and-notifications.test.ts` | COMPLETE |
| `GET /api/orders/[id]` | Yes | `inventory:read` | `user.organizationId` | Order ID param | `PurchaseOrder.findFirstOrThrow` | `place-order-and-notifications.test.ts` | COMPLETE |
| `POST /api/orders/[id]/approve` | Yes | `finance:write` / `org:settings` | `user.organizationId` | Order ID param | `PurchaseOrder.update({ status: 'APPROVED' })` | `place-order-and-notifications.test.ts` | COMPLETE |
| `POST /api/orders/[id]/reject` | Yes | `finance:write` | `user.organizationId` | Order ID param, reason | `PurchaseOrder.update({ status: 'REJECTED' })` | `place-order-and-notifications.test.ts` | COMPLETE |
| `GET /api/workforce` | Yes | `attendance:read` | `user.organizationId` | Query filters (`siteId`, `trade`) | `WorkforceMember.findMany` | `phase4-release-gate.test.ts` | COMPLETE |
| `POST /api/workforce` | Yes | `attendance:write` | `user.organizationId` | `workerSchema`: name, trade, wageRatePaise, phone | `WorkforceMember.create` | `phase4-release-gate.test.ts` | COMPLETE |
| `GET /api/workforce/headcount` | Yes | `attendance:read` | `user.organizationId` | Query filters (`siteId`, `date`) | `WorkforceHeadcount.findMany` | `workforce-headcount-database.test.ts` | COMPLETE |
| `POST /api/workforce/headcount` | Yes | `attendance:write` | `user.organizationId` | `headcountSchema`: siteId, date, shift, artisanCount, craftsmanCount, laborerMale, laborerFemale | `WorkforceHeadcount.upsert` | `workforce-headcount-database.test.ts` | COMPLETE |
| `POST /api/attendance/check-in` | Yes | `attendance:write` | `user.organizationId` | `checkInSchema`: workforceMemberId, siteId, lat, lng, photoUrl | `AttendanceSession.create` | `business-rules.test.ts`, `phase4-release-gate.test.ts` | COMPLETE |
| `POST /api/attendance/check-out` | Yes | `attendance:write` | `user.organizationId` | `checkOutSchema`: attendanceSessionId, lat, lng | `AttendanceSession.update` | `business-rules.test.ts`, `phase4-release-gate.test.ts` | COMPLETE |
| `GET /api/attendance/history` | Yes | `attendance:read` | `user.organizationId` | Query filters (`siteId`, `workerId`, `dateRange`) | `AttendanceSession.findMany` | `phase4-release-gate.test.ts` | COMPLETE |
| `POST /api/attendance/[id]/correct` | Yes | `attendance:correct` | `user.organizationId` | `correctionSchema`: newStatus, checkInTime, checkOutTime, reason | `AttendanceSession.update`, `AuditEvent.create` | `phase4-release-gate.test.ts` | COMPLETE |
| `GET /api/uploads/[id]` | Yes | Scoped to Org / Super Admin | `user.organizationId` (Strict IDOR check) | Attachment ID param | `Attachment.findFirst`, `ChatMessage.findFirst`, `StorageProvider.get` | `phase6-security-audit.test.ts`, `priority4-material-attendance-attachments.test.ts` | COMPLETE |
| `POST /api/uploads` | Yes | Authenticated Session | `user.organizationId` | Multipart FormData: file <= 25MB, MIME verification | `Attachment.create`, `StorageProvider.put` | `phase4-release-gate.test.ts` | COMPLETE |
| `GET /api/attachments` | Yes | Authenticated Session | `user.organizationId` | Query filters (`projectId`, `folderId`) | `Attachment.findMany` | `priority3-and-7-attachments-folders.test.ts` | COMPLETE |
| `DELETE /api/attachments/[id]` | Yes | Org Admin / File Owner | `user.organizationId` | Attachment ID param | `Attachment.update({ isArchived: true })` | `priority6-soft-delete-and-archival.test.ts` | COMPLETE |
| `GET /api/projects/[id]/folders` | Yes | `projects:read` | `user.organizationId` | Project ID param, optional `parentId` | `DocumentFolder.findMany` | `priority5-folder-permissions.test.ts` | COMPLETE |
| `POST /api/projects/[id]/folders` | Yes | `projects:write` | `user.organizationId` | `folderSchema`: name, parentId | `DocumentFolder.create` | `priority5-folder-permissions.test.ts` | COMPLETE |
| `DELETE /api/projects/[id]/folders/[folderId]`| Yes | `projects:write` | `user.organizationId` | Folder ID param | `DocumentFolder.update({ isArchived: true })` | `priority5-folder-permissions.test.ts` | COMPLETE |
| `POST /api/projects/[id]/folders/[folderId]/permissions` | Yes | `org:settings` / Org Admin | `user.organizationId` | `permissionSchema`: userId, canView, canUpload, canDelete | `FolderPermission.upsert` | `priority5-folder-permissions.test.ts` | COMPLETE |
| `GET /api/chat/conversations` | Yes | Authenticated Session | `user.organizationId` + User Participant | None | `Conversation.findMany`, `ConversationParticipant` | `chat-and-groups.test.ts` | COMPLETE |
| `POST /api/chat/conversations/direct` | Yes | Authenticated Session | `user.organizationId` | `directChatSchema`: recipientUserId | `Conversation.upsert` | `chat-and-groups.test.ts` | COMPLETE |
| `POST /api/chat/conversations/group` | Yes | `SUPER_ADMIN` / `ORG_ADMIN` | `user.organizationId` | `groupChatSchema`: name, memberUserIds array | `Conversation.create`, `ConversationParticipant.createMany` | `chat-and-groups.test.ts` | COMPLETE |
| `GET /api/chat/conversations/[id]/messages` | Yes | Conversation Participant | `user.organizationId` | Conversation ID param, pagination | `ChatMessage.findMany` | `chat-and-groups.test.ts` | COMPLETE |
| `POST /api/chat/conversations/[id]/messages`| Yes | Conversation Participant | `user.organizationId` | `messageSchema`: text, optional imageUrl | `ChatMessage.create`, `Notification.create` | `chat-and-groups.test.ts` | COMPLETE |
| `GET /api/chat/employees` | Yes | Authenticated Session | `user.organizationId` | Query filters (`search`) | `User.findMany({ where: { status: 'ACTIVE' } })` | `chat-and-groups.test.ts` | COMPLETE |
| `GET /api/chat/unread-count` | Yes | Authenticated Session | `user.organizationId` | None | `ChatMessage.count` | `chat-and-groups.test.ts` | COMPLETE |
| `GET /api/notifications` | Yes | Authenticated Session | `user.organizationId` + User recipient | Query filters (`isRead`) | `Notification.findMany` | `place-order-and-notifications.test.ts` | COMPLETE |
| `GET /api/audit` | Yes | `audit:read` / Auditor / Org Admin | `user.organizationId` | Query filters (`entityType`, `actorUserId`, dateRange) | `AuditEvent.findMany` | `phase6-security-audit.test.ts` | COMPLETE |
| `GET /api/dashboard/kpi` | Yes | Authenticated Session | `user.organizationId` | Query filters (`siteId`) | Aggregated database metrics from `Project`, `Task`, `StockBalance`, `Bill`, `AttendanceSession` | `phase7-authoritative-data.test.ts`, `business-rules.test.ts` | COMPLETE |
