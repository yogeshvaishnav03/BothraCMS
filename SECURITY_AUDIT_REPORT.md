# BothraCMS (BuildTrack Pro) — Security Audit & Vulnerability Remediation Report

**Audit Date:** 2026-10-16  
**Auditor:** DevSecOps & Application Security Specialist  
**Target Codebase:** BothraCMS (BuildTrack Pro) Enterprise Construction ERP SaaS  
**Audit Standard:** OWASP Top 10 (2021/2026), Multi-Tenant SaaS Isolation Guidelines, CWE/SANS Top 25  
**Final Status:** PASSED (All High/Critical Vulnerabilities Remediated & Verified)

---

## 1. Executive Summary

A comprehensive code-level and architecture-level security audit was conducted across all API routes, database models, middleware, authentication flows, session handlers, and file upload systems.

All discovered security vulnerabilities were remediated and verified through automated security regression suites (`phase6-security-audit.test.ts`, `production-security-failsafe.test.ts`, `security-and-phase2.test.ts`).

---

## 2. Vulnerability Assessment & Remediation Log

### 2.1 Multi-Tenant Isolation & IDOR Protection (CWE-639 / OWASP A01:2021)
- **Vulnerability Discovered:** Previously, certain API mutation handlers (e.g. `bills/route.ts`, `issues/route.ts`, `check-in/route.ts`) caught domain exceptions under a generic `catch (dbErr)` block and erroneously returned mock successes or saved cross-tenant payloads into client-side fallbacks.
- **Remediation Applied:** 
  1. Removed all fake fallback success handlers from mutation routes.
  2. Every service query strictly includes `where: { id: resourceId, organizationId: user.organizationId }`.
  3. When an entity belongs to another tenant, the service throws `NotFound: Resource not found or outside organization scope` which triggers HTTP `404 Not Found` via `handleApiError`.
  4. Verified via automated tests:
     - Tenant B cannot create a bill against Tenant A's vendor (`phase6-security-audit.test.ts #3.1`).
     - Tenant B cannot issue goods from Tenant A's store (`phase6-security-audit.test.ts #3.2`).
     - Tenant B cannot check attendance for Tenant A's worker (`phase6-security-audit.test.ts #3.3`).
     - Tenant B cannot download Tenant A's private documents (`phase6-security-audit.test.ts #3.4`).

### 2.2 Broken Access Control & RBAC Enforcement (CWE-285 / OWASP A01:2021)
- **Vulnerability Discovered:** Some endpoints allowed users to perform mutations when permissions were only checked client-side.
- **Remediation Applied:**
  1. Strict server-side permission assertions via `assertPermission(user.role, permission)` enforced in service business logic.
  2. Hierarchy of 8 distinct enterprise roles (`SUPER_ADMIN`, `ORG_ADMIN`, `PROJECT_MANAGER`, `SITE_SUPERVISOR`, `ACCOUNTANT`, `STOREKEEPER`, `HR_VIEWER`, `CLIENT_VIEWER`).
  3. Unauthorized attempts throw `Forbidden: Role ... lacks required permission ...` and return HTTP `403 Forbidden`.
  4. Verified via automated tests:
     - `SITE_SUPERVISOR` cannot approve bills or record Measurement Book entries without `projects:write`.
     - `SITE_SUPERVISOR` cannot correct attendance without `attendance:correct`.

### 2.3 Authentication, JWT Validation & Cryptographic Session Security (CWE-384 / OWASP A07:2021)
- **Vulnerability Discovered:** Development environments used fallback session keys, which, if carried into production, would allow session forgery.
- **Remediation Applied:**
  1. `src/lib/auth.ts` implements a mandatory production fail-safe:
     ```typescript
     if (isProduction) {
       if (!secret || secret === DEFAULT_DEV_SECRET || secret.length < 32) {
         throw new Error("FATAL PRODUCTION CONFIGURATION ERROR: SESSION_SECRET must be configured...");
       }
     }
     ```
  2. Sessions are signed using HMAC-SHA256 via `jose` with 7-day expiration and strict claims (`userId`, `email`, `organizationId`, `role`).
  3. Cookies are issued with `HttpOnly: true`, `SameSite: Lax`, and `Secure: true` in production mode.
  4. Tampered tokens and expired tokens are rejected with HTTP `401 Unauthorized`.

### 2.4 Unsafe File Uploads & Document Downloads (CWE-434 / CWE-22 / OWASP A04:2021)
- **Vulnerability Discovered:** Naive file upload endpoints could be vulnerable to MIME spoofing (uploading executable files disguised with `.png` extensions) and path traversal on download.
- **Remediation Applied:**
  1. **Magic Bytes Inspection:** Inspects raw file headers (`0x89 0x50 0x4E 0x47` for PNG, `0xFF 0xD8 0xFF` for JPEG, `0x25 0x50 0x44 0x46` for PDF, RIFF/WEBP for WebP) before writing to disk. Spoofed MIME types are rejected with HTTP `400 MIME_SPOOFING_DETECTED`.
  2. **Strict Size Limits:** Enforces hard 5 MB limit.
  3. **Path Traversal Immunity:** Filenames are sanitized, storage keys use random UUIDs, and download endpoints pass keys through `path.basename`.
  4. **Content Security Policy on Downloads:** Private document endpoints return sandboxed response headers:
     ```http
     X-Content-Type-Options: nosniff
     Content-Security-Policy: default-src 'none'; sandbox
     X-Frame-Options: DENY
     Cache-Control: private, max-age=3600
     ```

### 2.5 Financial Precision & Floating-Point Drift (CWE-682)
- **Vulnerability Discovered:** Native JavaScript IEEE 754 floating math introduces subtle rounding errors (e.g. `19.99 * 100 = 1998.9999999999998`).
- **Remediation Applied:**
  1. All financial values are stored and manipulated as **integers in minor units (Paise)**.
  2. `safeRupeesToPaise` uses `Math.round(rupees * 100)` to eliminate rounding drift.
  3. Quantity calculations use `safeSubtractQuantity` and `roundQuantity` with 4-decimal clamping.
  4. Verified via unit tests (`financial-math.test.ts`).

### 2.6 Race Conditions, Payment Replay & Idempotency (CWE-362 / OWASP A08:2021)
- **Vulnerability Discovered:** Network retries on payment submission could create duplicate debit allocations.
- **Remediation Applied:**
  1. Payments require client-supplied `idempotencyKey`.
  2. Database checks for existing idempotency key before performing write.
  3. Duplicate submissions return the existing payment with `idempotentReplay: true` and HTTP `200 OK` without creating duplicate allocations or double-crediting balances.
  4. Financial operations, inventory movements, and payment reversals execute inside atomic Prisma transactions (`prisma.$transaction`).

### 2.7 Sensitive Data Disclosure in Production Errors (CWE-209 / OWASP A09:2021)
- **Vulnerability Discovered:** Raw database error messages (e.g. Prisma constraint messages, table names, SQL syntax) could leak internal database topology.
- **Remediation Applied:**
  1. In `src/lib/api-response.ts`, when `process.env.NODE_ENV === "production"`, internal system errors are replaced with `"An internal server error occurred"`.
  2. Detailed error stacks are logged server-side only.

---

## 3. Automated Security Test Verification Matrix

| Vulnerability Category | Automated Test File | Test Case | Result |
| :--- | :--- | :--- | :---: |
| Tenant IDOR Prevention | `phase6-security-audit.test.ts` | Reject cross-tenant bill creation | ✅ PASSED |
| Tenant IDOR Prevention | `phase6-security-audit.test.ts` | Reject cross-tenant goods issue | ✅ PASSED |
| Tenant IDOR Prevention | `phase6-security-audit.test.ts` | Reject cross-tenant attendance check-in | ✅ PASSED |
| Tenant IDOR Prevention | `phase6-security-audit.test.ts` | Reject cross-tenant document download | ✅ PASSED |
| MIME Spoofing & Magic Bytes | `phase6-security-audit.test.ts` | Reject file with spoofed signature | ✅ PASSED |
| Directory Traversal | `phase6-security-audit.test.ts` | Block `../` directory traversal in downloads | ✅ PASSED |
| Error Sanitization | `phase6-security-audit.test.ts` | Sanitize internal DB errors in production | ✅ PASSED |
| Production Key Safety | `production-security-failsafe.test.ts` | Abort if SESSION_SECRET is weak or missing | ✅ PASSED |
| Idempotency & Replay | `business-rules.test.ts` | Prevent duplicate payments with same key | ✅ PASSED |
| Negative Balance Invariant | `business-rules.test.ts` | Prevent overdrawing stock balance | ✅ PASSED |
| Attendance GPS Invariant | `phase4-release-gate.test.ts` | Reject duplicate worker check-in same day | ✅ PASSED |
| Measurement Duplicate Billing| `phase4-release-gate.test.ts` | Block converting already-billed MB entry | ✅ PASSED |

**Audit Conclusion:** The application exhibits robust multi-tenant security boundaries, verified cryptographic configurations, and zero unauthenticated or unauthorized mutation pathways.
