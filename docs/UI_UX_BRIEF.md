# UI/UX Design Brief

## 1. Design Language & Visual System
Build Track Pro is a mission-critical construction and site operations ERP designed for high utility, readability in outdoor bright sunlight, and rapid high-frequency touch interactions.
- **Palette**:
  - Primary / Brand: Slate & Industrial Navy (`#0F172A`, `#1E293B`, `#3B82F6`)
  - Accent / Operational: Safety Amber / Construction Orange (`#F59E0B`, `#EA580C`)
  - Semantic Status:
    - Success / Active: Emerald Green (`#10B981`)
    - Warning / Low Stock / Pending: Amber (`#F59E0B`)
    - Error / Overdue / Blocked: Crimson Red (`#EF4444`)
    - Neutral / Secondary: Slate Gray (`#64748B`, `#94A3B8`)
  - Background: Crisp Light Slate (`#F8FAFC` to `#FFFFFF`) with clear dark borders (`#E2E8F0`).
- **Typography**: Clean sans-serif system font stack (`Inter`, system-ui, -apple-system, sans-serif) with high-legibility tabular numbers (`font-mono` / tabular-nums) for currency and quantities.
- **Form Controls & Touch Targets**:
  - Minimum touch target: 44px x 44px for field-facing mobile controls.
  - Generous padding and prominent buttons for glove/thumb friendly operations on site.

## 2. Layout & Responsive Architecture

### Desktop Layout (> 1024px)
- Fixed left navigation sidebar with collapsible sub-sections:
  - **Overview**: Dashboard
  - **Site Operations**: Projects, Tasks, Daily Site Reports
  - **Materials & Stock**: Materials Master, Stock Ledger, Stores, Receipts, Issues, Transfers
  - **Procurement & Finance**: Vendors & Contractors, Bills, Payments, Statements
  - **Workforce**: Team Members, Daily Attendance, Corrections
  - **System**: Audit Trail, Organization Settings
- Top header with current Organization and Site switcher, active user profile pill, quick search, and notification bell.
- Main content container featuring breadcrumbs, page actions (e.g. "+ Add Material", "+ Record Payment"), statistical summary metric cards, filter bars, and responsive data tables with pagination.

### Mobile Supervisor Layout (< 1024px)
- Collapsible hamburger drawer navigation with fast access to all modules.
- Bottom Quick-Action Dock (persistent):
  1. **Dashboard** (Home)
  2. **Tasks** (Site progress)
  3. **Materials** (Stock & receipts)
  4. **Attendance** (Crew check-in)
  5. **Quick Add (+)** (Modal launcher for Log Receipt, Issue Stock, Check In Worker, Add Task)
- Card-based layouts replacing wide horizontal data tables on small screens. Priority data points (e.g. Material Name, Current Stock, Status) visible immediately without scrolling.

## 3. Interaction States & Reliability Patterns
- **Loading States**: Skeleton screens matching target component shapes (never a blank white screen or jumping layouts).
- **Empty States**: Helpful SVG illustrations with explicit calls to action (e.g., "No stock movements recorded yet. Receive items into this store to begin.").
- **Destructive & High-Impact Actions**: Modal confirmation dialogs explicitly displaying the affected entity (e.g., "Are you sure you want to reverse payment #PAY-0042 of ₹4,000 to Asian Paints? This will restore the bill balance to ₹10,000.").
- **Form Submissions**:
  - Submit buttons automatically disable during in-flight network requests.
  - In-flight spinners prevent double-click submissions.
  - Client-side pre-validation with Zod schemas plus server-side error mapping.
  - Toast notifications confirming created, updated, or reversed transactions.
- **Accessibility**:
  - Focus rings for keyboard users (`focus-visible:ring-2`).
  - High color contrast ratio (minimum 4.5:1 for body copy).
  - Explicit `aria-label` tags on icon buttons.
