# Release Notes — Phase 2 Security & Architecture Hardening

**BuildTrack Pro / BothraCMS Enterprise Construction Platform**  
*Release Tag: `v2.0.0-phase2-security-audit`*  
*Target Branch: `phase2-security-audit`*  
*Release Date: 2026-10-20*

---

## 1. Release Overview

Phase 2 introduces an extensive overhaul of enterprise security controls, data persistence, and tenant isolation across BuildTrack Pro (BothraCMS). This release resolves all critical blockers highlighted during the security audit, permanently retires ephemeral JSON and in-memory persistence, migrates 151 core measurement book records to the database, and achieves a 100% test pass rate across 28 test suites.

---

## 2. Key Highlights & Security Remediations

### 1. Robust CSRF & Bearer Authentication Engine
- **Browser Protection**: Mutative requests carrying browser session cookies strictly enforce matching Origin/Referer headers against the host and `TRUSTED_ORIGINS`.
- **Dual-Credential Defense**: Inbound requests containing both cookie and Bearer tokens are recognized as browser-initiated and are subject to mandatory CSRF verification.
- **Stateless Bearer Exemption**: Bearer-token requests without cookies are granted CSRF exemption only after cryptographic verification of their JWT signature. Invalid or expired tokens receive `401 Unauthorized` without CSRF bypass.
- **Client Header Stripping**: Forged client headers (`x-user-id`, `x-user-role`, `x-organization-id`) are purged before request routing.

### 2. Ephemeral Storage Elimination & 100% Data Migration
- **Measurement Book Persistence**: Replaced `storage/data/measurement-book.json` with relational Prisma model `MeasurementBookEntry`. All 151 historical measurement records were safely migrated to the database. Pre-migration backup preserved at `measurement-book.json.bak`.
- **Workforce Headcount Persistence**: Replaced ephemeral memory storage with relational model `WorkforceHeadcount`. Added compound unique constraint on `[organizationId, siteId, date, shift]` to prevent duplicate headcount records.
- **Interactive Transactions**: Subcontractor measurement approvals and bill generation now execute inside atomic database transactions (`prisma.$transaction`), eliminating race conditions and double-billing vulnerabilities.

### 3. Multi-Tenant Isolation & IDOR Fixes
- **Attachment Authorization**: Fixed a critical authorization flaw in `/api/uploads/[id]` where tenant admin checks allowed cross-tenant document viewing. Restricted cross-organization viewing strictly to `SUPER_ADMIN`.
- **Project & Vendor Scoping**: Enforced database validation preventing Tenant A from creating bills or issuing purchase orders linked to Tenant B's vendors or projects.

### 4. Production Security Headers & Fail-Safes
- Added HTTP Strict Transport Security (`HSTS`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and restricted Content Security Policy in `next.config.mjs`.
- Startup fail-safe terminates execution if `SESSION_SECRET` is weak or missing in production mode.

---

## 3. Verification & Quality Assurance Summary

- **Test Suite Results**: 28 test suites, 247 test cases executed against the real database; **247 Passed, 0 Failed (100% Pass Rate)**.
- **TypeScript Health**: `tsc --noEmit` executed with **0 errors**.
- **API Endpoints Audited**: 60 API routes fully documented with authentication, permission, validation, and database operations in `docs/API_AUDIT.md`.
- **Role Permission Matrix**: 8 system roles mapped across all operational resources in `docs/AUTHORIZATION_MATRIX.md`.

---

## 4. Upgrading & Migration Instructions

1. Deploy code to target server.
2. Ensure `SESSION_SECRET` (>= 32 chars) and `DATABASE_URL` are configured.
3. Run `npx prisma generate && npx prisma migrate deploy`.
4. Run `node scripts/migrate-data-to-db.js` if migrating an existing JSON database store.
5. Restart the application service.
