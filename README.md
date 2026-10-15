# Build Track Pro

> Enterprise Construction Project, Site Operations & Financial Management Platform

Build Track Pro connects projects, daily site activities, authoritative stock ledgers, vendors, contractors, financial allocations, and workforce attendance into one unified, production-minded platform.

## Key Features
- **Authoritative Stock Ledger**: Double-entry style material movements (Receipts, Issues, Transfers, Adjustments) per site store with live reconciliation.
- **Contractor & Vendor Finance**: Full lifecycle of bills, credit notes, payment allocations with idempotency, and real-time vendor ledgers.
- **Workforce Attendance**: Shift check-in/out with optional event-based GPS tagging, state machine sequence enforcement, and supervisor corrections.
- **Project Operations & Daily Site Reports**: Task lifecycle tracking with status history, daily site logs, blockers, and safety notes.
- **Supervisor-First Mobile Experience**: Fast touch-dock, quick-action drawer, card layouts, and offline-friendly form validation.
- **Real Database-Backed Dashboard**: Live KPI cards for active projects, overdue tasks, attendance, low-stock warnings, and payables aging.

## Tech Stack
- **Framework**: Next.js 14+ (App Router), TypeScript (Strict Mode)
- **Database**: Prisma ORM with SQLite (Local Development) / PostgreSQL (Production)
- **Styling**: Tailwind CSS, Lucide Icons
- **Validation**: Zod
- **Testing**: Vitest (Unit & Integration tests)

## Getting Started
```bash
# 1. Install dependencies
npm install

# 2. Setup environment variables
cp .env.example .env

# 3. Run database migrations
npx prisma migrate dev --name init

# 4. Seed initial database records
npm run seed

# 5. Run tests
npm run test

# 6. Start the development server
npm run dev
```

Visit `http://localhost:3000` to access the application.

## Documentation
Comprehensive architectural documentation is available in the [`/docs`](./docs) directory:
- [PRD](./docs/PRODUCT_REQUIREMENTS.md)
- [Technical Requirements](./docs/TECHNICAL_REQUIREMENTS.md)
- [Architecture & Diagrams](./docs/ARCHITECTURE.md)
- [Application Flows](./docs/APP_FLOWS.md)
- [UI/UX Brief](./docs/UI_UX_BRIEF.md)
- [Database Schema](./docs/DATABASE_SCHEMA.md)
- [API Specification](./docs/API_SPEC.md)
- [Role & Permission Matrix](./docs/ROLE_PERMISSION_MATRIX.md)
- [Data Synchronization Rules](./docs/DATA_SYNC_RULES.md)
- [Test Plan](./docs/TEST_PLAN.md)
- [Implementation Plan & Phase Tracker](./docs/IMPLEMENTATION_PLAN.md)
- [Assumptions](./docs/ASSUMPTIONS.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)
