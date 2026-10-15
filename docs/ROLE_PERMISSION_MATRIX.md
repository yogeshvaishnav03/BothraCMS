# Role & Permission Matrix

## 1. Defined Roles
- **SUPER_ADMIN**: Global system administrator with full access across organizations.
- **ORG_ADMIN**: Organization administrator with full control over organization sites, users, settings, and records.
- **PROJECT_MANAGER**: Manages projects, tasks, budgets, milestones, and reviews daily reports.
- **SITE_SUPERVISOR**: Manages on-site tasks, worker check-ins, site material consumption, and daily logs.
- **ACCOUNTANT**: Enters bills, issues payments, reviews vendor statements, and manages financial reconciliations.
- **STOREKEEPER**: Controls site warehouse/store, logs goods receipts, material issues, and inventory transfers.
- **HR_VIEWER**: Manages workforce profiles, views daily attendance, and manages attendance logs.
- **AUDITOR**: Read-only auditor across all modules and audit trail logs.

## 2. Permission Key Mapping

| Permission Key | Description |
|---|---|
| `org:settings` | Manage organization profile, currency, and timezone |
| `users:manage` | Invite users, assign roles, change status |
| `sites:manage` | Create, edit, and archive site locations |
| `projects:read` | View project list and project details |
| `projects:write` | Create and modify projects, budgets, and milestones |
| `tasks:read` | View tasks and task status history |
| `tasks:write` | Create, assign, and update task progress and status |
| `inventory:read` | View material catalog, store levels, and ledger history |
| `inventory:receipt` | Receive goods from vendors into stores |
| `inventory:issue` | Issue stock to projects and tasks |
| `inventory:transfer`| Transfer stock between site stores |
| `inventory:adjust` | Perform verified stock adjustments |
| `finance:read` | View bills, payments, and vendor statements |
| `finance:write` | Create bills, record payments, and allocate to bills |
| `finance:reverse` | Reverse posted payments with audit reasoning |
| `attendance:read` | View workforce profiles and daily attendance logs |
| `attendance:write`| Perform check-in and check-out events |
| `attendance:correct`| Submit or approve attendance corrections |
| `reports:read` | View and export aggregated business reports |
| `audit:read` | Inspect chronological system audit logs |

## 3. Role vs. Permission Matrix

| Permission | SUPER_ADMIN | ORG_ADMIN | PROJECT_MANAGER | SITE_SUPERVISOR | ACCOUNTANT | STOREKEEPER | HR_VIEWER | AUDITOR |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `org:settings` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `users:manage` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `sites:manage` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `projects:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `projects:write` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `tasks:read` | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| `tasks:write` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `inventory:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `inventory:receipt` | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| `inventory:issue` | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| `inventory:transfer` | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `inventory:adjust` | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `finance:read` | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| `finance:write` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `finance:reverse` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `attendance:read` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| `attendance:write` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| `attendance:correct` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `reports:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `audit:read` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

## 4. Data Scoping & Multi-Tenancy Rules
- **Organization Scope**: All database queries MUST include `organizationId: session.organizationId`.
- **Site Scope**:
  - `ORG_ADMIN`, `ACCOUNTANT`, and `AUDITOR` have access to all sites within their organization.
  - `SITE_SUPERVISOR` and `STOREKEEPER` are restricted to their assigned site(s) unless granted multi-site supervisor privileges.
  - Cross-site mutations (e.g. attempting to issue materials from Site B while authenticated as Site A supervisor) are rejected with `403 Forbidden`.
