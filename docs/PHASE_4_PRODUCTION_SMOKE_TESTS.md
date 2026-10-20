# Phase 4: Production Post-Deployment Smoke Test Protocol

**System:** Build Track Pro / BothraCMS  
**Protocol Version:** 1.0  
**Target Host:** Production Web Endpoint (e.g., `https://app.bothracms.com`)  
**Execution Timing:** Immediately following live production release / container launch (Estimated Duration: 5-7 minutes)  
**Operators:** Lead QA Engineer & On-Call DevOps Engineer

---

## 1. Objective & Scope

This smoke test protocol verifies that the live production deployment is functional, secure, tenant-isolated, and ready for end-user traffic without introducing service disruptions.

---

## 2. Step-by-Step Production Smoke Test Checklist

| Step # | Test Name | Target Route / Action | Verification Command / Procedure | Expected Result | Pass Criteria |
|:---:|---|---|---|---|:---:|
| **ST-01** | **Uptime Probe** | `GET /api/health` | `curl -i https://app.bothracms.com/api/health` | HTTP 200 OK with `status: "ok"`, `database: "connected"` | Status 200 & Database connected |
| **ST-02** | **Security Headers** | `HEAD /` | `curl -I https://app.bothracms.com/` | `X-Frame-Options: DENY`<br>`X-Content-Type-Options: nosniff`<br>`Strict-Transport-Security: max-age=...` | All 4 security headers present |
| **ST-03** | **Session Cookie Attributes** | `POST /api/auth/login` | Log in via web UI or API with authorized credentials | Cookie `buildtrack_session` issued with: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` | All 4 security flags set on cookie |
| **ST-04** | **CSRF Browser Protection** | `POST /api/projects` | Dispatch mutation with cookie but without valid `Origin` header | Rejected with HTTP 403 Forbidden (`Cross-site request forgery blocked`) | HTTP 403 Forbidden |
| **ST-05** | **Stateless API Bearer Auth** | `GET /api/projects` | `curl -H "Authorization: Bearer <valid_token>" https://app.bothracms.com/api/projects` | Authenticates successfully and returns tenant's projects | HTTP 200 OK with valid JSON payload |
| **ST-06** | **Supervisor Financial Gate** | `POST /api/finance/payments` | Submit payment disbursement using `SITE_SUPERVISOR` account | Server rejects with HTTP 403 Forbidden (`Permission denied`) | HTTP 403 Forbidden |
| **ST-07** | **Storekeeper Billing Gate** | `POST /api/finance/bills` | Submit vendor bill using `STOREKEEPER` account | Server rejects with HTTP 403 Forbidden (`Permission denied`) | HTTP 403 Forbidden |
| **ST-08** | **Auditor Read-Only Gate** | `POST /api/inventory/issues` | Submit material issue using `AUDITOR` account | Server rejects with HTTP 403 Forbidden (`Permission denied`) | HTTP 403 Forbidden |
| **ST-09** | **Cross-Tenant IDOR Isolation** | `GET /api/projects/:tenantA_id` | Request Project ID from Org A using session token from Org B | Server returns HTTP 404 Not Found (or 403 Forbidden); no metadata leaked | HTTP 404 / 403 |
| **ST-10** | **Day Book Date Alignment** | UI: `/day-book` | Open `/day-book` in browser on Indian Standard Time (IST) | Bills and payments submitted for the current day render without $\pm 1$ day offset | Records render on selected date |
| **ST-11** | **Workforce "All Sites" View** | UI: `/workforce` | Open `/workforce` and select dropdown `All Sites (All Deployments)` | Headcount table renders worker counts across all sites | All active sites aggregated |
| **ST-12** | **File Upload & Magic Bytes** | `POST /api/uploads` | Upload sample `delivery_challan.png` (valid PNG magic bytes) | Returns HTTP 200 with stored file ID and metadata | HTTP 200 OK |
| **ST-13** | **Private Attachment Access** | `GET /api/uploads/:id` | Fetch uploaded file using authorized participant session | HTTP 200 OK with `Content-Disposition: attachment; filename=...` | HTTP 200 & Correct disposition |
| **ST-14** | **Unauthenticated File Probe** | `GET /api/uploads/:id` | Fetch uploaded file without session cookie or Bearer token | Rejected with HTTP 401 Unauthorized; file bytes are never served | HTTP 401 Unauthorized |
| **ST-15** | **Rate Limiter Enforcement** | `POST /api/auth/login` | Transmit 6 consecutive failed logins from single IP | 1st-5th return HTTP 401; 6th returns HTTP 429 Too Many Requests | HTTP 429 on 6th attempt |
| **ST-16** | **Session Invalidation** | `POST /api/auth/logout` | Call logout endpoint | Cookie `buildtrack_session` cleared (`Max-Age=0`) | Cookie invalidated |

---

## 3. Pass / Fail Criteria & Sign-Off

- **Mandatory Criteria:** All 16 checks must evaluate to **PASS**.
- **Action on Failure:**
  - If any security or authorization check (ST-02, ST-04, ST-06 through ST-09, ST-14, ST-15) fails: **Immediate Rollback** via `docs/PHASE_4_DEPLOYMENT_RUNBOOK.md`.
  - If a non-security functional check fails: Escalate to on-call engineer to determine hotfix vs. rollback.
- **Sign-Off:** Once all 16 checks pass, update operational status to **PRODUCTION DEPLOYED AND VERIFIED**.
