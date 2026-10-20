# Authorization Matrix & Access Control Policy

**BuildTrack Pro / BothraCMS Enterprise Construction Management Platform**  
*Document Version: 2.0 (Phase 2 Full Security Audit)*  
*Compliance: Role-Based Access Control (RBAC), Multi-Tenant Data Isolation, IDOR Defense*

---

## 1. System Roles & Architecture

The application defines 8 distinct system roles, operating under a strict hierarchical multi-tenant tenant isolation model:

1. **SUPER_ADMIN**: Global system administrator with cross-organization oversight, tenant management, system maintenance, and unrestricted access to all tenant records.
2. **ORG_ADMIN**: Primary enterprise tenant administrator. Full authority over organizational configuration, sites, projects, users, financial workflows, and compliance within their organization.
3. **PROJECT_MANAGER**: Operational manager assigned to specific projects. Oversees project budgets, milestones, task assignments, daily site reports, and measurement records.
4. **SITE_SUPERVISOR**: Front-line field supervisor executing operations at assigned construction sites. Logs daily workforce attendance, material consumption, field tasks, and measurement drafts.
5. **ACCOUNTANT**: Financial compliance officer. Issues purchase bills, executes vendor payments, reconciles ledger transactions, and reviews financial summaries.
6. **STOREKEEPER**: Material custodian. Manages site warehouses, issues gate passes, inspects goods receipts against POs, and records stock movements.
7. **HR_VIEWER**: Personnel manager. Enrolls workforce members, audits GPS attendance logs, and requests supervisor attendance adjustments.
8. **AUDITOR**: Read-only compliance reviewer. Inspects immutable system audit logs, financial transactions, and verification records across the tenant.

---

## 2. Resource Operation Decision Matrix

| Resource | Operation | SUPER_ADMIN | ORG_ADMIN | PROJECT_MANAGER | SITE_SUPERVISOR | ACCOUNTANT | STOREKEEPER | HR_VIEWER | AUDITOR |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Tenants / Organizations** | View All Tenants | ALLOW | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) |
| | Suspend / Unsuspend Tenant | ALLOW | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) |
| | Modify Org Profile / Settings | ALLOW | ALLOW | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) |
| **User Management** | List / Search Org Users | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| | Invite User / Assign Role | ALLOW | ALLOW | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) |
| | Deactivate / Suspend User | ALLOW | ALLOW | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) |
| **Sites** | Create / Update Site | ALLOW | ALLOW | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) |
| | Archive Site | ALLOW | ALLOW | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) |
| | View Site Details | ALLOW | ALLOW | ALLOW | ALLOW (Assigned) | ALLOW | ALLOW (Assigned) | ALLOW | ALLOW |
| **Projects** | Create Project | ALLOW | ALLOW | ALLOW | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) |
| | Update Project & Budget | ALLOW | ALLOW | ALLOW (Assigned) | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) |
| | View Project Analytics | ALLOW | ALLOW | ALLOW (Assigned) | ALLOW (Assigned) | ALLOW | ALLOW (Assigned) | DENY (403) | ALLOW |
| | Soft-Archive Project | ALLOW | ALLOW | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) |
| **Tasks** | Create / Assign Task | ALLOW | ALLOW | ALLOW | ALLOW | DENY (403) | DENY (403) | DENY (403) | DENY (403) |
| | Update Progress / Status | ALLOW | ALLOW | ALLOW | ALLOW | DENY (403) | DENY (403) | DENY (403) | DENY (403) |
| | Verify Task Completion | ALLOW | ALLOW | ALLOW | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) |
| | Archive Task | ALLOW | ALLOW | ALLOW | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) |
| **Inventory & Materials** | View Catalog & Stock | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | DENY (403) | ALLOW |
| | Create Material SKU | ALLOW | ALLOW | ALLOW | DENY (403) | DENY (403) | ALLOW | DENY (403) | DENY (403) |
| | Receive Goods (GRN) | ALLOW | ALLOW | DENY (403) | ALLOW (Site) | DENY (403) | ALLOW | DENY (403) | DENY (403) |
| | Issue Stock to Task | ALLOW | ALLOW | DENY (403) | ALLOW (Site) | DENY (403) | ALLOW | DENY (403) | DENY (403) |
| | Adjust Ledger Stock | ALLOW | ALLOW | DENY (403) | DENY (403) | DENY (403) | ALLOW | DENY (403) | DENY (403) |
| **Measurement Book (MB)**| Draft Entry | ALLOW | ALLOW | ALLOW | ALLOW | DENY (403) | DENY (403) | DENY (403) | DENY (403) |
| | Verify MB Entry | ALLOW | ALLOW | ALLOW | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) |
| | Approve MB Entry | ALLOW | ALLOW | ALLOW | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) |
| | Convert MB to Bill | ALLOW | ALLOW | DENY (403) | DENY (403) | ALLOW | DENY (403) | DENY (403) | DENY (403) |
| **Finance & Bills** | Create Contractor / Vendor Bill| ALLOW | ALLOW | DENY (403) | DENY (403) | ALLOW | DENY (403) | DENY (403) | DENY (403) |
| | Record Payment | ALLOW | ALLOW | DENY (403) | DENY (403) | ALLOW | DENY (403) | DENY (403) | DENY (403) |
| | Reverse Posted Payment | ALLOW | ALLOW | DENY (403) | DENY (403) | ALLOW | DENY (403) | DENY (403) | DENY (403) |
| | View Ledger & Aging | ALLOW | ALLOW | ALLOW (Assigned) | DENY (403) | ALLOW | DENY (403) | DENY (403) | ALLOW |
| **Workforce & Attendance** | Enroll Worker Profile | ALLOW | ALLOW | DENY (403) | ALLOW (Site) | DENY (403) | DENY (403) | ALLOW | DENY (403) |
| | Record GPS Check-in / out | ALLOW | ALLOW | DENY (403) | ALLOW | DENY (403) | DENY (403) | ALLOW | DENY (403) |
| | Correct Attendance Record | ALLOW | ALLOW | ALLOW | DENY (403) | DENY (403) | DENY (403) | ALLOW | DENY (403) |
| | Save Workforce Headcount | ALLOW | ALLOW | ALLOW | ALLOW | DENY (403) | DENY (403) | ALLOW | DENY (403) |
| **Documents & Folders** | Create Root / Nested Folder | ALLOW | ALLOW | ALLOW | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) |
| | Grant Folder Permission | ALLOW | ALLOW | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) |
| | Upload / Download Document | ALLOW | ALLOW | ALLOW (Scoped) | ALLOW (Scoped) | ALLOW (Scoped) | ALLOW (Scoped) | ALLOW (Scoped) | ALLOW (Scoped) |
| | Delete / Archive Document | ALLOW | ALLOW | ALLOW (Scoped) | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) |
| **Audit Logs** | Query Audit Trail | ALLOW | ALLOW | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) | ALLOW |

---

## 3. Multi-Tenant Scoping & Cross-Tenant Access Policies

### Rule 1: Strict Organization Scoping
Every data read and write operation executed via Prisma or API handlers MUST include an explicit filter on `organizationId: session.organizationId`.
- **Cross-Tenant Read Request**: If a user from Tenant A requests an entity belonging to Tenant B by ID (`/api/projects/TENANT_B_ID`), the server MUST return `404 Not Found` (or `403 Forbidden` if tenant scope is explicitly disclosed). It must NEVER leak entity details or existence.
- **Cross-Tenant Mutation Request**: Attempting to link a Bill in Tenant A to a Party or Project belonging to Tenant B is rejected at the database validation layer with `404 Not Found` or `400 Bad Request`.

### Rule 2: Super Admin Exemption
`SUPER_ADMIN` has global authority and may specify any `organizationId` via query parameter or header when performing administrative audits or provisioning. For non-superadmin users, any client-supplied `organizationId` or identity header is strictly sanitized and stripped by `src/middleware.ts`.

### Rule 3: File Attachment IDOR Prevention
All files downloaded through `/api/uploads/[id]` verify:
1. File belongs to the user's `organizationId` (or the user is `SUPER_ADMIN`).
2. If attached to a Project, the user has project access.
3. If attached to a secure Folder, the user has `READ` permission on that folder or is `ORG_ADMIN`.
4. If attached to a Chat, the user is a registered participant in that conversation.
Requests failing these conditions receive `404 Not Found`.
