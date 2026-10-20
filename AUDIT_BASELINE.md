# AUDIT_BASELINE.md — BothraCMS / BuildTrack Pro
**Date:** 2026-10-20  
**Auditor:** Senior Security Engineer & Full-Stack Architect  
**Branch:** `phase2-security-audit`  
**Framework:** Next.js 14.2.35 (App Router, React 18, TypeScript)  
**Database:** Prisma ORM 5.22.0 (SQLite local / PostgreSQL cloud compatible)  
**Authentication:** JWT (HMAC-SHA256 via `jose`), HTTP-only Session Cookie (`buildtrack_session`) & `Authorization: Bearer`  
**Tenant Model:** Multi-tenant organization isolation (`organizationId`) with system-level `SUPER_ADMIN`  

---

## 1. Executive Summary & Verification of Previous Findings

A comprehensive baseline inspection of the repository was conducted across all 60 API routes, 14 frontend modules, middleware, database models, background services, and test suites.

| Previous Blocker Finding | Verification Status in Current Code | Current Severity |
| :--- | :--- | :--- |
| **Hardcoded JWT Fallback Secret** | **Partially Remediated in Phase 1**: Removed from `src/lib/jwt-secret.ts`, but still present in test fixtures and scripts (`create-super-admin.ts`, `seed.ts`). Must enforce strict runtime check. | **HIGH** |
| **CSRF Bypass via Fake Bearer Header** | **CONFIRMED**: In `src/middleware.ts`, checking `authorization.startsWith("Bearer ")` exempted requests from CSRF without validating the Bearer token or checking if session cookies were simultaneously attached. | **CRITICAL** |
| **Health Route Info Disclosure** | **Remediated in Phase 1**: `src/app/api/health/route.ts` now returns minimal `{status, timestamp}` or 503 without leaking database URLs or hosts. Verified. | **RESOLVED** |
| **Ephemeral File Storage for Core Business Records** | **CONFIRMED**: `MeasurementBookService` and `WorkforceHeadcountService` store records in JSON files under `storage/data/` with `globalThis` in-memory fallback, resulting in data loss on serverless/container restart. | **CRITICAL** |
| **Cross-Tenant Attachment Access (`ORG_ADMIN`)** | **CONFIRMED**: In `src/app/api/uploads/[id]/route.ts`, `!isOrgOwnerOrAdmin(user)` allowed Org Admins of Organization B to access attachments of Organization A because the check was not restricted to `SUPER_ADMIN`. | **HIGH** |
| **Incomplete Database Migrations for MB & Headcount** | **CONFIRMED**: Prisma schema lacks `MeasurementBookEntry` and `WorkforceHeadcount` models, keeping them detached from relational integrity and audit events. | **HIGH** |
| **Missing Security Response Headers** | **CONFIRMED**: `next.config.mjs` does not configure standard security headers (`Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Referrer-Policy`). | **MEDIUM** |

---

## 2. Existing Features & Implementation Status

| Module | Route / Path | Implementation Status | Notes |
| :--- | :--- | :--- | :--- |
| **Dashboard** | `/` | **COMPLETE** | Live KPI aggregations, site labor headcount badges, client caching, photo gallery modal. |
| **Day Book** | `/day-book` | **COMPLETE** | Consolidated daily register: Payments, Bills, Workforce Headcount, DSR with multi-entry modal. |
| **Finance** | `/finance` | **COMPLETE** | Invoices/Bills, Payments, Idempotent disbursements, Approval queries, Reverse entries. |
| **Materials / Inventory** | `/materials` | **COMPLETE** | Material catalog, stock receipts, stock issues, inter-store transfers, stock ledger. |
| **Workforce** | `/workforce` | **PARTIAL** | Staff attendance sessions present; Daily headcount was stored in JSON/in-memory (migrating to DB). |
| **Measurement Book** | `/measurement-book` | **PARTIAL** | UI functional, but backend data persisted in `storage/data/measurement-book.json` instead of SQL. |
| **Projects & Sites** | `/projects` | **COMPLETE** | Multi-site hierarchy, project manager assignments, budget tracking, secure document folders. |
| **Tasks** | `/tasks` | **COMPLETE** | Task assignment, status transition audit trail, comments, attachments. |
| **Parties & Ledgers** | `/parties` | **COMPLETE** | Vendor/Contractor master data, statements of account, outstanding bill balances. |
| **Chat & Messaging** | `/chat` | **COMPLETE** | Direct and group conversations, participant isolation, image attachments. |
| **Audit Logs** | `/audit` | **COMPLETE** | Immutable audit trail for financial, task, inventory, and authentication events. |
| **Admin & Bootstrap** | `/admin` | **COMPLETE** | Super Admin tenant management and database seeding. |

---

## 3. Confirmed Vulnerabilities to Remediate in Phase 2

### 3.1 CSRF Middleware Credential Collision & Fake Bearer Exemption (CRITICAL)
- **File:** `src/middleware.ts`
- **Root Cause:** If a malicious page triggers a cross-origin POST from a victim's authenticated browser (which sends cookies) and injects `Authorization: Bearer invalid`, the middleware exempted CSRF check because it only checked `authorization.startsWith("Bearer ")`.
- **Fix:** 
  1. If session cookie is present, enforce CSRF Origin/Referer check unconditionally.
  2. If only Bearer header is present, cryptographically verify the JWT token before granting CSRF exemption; if invalid, reject with 401.

### 3.2 Ephemeral JSON Storage for Measurement Book & Workforce Headcount (CRITICAL)
- **Files:** `src/services/measurement-book-service.ts`, `src/services/workforce-headcount-service.ts`
- **Root Cause:** Storing records in `storage/data/*.json` and `globalThis.__WORKFORCE_HEADCOUNT__`. On platforms like Vercel, AWS Fargate, or Kubernetes, pod restarts wipe all records.
- **Fix:** Add `MeasurementBookEntry` and `WorkforceHeadcount` tables to `prisma/schema.prisma`, execute database migration, import existing JSON data, and update services to use ACID transactions.

### 3.3 Cross-Tenant Attachment Authorization Flaw for `ORG_ADMIN` (HIGH)
- **File:** `src/app/api/uploads/[id]/route.ts` (line 42)
- **Root Cause:** Check `attachment.organizationId !== user.organizationId && !isOrgOwnerOrAdmin(user)` permits an `ORG_ADMIN` of Org B to view attachments of Org A because `isOrgOwnerOrAdmin` returned true for any Org Admin.
- **Fix:** Restrict cross-organization viewing exemption strictly to `user.role === "SUPER_ADMIN"`.

### 3.4 Missing Security Response Headers (MEDIUM)
- **File:** `next.config.mjs`
- **Root Cause:** Absence of HTTP security headers leaves browsers vulnerable to clickjacking (`X-Frame-Options`), MIME confusion (`X-Content-Type-Options`), and insecure transport downgrade.
- **Fix:** Add `headers()` configuration in `next.config.mjs` with HSTS, X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy, and Permissions-Policy.

---

## 4. Architectural Constraints & Database Provider
- **Dual SQLite / PostgreSQL Support:** Development and test environments use SQLite (`file:./dev.db`), while production cloud environments use PostgreSQL.
- **Prisma Schema Compatibility:** Model definitions must maintain standard relational types compatible with both engines (avoid Postgres-specific partial index syntax `where:` inside `@@unique` in Prisma schema, managing business uniqueness via transactions and indices).
- **Permissions Model:** Role-Based Access Control (RBAC) with 8 roles (`SUPER_ADMIN`, `ORG_ADMIN`, `PROJECT_MANAGER`, `SITE_SUPERVISOR`, `ACCOUNTANT`, `STOREKEEPER`, `HR_VIEWER`, `AUDITOR`) and 20 granular permissions.

---

## 5. Next Steps for Phase 2 Execution
1. Fix CSRF middleware & Bearer authentication logic.
2. Fix cross-tenant authorization in file upload/download endpoints.
3. Migrate Measurement Book and Workforce Headcount to Prisma database models.
4. Run migration script to import existing 120KB `measurement-book.json` data into the database.
5. Add HTTP security headers to `next.config.mjs`.
6. Audit all API routes for multi-tenant scoping and create `docs/AUTHORIZATION_MATRIX.md`.
7. Verify all test suites and production build.
