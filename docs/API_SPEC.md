# API Specification

## 1. Global Conventions & Standards

- **Base URL**: `/api`
- **Format**: All requests and responses use `application/json; charset=utf-8`.
- **Authentication**: Session cookie `buildtrack_session` (HTTP-only, Secure, SameSite=Lax).
- **Tenant & Site Scoping**: Automatically resolved from authenticated user session; operations on specific sites/projects validate access rights.
- **Idempotency**: Critical mutation endpoints support the header `Idempotency-Key: <UUID>`. If repeated, the previously committed response is returned without re-executing.
- **Error Response Contract**:
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Store has only 4.5 BAG of Cement PPC; requested 10.0 BAG.",
    "details": { "available": 4.5, "requested": 10.0 }
  }
}
```

## 2. Authentication & Tenancy

### `POST /api/auth/login`
- **Description**: Authenticate with email and password.
- **Request**:
```json
{
  "email": "supervisor@buildtrack.pro",
  "password": "Password123!"
}
```
- **Response (200 OK)**: Sets session cookie.
```json
{
  "success": true,
  "user": {
    "id": "usr-1",
    "name": "Rajesh Kumar",
    "email": "supervisor@buildtrack.pro",
    "role": "SITE_SUPERVISOR",
    "organizationId": "org-1"
  }
}
```

### `POST /api/auth/logout`
- **Description**: Invalidate and clear session cookie.

### `GET /api/auth/me`
- **Description**: Return current authenticated user profile, permissions, and active scope.

## 3. Projects & Tasks

### `GET /api/projects`
- **Query Params**: `siteId`, `status`, `search`, `page`, `limit`
- **Permissions**: `projects:read`

### `POST /api/projects`
- **Permissions**: `projects:write`
- **Body**: `{ "siteId": "...", "code": "PRJ-01", "name": "Skyline Tower A", "budgetAmount": 2500000000 }`

### `GET /api/tasks`
- **Query Params**: `projectId`, `siteId`, `status`, `priority`, `assigneeId`
- **Permissions**: `tasks:read`

### `POST /api/tasks`
- **Permissions**: `tasks:write`
- **Body**: `{ "projectId": "...", "title": "Foundation Concrete Pour", "priority": "HIGH", "dueAt": "2026-10-20T18:00:00Z" }`

### `PATCH /api/tasks/:id/status`
- **Permissions**: `tasks:write`
- **Body**: `{ "status": "COMPLETED", "note": "Pour finished and curing started" }`

### `POST /api/projects/:id/daily-reports`
- **Permissions**: `projects:write`
- **Body**: `{ "reportDate": "2026-10-15", "progress": "Poured 45m3 concrete on slab 3", "blockers": "Rain delayed curing by 2 hours", "safetyNotes": "All workers wore harnesses" }`

## 4. Materials Master & Authoritative Stock Ledger

### `GET /api/materials`
- **Query Params**: `categoryId`, `search`, `lowStock` (boolean)
- **Permissions**: `materials:read`

### `POST /api/materials`
- **Permissions**: `materials:write`
- **Body**: `{ "sku": "CEM-PPC-50", "name": "UltraTech Cement PPC", "unitCode": "BAG", "minStockQty": 100 }`

### `GET /api/materials/:id/ledger`
- **Description**: Chronological stock movements for a specific material and store.
- **Permissions**: `inventory:read`
- **Response**:
```json
{
  "material": { "id": "m1", "name": "UltraTech Cement PPC", "unit": "BAG" },
  "currentStock": 140,
  "ledger": [
    {
      "id": "mov-1",
      "date": "2026-10-10T10:00:00Z",
      "type": "RECEIPT",
      "delta": 200,
      "balance": 200,
      "vendor": "Asian Paints / Building Depot",
      "rate": 38000,
      "reference": "DC-8901",
      "note": "Initial site shipment"
    },
    {
      "id": "mov-2",
      "date": "2026-10-12T14:30:00Z",
      "type": "ISSUE",
      "delta": -60,
      "balance": 140,
      "project": "Skyline Tower A",
      "task": "Foundation Concrete Pour",
      "note": "Issued for column casting"
    }
  ]
}
```

### `POST /api/inventory/receipts`
- **Description**: Atomic goods receipt into store with ledger update.
- **Permissions**: `inventory:receipt`
- **Header**: `Idempotency-Key`
- **Body**:
```json
{
  "storeId": "store-1",
  "vendorPartyId": "party-1",
  "referenceDoc": "CHALLAN-992",
  "items": [
    { "materialId": "mat-1", "quantity": 100, "unitRate": 38000 }
  ]
}
```

### `POST /api/inventory/issues`
- **Description**: Atomic material consumption issue linked to project and task.
- **Permissions**: `inventory:issue`
- **Body**:
```json
{
  "storeId": "store-1",
  "materialId": "mat-1",
  "quantity": 25,
  "projectId": "proj-1",
  "taskId": "task-1",
  "notes": "Issued to contractor team 2"
}
```

### `POST /api/inventory/transfers`
- **Description**: Atomic inter-store transfer (Store A -> Store B).
- **Permissions**: `inventory:transfer`
- **Body**:
```json
{
  "sourceStoreId": "store-1",
  "targetStoreId": "store-2",
  "materialId": "mat-1",
  "quantity": 15,
  "notes": "Transfer for tower B blockwork"
}
```

### `POST /api/inventory/adjustments`
- **Description**: Reconciled stock adjustment with mandatory supervisor reason.
- **Permissions**: `inventory:adjust`
- **Body**:
```json
{
  "storeId": "store-1",
  "materialId": "mat-1",
  "quantityDelta": -2,
  "reason": "Water damage during heavy rain"
}
```

## 5. Parties & Financial Transactions

### `GET /api/parties`
- **Query Params**: `type` ("VENDOR" | "CONTRACTOR" | "ALL")
- **Returns list with dynamically reconciled `totalBilled`, `totalPaid`, and `outstandingBalance`.**

### `GET /api/parties/:id/statement`
- **Description**: Unified ledger statement showing bills, payments, allocations, and running payable.

### `POST /api/finance/bills`
- **Permissions**: `finance:write`
- **Body**:
```json
{
  "partyId": "party-1",
  "billNumber": "INV-2026-001",
  "billDate": "2026-10-10",
  "dueDate": "2026-11-10",
  "lines": [
    { "description": "Cement 100 bags @ 380", "materialId": "mat-1", "quantity": 100, "unitRate": 38000, "lineTotal": 3800000 }
  ]
}
```

### `POST /api/finance/payments`
- **Permissions**: `finance:write`
- **Header**: `Idempotency-Key`
- **Body**:
```json
{
  "partyId": "party-1",
  "paymentDate": "2026-10-14",
  "amount": 2000000,
  "method": "BANK_TRANSFER",
  "referenceNumber": "NEFT-HDFC-99120",
  "allocations": [
    { "billId": "bill-1", "amount": 2000000 }
  ]
}
```

### `POST /api/finance/payments/:id/reverse`
- **Permissions**: `finance:reverse`
- **Body**: `{ "reason": "Incorrect bank account debited; check bounced" }`

## 6. Workforce & Attendance

### `GET /api/workforce`
- **Query Params**: `siteId`, `workerType`, `active`

### `POST /api/attendance/check-in`
- **Permissions**: `attendance:write`
- **Body**:
```json
{
  "workforceMemberId": "wm-1",
  "siteId": "site-1",
  "latitude": 19.0760,
  "longitude": 72.8777,
  "accuracyM": 12.5
}
```

### `POST /api/attendance/check-out`
- **Permissions**: `attendance:write`
- **Body**:
```json
{
  "attendanceSessionId": "att-1",
  "latitude": 19.0761,
  "longitude": 72.8775,
  "accuracyM": 10.0
}
```

### `POST /api/attendance/:id/correct`
- **Permissions**: `attendance:correct`
- **Body**:
```json
{
  "status": "PRESENT",
  "checkInAt": "2026-10-14T08:30:00Z",
  "checkOutAt": "2026-10-14T17:30:00Z",
  "reason": "Supervisor phone battery died before checkout"
}
```

## 7. Reports & Dashboard KPIs

### `GET /api/dashboard/kpi`
- Returns verified database-backed metrics:
  - `activeProjectsCount`
  - `tasksDueTodayCount`
  - `tasksOverdueCount`
  - `workersPresentTodayCount`
  - `lowStockItemsCount`
  - `paymentsMadeTodayAmount` (paise)
  - `totalOutstandingPayablesAmount` (paise)
