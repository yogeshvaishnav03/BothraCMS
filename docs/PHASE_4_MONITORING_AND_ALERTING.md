# Phase 4: Production Monitoring, Alerting & Observability Guide

**System:** Build Track Pro / BothraCMS  
**Date:** October 20, 2026  
**Status:** PRODUCTION OPERATIONAL SPECIFICATION  
**Primary Modules:** Health Probes, Structured Logging, Metrics, Threshold Alerts, PII Masking

---

## 1. Uptime Probes & Health Endpoint

Build Track Pro exposes a hardened, zero-disclosure health probe endpoint at `/api/health`.

### 1.1 Endpoint Specification (`GET /api/health`)
- **Accessibility:** Public (unauthenticated), suitable for load balancers (AWS ALB, Cloudflare, Vercel, Kubernetes ingress) and external synthetic pingers (Datadog, Better Uptime, New Relic).
- **Behavior:** Executes a lightweight database connectivity check (`SELECT 1`).
- **Response Format (HTTP 200 OK):**
  ```json
  {
    "status": "ok",
    "database": "connected",
    "uptime": 1842.54,
    "timestamp": "2026-10-20T10:15:00.000Z"
  }
  ```
- **Failure Mode (HTTP 503 Service Unavailable):**
  ```json
  {
    "status": "error",
    "database": "disconnected",
    "timestamp": "2026-10-20T10:15:00.000Z"
  }
  ```
- **Zero Information Leakage:** Under database partitions or fatal connection drops, raw stack traces, database credentials, hostnames, and table schemas are completely omitted from the HTTP response. Detailed diagnostics are streamed exclusively to operational logs.

---

## 2. Structured Logging Standards

All application logs emitted to `stdout` and `stderr` follow a consistent structured format for automated ingestion by log aggregation engines (Datadog, AWS CloudWatch, Grafana Loki, ElasticSearch).

### 2.1 Standard Log Schema
```json
{
  "timestamp": "2026-10-20T10:15:00.123Z",
  "level": "INFO | WARN | ERROR",
  "tag": "[API_REQUEST] | [API_ERROR] | [RATE_LIMIT] | [JWT_SECRET] | [BACKUP]",
  "route": "/api/finance/payments",
  "method": "POST",
  "statusCode": 200,
  "durationMs": 14.2,
  "organizationId": "1eb45938-3964-41ab-8145-c8ff93c90c73",
  "userId": "usr-1234",
  "clientIp": "203.0.113.45"
}
```

### 2.2 Dedicated Security Event Tags
- `[RATE_LIMIT_BLOCKED]`: Emitted when an IP or identifier exceeds 5 failed attempts in 15 minutes.
- `[CSRF_BLOCKED]`: Emitted when an inbound browser request fails Origin/Referer verification.
- `[TENANT_ISOLATION_VIOLATION]`: Emitted if a user attempts to supply an entity ID belonging to another organization.
- `[UNAUTHORIZED_ACCESS]`: Emitted on missing, expired, or malformed JWT session credentials.

---

## 3. Operational Alerting Thresholds

The table below outlines the recommended operational alert thresholds for production incident response teams:

| Alert Name | Metric / Trigger | Severity | Recommended Channel | Response SLA |
|---|---|:---:|:---:|:---:|
| **Database Disconnect** | `/api/health` returns HTTP 503 for 2 consecutive checks (2 min) | Critical | PagerDuty / Phone Call | < 5 minutes |
| **High Error Rate** | HTTP 5xx responses exceed 1% of total requests over 5 minutes | High | Slack #alerts-critical | < 15 minutes |
| **Elevated Latency** | p95 response time exceeds 250ms over a 10-minute window | Medium | Slack #ops-monitoring | < 1 hour |
| **Brute Force Detection** | > 10 `[RATE_LIMIT_BLOCKED]` events from single subnet in 5 min | Medium | Slack #security-alerts | < 30 minutes |
| **Backup Failure** | No successful backup artifact detected within 2 hours | High | Slack #alerts-critical | < 1 hour |
| **Storage Capacity** | Disk usage on `/storage` volume exceeds 80% | Warning | Email / Slack | < 4 hours |
| **Storage Critical** | Disk usage on `/storage` volume exceeds 90% | Critical | PagerDuty | < 30 minutes |

---

## 4. Secret & Sensitive Data Redaction Guidelines

To comply with data privacy standards (GDPR, ISO 27001) and prevent credential leakage:
1. **Never Log Secrets:** `SESSION_SECRET`, `DATABASE_URL`, `AWS_SECRET_ACCESS_KEY`, and raw passwords must never appear in log streams.
2. **PII Masking:**
   - Phone numbers: Redact to last 4 digits (e.g., `+91-XXXXX-1234`).
   - Bank Account numbers: Mask middle digits (e.g., `XXXXXXXX1234`).
   - Worker Daily Wages & Totals: Retain only in tenant-authorized API responses; omit from generic diagnostic logs.
3. **Error Traces:** Global error boundaries in [src/lib/api-response.ts](file:///d:/yogesh/BothraCMS-main/BothraCMS-main/src/lib/api-response.ts) map all internal Prisma errors to generic status codes and sanitized messages.
