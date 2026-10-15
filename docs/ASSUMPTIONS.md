# Architectural Assumptions & Operating Defaults

## 1. Domain & Business Defaults
1. **Product Name**: Build Track Pro.
2. **Default Currency**: Indian Rupee (`INR` / `₹`). Amounts are stored in integer minor units (paise: 100 paise = ₹1.00) to ensure zero floating-point arithmetic errors. Formatting functions convert paise to formatted rupees (`Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`).
3. **Default Timezone**: All database dates and timestamps are stored in UTC (`DateTime`). Display dates default to `Asia/Kolkata` (IST, UTC+5:30), configurable per Organization or Site.
4. **Units of Measurement**: Standardized units (`BAG`, `KG`, `TONNE`, `LITRE`, `METER`, `PIECE`, `BOX`). Direct conversion between dissimilar units without an adjustment record is disallowed.
5. **Inventory Scoping**: Inventory is strictly scoped per Site Store, not globally across the entire enterprise. A material exists in the catalog once, but balances are maintained per site/store.
6. **No Negative Stock**: Material issues and transfers reject transactions if requested quantity exceeds current available stock in that store. Stock adjustments can adjust balance up or down, but require an explicit supervisor/admin reason and log an audit event.
7. **Idempotency**: All payment submissions require a unique `Idempotency-Key` (UUID) to prevent accidental double-billing or double-payment upon slow connections or multiple user clicks.

## 2. Infrastructure & Environment Defaults
1. **Local Development Database**: SQLite operated via Prisma ORM (`prisma/schema.prisma` with `provider = "sqlite"`). This provides 100% zero-dependency local execution, full ACID transactions (`$transaction`), and declarative schema migrations.
2. **Production Database**: PostgreSQL on Supabase, AWS RDS, or GCP Cloud SQL. The schema is fully Postgres-compatible; switching requires only changing `provider = "postgresql"` in `prisma/schema.prisma` and updating `DATABASE_URL`.
3. **Session Management**: Secure, signed session cookies containing minimal user identity (`userId`, `orgId`, `role`) with HTTP-only, SameSite=Lax flags.
4. **Geolocation**: Location capture at check-in/out is optional, device-permission gated, and event-based (single snapshot at check-in/out). The application never performs continuous background location tracking.
5. **No Production Mock Data**: Real database queries back all statistics, charts, tables, and KPIs. Seed data is strictly segregated into `prisma/seed.ts` for clean environment initialization and testing.
