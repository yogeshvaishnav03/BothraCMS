# Application Flows & User Journeys

## 1. Material Goods Receipt Flow (Storekeeper)

```mermaid
sequenceDiagram
    autonumber
    actor Storekeeper as Site Storekeeper
    participant UI as Build Track Pro UI
    participant API as Inventory API (/api/inventory/receipts)
    participant Svc as Stock Ledger Service
    participant DB as Relational Database

    Storekeeper->>UI: Selects Vendor, Store, Items, Quantities, Unit Rates, Delivery Challan #
    UI->>API: POST /api/inventory/receipts (payload + Idempotency-Key)
    API->>Svc: Validate tenant, store, vendor & unit matching
    Svc->>DB: BEGIN TRANSACTION
    Svc->>DB: Create GoodsReceipt Record
    loop For each receipt line
        Svc->>DB: Insert StockMovement (+Quantity, Unit, Rate, Ref, Store, Material)
        Svc->>DB: Update/Upsert StockBalance (+Quantity)
    end
    Svc->>DB: Create AuditLog Entry
    Svc->>DB: COMMIT TRANSACTION
    DB-->>API: Receipt Confirmed & Ledger Updated
    API-->>UI: 201 Created (Receipt JSON + Updated Balances)
    UI-->>Storekeeper: Success Notification & Updated Stock Display
```

## 2. Material Issue & Task Consumption Flow

```mermaid
sequenceDiagram
    autonumber
    actor Supervisor as Site Supervisor
    participant UI as Mobile/Desktop UI
    participant API as Issue API (/api/inventory/issues)
    participant Svc as Stock Ledger Service
    participant DB as Relational Database

    Supervisor->>UI: Selects Material, Store, Quantity, Project & Task
    UI->>API: POST /api/inventory/issues
    API->>Svc: Check available stock on hand
    alt Stock on Hand < Requested Quantity
        Svc-->>API: Error: Insufficient Stock (Cannot go negative)
        API-->>UI: 400 Bad Request with current stock level
        UI-->>Supervisor: Show Warning: "Only 4.5 bags available in Site Store"
    else Stock on Hand >= Requested Quantity
        Svc->>DB: BEGIN TRANSACTION
        Svc->>DB: Insert StockMovement (-Quantity, MovementType: ISSUE, Project, Task)
        Svc->>DB: Update StockBalance (-Quantity)
        Svc->>DB: Create AuditLog Entry
        Svc->>DB: COMMIT TRANSACTION
        DB-->>API: Success
        API-->>UI: 200 OK
        UI-->>Supervisor: Inventory issued & Project consumption logged
    end
```

## 3. Vendor Bill, Payment & Reconciliation Flow

```mermaid
sequenceDiagram
    autonumber
    actor Finance as Accountant / Finance
    participant UI as Finance Portal
    participant API as Payments API (/api/finance/payments)
    participant Svc as Finance Service
    participant DB as Relational Database

    Note over Finance,DB: 1. Bill Posted: Asian Paints - Bill #AP-901 for ₹10,000 (Outstanding: ₹10,000)
    Finance->>UI: Create Payment: ₹4,000 via Bank Transfer to Asian Paints (Allocated to Bill #AP-901)
    UI->>API: POST /api/finance/payments (Idempotency Key: pay-uuid-123)
    API->>Svc: Validate Party, Payment Method & Idempotency Key
    Svc->>DB: BEGIN TRANSACTION
    Svc->>DB: Insert Payment Record (Status: POSTED, Amount: 4000, Currency: INR)
    Svc->>DB: Insert PaymentAllocation (Payment ID, Bill ID #AP-901, Amount: 4000)
    Svc->>DB: Recalculate Bill #AP-901 (Paid: 4000, Outstanding: 6000)
    Svc->>DB: Log Audit Event & Idempotency Cache
    Svc->>DB: COMMIT TRANSACTION
    DB-->>API: Payment Posted
    API-->>UI: 201 Created (Bill Outstanding = ₹6,000)
    UI-->>Finance: Instant Reconciliation Verified across Vendor Ledger & Financial Reports
```

## 4. Workforce Attendance & Correction Flow

```mermaid
stateDiagram-v2
    [*] --> ABSENT: Day Starts
    ABSENT --> CHECKED_IN: Check-In Event (Timestamp + GPS snapshot)
    CHECKED_IN --> CHECKED_OUT: Check-Out Event (Timestamp + GPS snapshot)
    CHECKED_IN --> CORRECTION_REQUIRED: Missed Checkout / Overstay
    CHECKED_OUT --> CORRECTION_REQUESTED: Supervisor submits time correction
    CORRECTION_REQUIRED --> CORRECTION_REQUESTED: Supervisor provides justification
    CORRECTION_REQUESTED --> CHECKED_OUT: Admin approves with audit log
    CHECKED_OUT --> [*]: Shift Closed & Verified
```

## 5. Supervisor Quick-Action Daily Flow

```mermaid
flowchart TD
    Login["Supervisor logs in via Mobile"] --> Dashboard["Supervisor Dashboard"]
    Dashboard --> QuickActions{"Select Quick Action"}
    QuickActions -->|1. Check-In Team| AttScreen["Scan / Tap Worker Check-In"]
    QuickActions -->|2. Log Material Receipt| MatScreen["Verify Challan & Enter Qty"]
    QuickActions -->|3. Issue to Task| TaskIssue["Issue Cement/Steel to Foundation Task"]
    QuickActions -->|4. Update Tasks| TaskProgress["Mark Concrete Pouring 100% DONE"]
    QuickActions -->|5. Daily Site Report| DSR["Submit Weather, Progress, Blocker notes"]
    DSR --> Complete["End of Day Site Log Complete"]
```
