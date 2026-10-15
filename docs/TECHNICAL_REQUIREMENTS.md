# Technical Requirements Document

## 1. Stack Selection & Rationale

| Layer | Selected Technology | Rationale |
|---|---|---|
| **Runtime & Language** | Node.js (v24.x) / TypeScript (Strict Mode) | End-to-end type safety, unified language across data models, backend API, business logic, and UI components. |
| **Web & API Framework** | Next.js 14+ (App Router) | High-performance React Server Components, server actions, integrated API route handlers, responsive rendering, zero-cold-start development. |
| **ORM & Database Layer** | Prisma ORM with SQLite (Development) / PostgreSQL (Production) | Type-safe query builder, declarative schema migrations (`prisma migrate`), robust relational foreign-key enforcement, and atomic transactions via `$transaction`. SQLite provides 100% zero-dependency local execution; Prisma allows transparent mapping to PostgreSQL for cloud deployment. |
| **Validation Layer** | Zod (v3.x) | Centralized, runtime schema validation for API payloads, query parameters, and form inputs. |
| **Styling & Design System** | Tailwind CSS + Lucide Icons | Construction ERP visual design language with full responsiveness (mobile supervisor bottom navigation & desktop sidebar). |
| **Authentication & Session** | Iron Session / Jose JWT with HTTP-only Cookies & bcryptjs | Secure, stateless or database-backed signed sessions, preventing XSS and CSRF vulnerabilities without third-party vendor lock-in. |
| **Testing Suite** | Vitest | High-speed unit and integration testing engine with native TypeScript/ESM support and in-memory test databases. |

## 2. Architecture Principles
1. **Vertical Slice Architecture**: Each domain module (Projects, Tasks, Inventory, Finance, Attendance) encapsulates its database models, validation schemas, application service logic, API endpoints, and UI views.
2. **Authoritative Ledger Rule**: Derived totals (current stock, vendor balance, task counts) are computed from immutable event/transaction records or maintained as transactionally synchronous projections with automated reconciliation.
3. **Defense-in-Depth Authorization**: Every single API route and server action enforces session authentication, organization tenant boundary check, and permission authorization. UI-level hiding is never the sole gate.
4. **Idempotency & Concurrency Safety**: Financial payments and critical inventory movements require idempotency keys to eliminate accidental double-submits.

## 3. Data Integrity & Financial Precision
- **Currency Storage**: Stored as integer minor units (paise for INR; e.g. ₹100.50 is stored as `10050`) or high-precision decimal fields to eliminate floating-point rounding errors.
- **Quantity Storage**: Stored as high-precision decimals/floats with explicit unit-of-measure strings (e.g. `BAG`, `KG`, `TONNE`, `LITRE`, `PIECE`). Unit mixing is disallowed.
- **Timestamps**: All database records store timestamps strictly in UTC (`DateTime`). Display transformations apply the tenant's or site's configured IANA timezone (e.g. `Asia/Kolkata`).
- **Audit Trails**: Soft archival or state transitions for all business transactions (posted bills, payments, stock movements). No silent physical deletion of posted financial or inventory records.

## 4. Non-Functional Requirements (NFR)
- **Security**:
  - Passwords hashed with `bcryptjs` (salt rounds >= 10).
  - Secure, HTTP-only, SameSite cookies.
  - Server-side parameter sanitization and parameterized SQL via Prisma.
  - Granular Role-Based Access Control (RBAC) + Object-level scoping (organization and site IDs).
- **Performance**:
  - Indexed database queries on multi-tenant keys (`organization_id`, `site_id`, `created_at`, `status`).
  - Server-side pagination with default page sizes (15–50 items) to prevent unbounded memory consumption.
- **Accessibility & Responsiveness**:
  - Mobile supervisor view featuring large touch targets (minimum 44x44px), quick-action cards, and responsive tables.
  - Full keyboard accessibility and semantic HTML elements.
- **Observability**:
  - Structured console logging with correlation/request IDs, excluding secrets and sensitive PII.
  - Health check endpoint `/api/health` reporting database connectivity and system status.
