# Product Requirements Document (PRD)

## Product Name
**Build Track Pro** — Construction Project & Site Operations Management Platform

## 1. Problem Statement
Construction project managers, site supervisors, storekeepers, and finance controllers frequently operate across fragmented communication channels (spreadsheets, paper logs, WhatsApp). This leads to:
- Disconnected material receipts vs. store inventory, causing unaccounted shrinkage, stockouts, and duplicate billing.
- Inaccurate contractor and vendor balances, leading to overpayment or dispute.
- Lack of visibility into daily on-site workforce attendance and work progress.
- Unreliable reporting without single-source-of-truth reconciliation.

## 2. Product Objectives
- Provide a unified, desktop- and mobile-first platform tailored for both back-office administrators and on-site supervisors.
- Implement an **authoritative stock ledger** where inventory on hand is strictly derived from verified movements (receipts, issues, transfers, adjustments).
- Provide **transactionally consistent financial ledgers** for vendors and contractors, tracking bills, credit notes, payments, and remaining payables.
- Enable **site attendance capture** with sequence validation (check-in before check-out) and audit-controlled corrections.
- Ensure strict multi-organization and multi-site tenant isolation and role-based permissions.

## 3. User Personas
1. **Super Admin / Organization Admin**: Manages company profile, creates sites, registers projects, invites users, assigns permissions, configures currencies (default INR ₹) and units.
2. **Project Manager (PM)**: Oversees project schedules, tasks, budgets, milestones, reviews daily site reports, monitors financial payables and material consumption.
3. **Site Supervisor**: Works primarily on mobile/tablet at the job site; creates tasks, logs daily progress, reports blockers/safety incidents, checks in workers, and confirms site receipts.
4. **Storekeeper**: Manages site warehouse/store; executes goods receipts against vendor deliveries, issues materials to tasks/contractors, initiates site-to-site transfers, and conducts stock counts.
5. **Accountant / Finance Officer**: Enters vendor bills, issues contractor payments, applies payments to bills, audits statements, and exports financial summaries.
6. **HR / Attendance Officer**: Manages workforce directory, monitors daily check-ins/outs, audits shift hours, and processes attendance corrections.
7. **Read-Only Auditor**: Inspects audit logs, reports, and ledger statements across sites without modification rights.

## 4. Key Epics & Modules

### Epic A: Authentication, Tenancy & Permissions
- Secure email/password login with hashed credentials and secure HTTP-only sessions.
- Multi-organization and multi-site architecture. Every user action is strictly scoped to authorized sites/projects.
- Permission-based authorization model supporting default roles plus granular permission checks.

### Epic B: Projects & Daily Site Logs
- Project master with budget, timeline, location, status, and assigned manager.
- Daily Site Reports (DSR): Progress narrative, work completed, blockers, weather/safety conditions.
- Direct links between projects, tasks, material consumption, and project costs.

### Epic C: Tasks & Operational Work Tracking
- Task creation with priority, due date, assigned site, and assignee.
- Status workflow: `TODO` -> `IN_PROGRESS` -> `BLOCKED` -> `COMPLETED`.
- Supervisor quick-entry for updating progress and recording blockers on site.
- Comprehensive task status change audit history.

### Epic D: Materials Master & Stock Ledger
- Catalog of construction materials with SKU, category, measurement unit (bag, kg, tonne, litre, meter, piece, box), and minimum reorder threshold.
- Inventory tracked per site/store.
- Authoritative ledger with immutable movements: Opening, Receipt, Issue/Consumption, Transfer In/Out, Adjustment (+/-).
- Prevention of negative stock balances under standard operating rules.
- Material detail view displaying live stock, total received, total issued, valuation, and chronological ledger with running balance.

### Epic E: Vendors, Contractors & Billing
- Directory of vendors (material suppliers) and contractors (labour/services).
- Bill recording with bill numbers, due dates, line items, and taxes.
- Payment recording with method (cash, bank transfer, UPI, cheque), reference number, idempotency protection, and payment allocation to specific bills.
- Real-time calculation of pending balances: `Total Bills - Credit Notes - Payments Applied = Outstanding Payable`.
- Party ledger statement showing chronological debits, credits, and balance.

### Epic F: Workforce & Attendance
- Workforce registry (carpenters, masons, electricians, helpers, foremen) with employee codes and trade categorization.
- Shift attendance recording: check-in and check-out events with timestamps and optional event-based GPS coordinates.
- State machine enforcement: prevents checkout without checkin, prevents duplicate open check-ins.
- Attendance correction flow with audit reasons and supervisor approvals.

### Epic G: Dashboards, Analytics & Audit
- Real database-backed KPIs: Active Projects, Overdue Tasks, Daily Workers Present, Low Stock Alerts, Total Payments Made Today, Total Outstanding Payables.
- Audit trail for financial entries, stock adjustments, attendance corrections, and user role updates.
- CSV and structured report exports.
