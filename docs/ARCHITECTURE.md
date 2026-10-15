# Architecture & Module Boundaries

## 1. System Context & Layered Model

```mermaid
graph TD
    Client["Client Devices (Mobile Browser / Supervisor Phone / Desktop Office)"]
    
    subgraph Edge_and_Network["Presentation & Routing"]
        MW["Middleware (Auth, Session & Scope Guard)"]
        NextUI["Next.js App Router (Server Components & Client Shell)"]
        APIRoutes["REST API Route Handlers (/api/*)"]
    end
    
    subgraph Application_Layer["Core Domain Services"]
        AuthSvc["Auth & RBAC Service"]
        ProjectSvc["Project & Task Service"]
        InventorySvc["Authoritative Stock Ledger Service"]
        FinanceSvc["Billing, Payment & Allocation Service"]
        AttendanceSvc["Workforce & Attendance Service"]
        AuditSvc["Audit & Notification Service"]
    end
    
    subgraph Persistence_Layer["Data & Storage"]
        PrismaORM["Prisma ORM (Schema & Query Engine)"]
        DB[("Relational Database (SQLite Local / PostgreSQL Cloud)")]
    end

    Client -->|HTTPS / Secure Cookies| MW
    MW --> NextUI
    MW --> APIRoutes
    NextUI --> Application_Layer
    APIRoutes --> Application_Layer
    Application_Layer --> PrismaORM
    PrismaORM --> DB
```

## 2. Module Boundaries & Interaction Matrix

```mermaid
graph LR
    subgraph Tenancy_Module["Tenancy & Auth"]
        Org["Organizations"]
        Site["Sites"]
        User["Users & Roles"]
    end

    subgraph Operations_Module["Site Operations"]
        Project["Projects"]
        Task["Tasks"]
        DSR["Daily Site Reports"]
    end

    subgraph Inventory_Module["Stock & Materials"]
        Material["Materials Master"]
        Store["Site Stores"]
        Ledger["Stock Movements (Ledger)"]
    end

    subgraph Finance_Module["Parties & Finance"]
        Party["Vendors & Contractors"]
        Bill["Bills & Lines"]
        Payment["Payments & Allocations"]
    end

    subgraph Workforce_Module["Attendance"]
        Worker["Workforce Members"]
        Attendance["Attendance Sessions & Events"]
    end

    Org --> Site
    Org --> User
    Site --> Project
    Site --> Store
    Project --> Task
    Project --> DSR
    Store --> Ledger
    Material --> Ledger
    Project --> Ledger
    Party --> Bill
    Bill --> Payment
    Party --> Ledger
    Site --> Attendance
    Worker --> Attendance
```

## 3. Data Flow Rules & Module Isolation
1. **Tenancy Guard**: No query executes without `organization_id` scoping. When a user has site-level scoping (e.g. Site Supervisor), queries additionally filter by `site_id` or assigned `project_id`.
2. **Double-Entry Stock Ledger**:
   - Creating a `GoodsReceipt` triggers an atomic transaction that inserts a `StockMovement` (+ delta) and a `StockBalance` upsert.
   - Issuing materials for a task inserts a `StockMovement` (- delta) linked to `project_id` and `task_id`.
   - Transferring between Site A and Site B executes two coordinated movements (-delta for Store A, +delta for Store B) inside a single database transaction.
3. **Financial Reconciliation**:
   - Bills record total liabilities.
   - Payments record outgoing cash/bank transfers with an idempotency key.
   - Allocations link payment to bills, decrementing the bill's pending balance.
   - Total vendor balance is dynamically calculated: `SUM(Bills.total_amount) - SUM(Allocations.amount)`.
4. **Attendance State Machine**:
   - A worker can only have one active `OPEN` session per calendar day per site.
   - Check-in creates the record with a timestamp and optional coordinate snapshot.
   - Check-out updates the checkout timestamp and marks the session `CLOSED`.
   - Supervisor corrections record an audit entry detailing previous and corrected values.
