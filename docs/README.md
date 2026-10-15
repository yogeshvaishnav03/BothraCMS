# Build Track Pro — Documentation Index

Welcome to the comprehensive documentation suite for **Build Track Pro**, a full-featured construction project and site operations management platform.

## Documentation Structure

| Document | Purpose |
|---|---|
| [PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md) | Business goals, user personas, epics, user stories, and MVP scope |
| [TECHNICAL_REQUIREMENTS.md](./TECHNICAL_REQUIREMENTS.md) | Technology stack rationale, architectural principles, NFRs, and environment configurations |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Component architecture, layer boundaries, and Mermaid architectural diagrams |
| [APP_FLOWS.md](./APP_FLOWS.md) | End-to-end user journey workflows and state transition diagrams (Mermaid) |
| [UI_UX_BRIEF.md](./UI_UX_BRIEF.md) | Construction ERP visual system, responsive mobile/desktop layouts, supervisor drawer, accessibility standards |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Complete relational schema (Postgres-compatible SQLite via Prisma ORM), foreign keys, indexes, constraints |
| [API_SPEC.md](./API_SPEC.md) | RESTful API specifications, route permissions, request/response schemas, error handling contracts |
| [ROLE_PERMISSION_MATRIX.md](./ROLE_PERMISSION_MATRIX.md) | Granular permissions, role mappings, and organization/site data scoping rules |
| [DATA_SYNC_RULES.md](./DATA_SYNC_RULES.md) | Single source of truth principles, transactional stock ledgers, financial reconciliations, attendance integrity |
| [TEST_PLAN.md](./TEST_PLAN.md) | Unit, integration, security, and end-to-end verification strategy and acceptance criteria |
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | Phased execution roadmap, exit gates, dependency graph, and progress tracker |
| [ASSUMPTIONS.md](./ASSUMPTIONS.md) | Architectural defaults, domain decisions, currency/timezone rules, and boundaries |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Step-by-step local setup, migrations, seed instructions, production readiness, and backups |

## System Overview

Build Track Pro connects:
1. **Projects & Daily Progress**: Milestones, daily site logs, blockers, safety notes, and supervisor quick-entry.
2. **Material Ledger & Inventory**: Authoritative double-entry-style stock ledger, site-level inventory, receipts, issues, transfers, and real-time reconciliation.
3. **Vendors & Contractors**: Bills, credit notes, payments with idempotency, automated balance calculations, and vendor ledgers.
4. **Workforce Attendance**: Geolocation-aware event logging, shift sessions, sequence validation, and supervisor correction workflows.
5. **Real-time Dashboards & Reports**: Real database-backed KPIs, stock valuation, aging payables, and audit logging.
