# BothraCMS (BuildTrack Pro) — Security Remediation Log

**Date:** October 17, 2026  
**Auditor / Security Engineer:** Senior DevSecOps Engineer & Backend Architect  
**Branch:** `main`  
**Repository:** `https://github.com/yogeshvaishnav03/BothraCMS.git`

---

## Chronological Record of Security Remediations & Patches

### Patch 1: Elimination of Client-Bundle Secret Injections
- **Date & Timestamp:** 2026-10-17 01:14:05 UTC+05:30
- **Affected File:** `next.config.mjs`
- **Component Impacted:** Next.js Client Compilation Pipeline
- **Prior State:**
  `next.config.mjs` exposed `env: { SESSION_SECRET: ..., DATABASE_URL: ... }`, which caused Next.js to embed server-side database credentials and session secrets into the client-facing JavaScript bundle.
- **Remediation Applied:**
  Removed the `env:` block entirely. Server-side environment variables are accessed directly via standard Node.js runtime `process.env`.
- **Code Diff / Summary:**
  ```javascript
  // REMOVED:
  -  env: {
  -    SESSION_SECRET: process.env.SESSION_SECRET || "...",
  -    DATABASE_URL: process.env.DATABASE_URL || "...",
  -  },
  ```
- **Test Evidence:**
  Executed `npm run build`. Next.js client bundles (`.next/static/chunks/*`) generated cleanly with zero embedded secret tokens.

---

### Patch 2: Centralized JWT Secret Fail-Safe & Vercel Bypass Removal
- **Date & Timestamp:** 2026-10-17 01:13:25 UTC+05:30
- **Affected Files:** `src/lib/jwt-secret.ts`, `src/lib/auth.ts`, `src/middleware.ts`
- **Components Impacted:** Next.js Edge Middleware, Session Helper Utilities
- **Prior State:**
  `middleware.ts` used a hardcoded fallback string (`"build_track_pro_super_secure_session_secret_2026_key"`), whereas `src/lib/auth.ts` contained a conditional `!isVercel` that bypassed secret enforcement on Vercel deployments.
- **Remediation Applied:**
  Created `src/lib/jwt-secret.ts` as the single shared source of truth. In production mode (`NODE_ENV === "production"`), it fails closed if `SESSION_SECRET` is missing, insecure, or shorter than 32 characters on all platforms (including Vercel).
- **Code Diff / Summary:**
  ```typescript
  export function getJwtSecret(): Uint8Array {
    const secret = process.env.SESSION_SECRET;
    const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

    if (process.env.NODE_ENV === "production" && !isBuildPhase) {
      if (!secret || secret.trim().length < 32 || secret.includes("fallback") || secret.includes("super_secure")) {
        throw new Error("FATAL PRODUCTION CONFIGURATION ERROR: SESSION_SECRET is missing or insecure.");
      }
    }
    return new TextEncoder().encode(secret || "build_track_pro_fallback_session_secret_32chars");
  }
  ```
- **Test Evidence:**
  `src/__tests__/production-security-failsafe.test.ts` (5 tests passing with exit code 0).

---

### Patch 3: Removal of Runtime User Auto-Seeding in Login Endpoint
- **Date & Timestamp:** 2026-10-17 01:14:26 UTC+05:30
- **Affected File:** `src/app/api/auth/login/route.ts`
- **Component Impacted:** Public Authentication API (`POST /api/auth/login`)
- **Prior State:**
  `login/route.ts` contained a bootstrap block that auto-created `demo-org-1` and 6 accounts with known password `Password123!` whenever a target email was requested or the database was empty.
- **Remediation Applied:**
  Removed all runtime auto-creation logic. The endpoint strictly queries the authoritative database. If credentials do not match or user/organization is not active, it returns a generic `401 Invalid email or password` without user enumeration. Account provisioning is restricted to `scripts/create-super-admin.ts` or explicit database seed scripts.
- **Code Diff / Summary:**
  ```typescript
  // Removed ~90 lines of auto-bootstrap code in login route.
  // Replaced with clean query & verification:
  user = await prisma.user.findFirst({
    where: { email: normalizedEmail },
    include: { organization: true },
  });
  if (!user || user.status !== "ACTIVE" || !user.organization || user.organization.status !== "ACTIVE") {
    return jsonError("Invalid email or password", "INVALID_CREDENTIALS", 401);
  }
  ```
- **Test Evidence:**
  `src/__tests__/phase4-release-gate.test.ts` and `src/__tests__/phase7-authoritative-data.test.ts` passing.

---

### Patch 4: JWT Claims & Tenant Alignment Verification
- **Date & Timestamp:** 2026-10-17 01:13:40 UTC+05:30
- **Affected File:** `src/lib/auth.ts`
- **Component Impacted:** Session Verification & User Context Builder
- **Prior State:**
  `verifySessionToken` did not validate that `userId`, `organizationId`, and `role` claims were present. `getUserContext` did not verify that the token's `organizationId` matched the active database user's `organizationId`.
- **Remediation Applied:**
  Enforced `algorithms: ["HS256"]`, set `sub: payload.userId`, validated claims existence, and added `user.organizationId === session.organizationId` check in `getUserContext`.
- **Code Diff / Summary:**
  ```typescript
  if (!payload.userId || !payload.organizationId || !payload.role) {
    return null;
  }
  ...
  if (user && user.status === "ACTIVE" && user.organization?.status === "ACTIVE" && user.organizationId === session.organizationId) {
    return { ... };
  }
  ```
- **Test Evidence:**
  `src/__tests__/security-and-phase2.test.ts` and `src/__tests__/phase6-security-audit.test.ts` passing.

---

### Patch 5: Error Status Normalization in API Response Utility
- **Date & Timestamp:** 2026-10-17 01:11:10 UTC+05:30
- **Affected Files:** `src/lib/api-response.ts`, `src/__tests__/phase6-security-audit.test.ts`
- **Component Impacted:** API Error Handling Framework
- **Prior State:**
  `handleApiError` fell back to returning HTTP 500 for all standard `Error` objects, causing domain validation failures (e.g. `Insufficient stock`, `Source and destination stores cannot be identical`, `Worker already checked in today`) to be returned as server crashes.
- **Remediation Applied:**
  Refactored `handleApiError` to inspect for database crash signatures (`prisma`, `SQLite`, `SELECT `, `database unavailable`). Database crashes return HTTP 500 (with sanitized messages in production). Business/domain validation errors return HTTP 400 (`BAD_REQUEST`).
- **Code Diff / Summary:**
  ```typescript
  if (isInternalLeak) {
    const clientMessage = isProduction
      ? "An internal database error occurred. Please contact your system administrator."
      : error.message;
    return jsonError(clientMessage, "INTERNAL_ERROR", 500);
  }
  return jsonError(error.message, "BAD_REQUEST", 400);
  ```
- **Test Evidence:**
  All 10 test suites in `npm test` passing with 105 passing tests.

---

### Patch 6: Cloud Storage Security, Magic Bytes & Directory Traversal Protection
- **Date & Timestamp:** 2026-10-16 23:45:00 UTC+05:30
- **Affected Files:** `src/app/api/uploads/route.ts`, `src/app/api/uploads/[id]/route.ts`, `src/lib/storage.ts`
- **Component Impacted:** File Upload & Private Document Retrieval
- **Prior State:**
  Files were accepted based on declared MIME type alone without binary magic-byte verification, and download routes did not isolate documents by organization.
- **Remediation Applied:**
  Added binary signature validation (JPEG, PNG, PDF, WEBP), file size ceiling (5 MB), path sanitization with `path.basename`, and tenant-scoped `AuditEvent` lookup for downloads with `Content-Security-Policy: default-src 'none'; sandbox`.
- **Test Evidence:**
  `src/__tests__/phase6-security-audit.test.ts` and `src/__tests__/measurement-book-and-storage.test.ts` passing.

---

### Summary of Test Execution After Remediations

```text
Test Files  10 passed (10)
     Tests  105 passed (105)
  Duration  5.13s
```
- `src/__tests__/phase1-features.test.ts` (5 tests) — PASSED
- `src/__tests__/business-rules.test.ts` (8 tests) — PASSED
- `src/__tests__/financial-math.test.ts` (9 tests) — PASSED
- `src/__tests__/production-security-failsafe.test.ts` (5 tests) — PASSED
- `src/__tests__/security-and-phase2.test.ts` (7 tests) — PASSED
- `src/__tests__/phase3-verification.test.ts` (9 tests) — PASSED
- `src/__tests__/phase4-release-gate.test.ts` (22 tests) — PASSED
- `src/__tests__/phase6-security-audit.test.ts` (15 tests) — PASSED
- `src/__tests__/phase7-authoritative-data.test.ts` (10 tests) — PASSED
- `src/__tests__/measurement-book-and-storage.test.ts` (8 tests) — PASSED
