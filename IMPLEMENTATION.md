# Bothra CMS: Implementation Status

Last updated: 22 Oct 2026 (after Phase 5)
Branch: `claude/project-thread-7co71b` (committed locally, **not pushed** to GitHub yet)

This file lists every phase of the redesign and feature work. It shows what is finished and what is still planned or incomplete.

## Summary

| Phase | What it covers | Status | Commit | Update file |
|---|---|---|---|---|
| 1 | New design and the admin Command Center (Day Book dashboard) | Done | `f97301d` | `bothra-redesign-phase1.bundle` |
| 2 | Vendor and contractor bank details, one-click WhatsApp, chat links, team management | Done | `353072e` | `bothra-redesign-phase2.bundle` |
| 3 | Task history with photos, task updates to admin, daily work reports, staff attendance | Done | `bb493be` | `bothra-redesign-phase3.bundle` |
| 4 | Budget vs actual, construction stages and progress, material requests | Done | `d81adfc` | `bothra-redesign-phase4.bundle` |
| 5 | Payroll, drawings register, quality and safety, equipment, sales | Done | see `git log` | `bothra-redesign-phase5.bundle` |

**All five planned phases are done.** Each bundle contains all earlier phases, so `bothra-redesign-phase5.bundle` is the only one you need.

### How to load the latest version

```bash
git fetch bothra-redesign-phase5.bundle claude/project-thread-7co71b:claude/redesign-phase5
git checkout claude/redesign-phase5
npm install
npx prisma db push      # required: phases 2 to 5 add new tables and columns
npm run dev
```

---

## Phase 1: New design and Command Center (done)

**Design**
- New look across the app:
  - Soft borders and layered shadows.
  - Inter and Plus Jakarta Sans fonts, with Noto Sans Devanagari for Hindi.
- Smooth page and card animations, loading shimmers and count-up numbers. Reduced-motion settings are respected.
- Restyled shared components: Button, Card, PageHeader, Badge, Alert and EmptyState.
- New app shell:
  - The menu is grouped into Overview, Site work, Money, People and Admin.
  - The top bar shows the date, a clock, the active site, quick actions, chat and alerts.
  - Refreshed mobile header, drawer and bottom dock.
  - New login screen.

**Admin Command Center** (on the dashboard, for Super Admin and Org Admin)
- The day's Day Book as one timeline.
- Cash paid and bills booked today.
- People on site.
- Approvals waiting.
- Outstanding payables.
- 7-day cash trend.
- Who did what, plus the audit feed.
- API: `GET /api/dashboard/command-center`.

## Phase 2: Vendors, contractors, WhatsApp and team (done)

**Vendors and contractors**
- New fields:
  - Contact person, WhatsApp number, city, category, rating and PAN.
  - Bank details: account holder, account number, IFSC, bank, branch and UPI ID, all validated.
- Bank account numbers are masked everywhere. The full number is shown only to finance staff, and every view is written to the audit log.
- Rebuilt Vendors & Contractors page:
  - Card and table views, stats and filters (type, category, city, amount due, missing bank details).
  - A bank-details popup with copy buttons.
  - WhatsApp, call and email buttons.

**People and chat**
- One-click WhatsApp, call, email and in-app chat buttons on Workforce, the chat directory and chat headers.
- Staff records now have a phone number and job title.
- `/chat?with=<user>` opens a chat directly with that person.

**Team & Access page**
- Add staff with a one-time password, change roles, deactivate or reactivate staff, and reset passwords.
- Safety rules:
  - Org Admins cannot create or edit Super Admins.
  - Nobody can demote or deactivate themselves.
  - The last active admin is protected.
  - Every change is audited.

## Phase 3: Task history, daily work and attendance (done)

**Task history (like GitHub commits)**
- Every status change, edit (with before and after values), comment, progress note and photo is shown as a timeline entry with a short id.
- Staff post a note, photos and an optional status change in one step.
- Every task update notifies all admins, plus the task's creator and assignee.

**Daily Work page** (`/work-reports`)
- Staff check in and check out.
- Staff file a daily report that is pre-filled from their own task activity, and can see their whole month.
- Admins and HR see:
  - Every report for a day.
  - Who has not filed yet, with WhatsApp and chat nudge buttons.
  - A monthly attendance register with leave marking and CSV export.
- Admins review a report or ask for more detail. Reviewed reports are locked.

**Dashboard**
- A live task-updates feed with photos.
- A staff work reports card.

## Phase 4: Budgets, site progress and material requests (done)

**Budget vs Actual** (project page, new tab)
- Budget per cost head: Material, Labour, Contractors, Equipment, Design, Approvals, Overheads and Other.
- For each head it shows:
  - Spent: posted bills, plus payments not linked to a bill.
  - Committed: approved purchase orders, plus approved RA work that is not billed yet.
  - Forecast, variance and a health flag (OK, Watch, Over budget).
- A spend-per-month chart and a list of the biggest payees.
- Bills and payments can be tagged to a cost head. If they are not tagged, the head is worked out automatically.

**Progress & Stages** (project page, new default tab)
- One click adds 12 standard building stages, from excavation to handover, spread over the project dates.
- Supervisors post progress % with photos and a note, or put a stage on hold.
- The tab shows:
  - Overall progress against where the plan says you should be today.
  - Late and at-risk stages, and the stage being worked on now.
  - A Gantt-style schedule.
- Admins and the project manager are notified on every update.

**Material Requests** (`/material-requests`)
- Site raises a request, either urgent or normal, and sees the stock already at site.
- The project manager approves it, can cut quantities, or rejects it with a reason.
- Each approved line becomes a purchase order in one click. The site is told when it is ordered.

**Dashboard**
- A Project health card showing work done against budget used, late stages and waiting material requests.

**Also in Phase 4**
- Staff without finance access no longer see money figures on the project page.

---

## Phase 5: Payroll, drawings, quality and safety, equipment, sales (done)

**Payroll** (`/payroll`)
- Monthly payroll worked out from attendance in one click:
  - Site workers get their daily wage for each day present and half for a half day. Overtime after 8 hours is paid at the hourly rate (daily wage ÷ 8).
  - Staff get their monthly salary pro rata. Leave marked by HR is paid. A working day (Monday to Saturday) with no check-in is unpaid.
  - Each worker's wages are booked to the project where they worked most days.
- Advances: record an advance for anyone. It is taken back automatically from the next payroll.
- Bonus, extra deductions and a note can be added per person while the payroll is a draft.
- Steps: worked out → approved by an admin (locked after this) → marked paid.
- Marking it paid creates one posted payment per person in Finance. Wages go under the Labour budget head and show in the Day Book.
- Printable payslips. Staff can open their own payslip.
- Staff salaries tab to set each staff member's monthly salary.

**Drawings register** (`/drawings`)
- Every drawing number with all its revisions (R0, R1, R2 and so on). Each revision has its PDF or image and a note on what changed.
- An admin or the project manager approves a revision, issues it as "Good for construction", or sends it back with a reason.
- Issuing a revision marks the older ones superseded. The project team gets an alert so nobody builds from an old print.
- Shows which revision is on site, what is waiting for approval, and drawings never issued.

**Quality & Safety** (`/quality`)
- Five built-in checklists: pre-concreting (slab or beam), brickwork, plaster, waterproofing and a weekly site safety walk. Each point is marked OK, Not OK or N/A, with photos.
- Each failed point opens a defect (NCR) for the project manager, due in 3 days.
- Report safety incidents (with the number of people injured), near misses, unsafe acts and observations, with photos. Safety reports alert all admins straight away.
- Flow: fixed (with "after" photos) → a manager accepts and closes it, or reopens it.
- Shows days since the last safety incident, open issues, overdue fixes and the checklist pass rate.

**Equipment** (`/equipment`)
- Owned and hired machines, with the hire company, the hire rate (per hour, day or month) and which project each machine is on.
- Daily log: hours run (hire is added automatically), fuel, service or repair costs, breakdowns and moves between sites.
- A breakdown marks the machine under repair and alerts the office.
- Service-due warning, a WhatsApp button for the hire company, and running cost this month.

**Sales** (`/sales`)
- Enquiries pipeline: New → Contacted → Site visit → Negotiation → Booked / Lost, with follow-up dates and a call, visit and WhatsApp history. The same phone number cannot be entered twice.
- Unit inventory per project (flats, shops, plots), added in ranges such as A-301 to A-308. Each unit shows as available, on hold, booked or fully paid.
- Booking a unit creates the customer's payment schedule:
  - "Construction linked": booking, agreement, foundation, plinth, slabs, brickwork, plaster and possession.
  - "Down payment": 10%, then 80%, then 10%.
- Stage-linked instalments get a due date when the office clicks "Raise demand".
- Accounts record receipts (NEFT, UPI, cheque, home loan). Overdue amounts show per customer, with a ready-made WhatsApp reminder.

**Also in Phase 5**
- The dashboard Project health card shows chips for open safety issues, drawings to approve, machines under repair, payroll to approve and money overdue from customers.
- New permissions:
  - Payroll: admins and accountants can run it; HR and auditors can view it.
  - Sales: admins and project managers can manage it; accountants and auditors can view it.
  - Site supervisors see neither.
- Fixed the Workforce page so daily wages are entered and shown in rupees. They were saved inconsistently before.

---

## Incomplete or still planned

All five planned phases are built. The items below are not built yet, or work only partly.

### Gaps in Phase 5 features

- **Payroll:**
  - No statutory deductions (PF, ESI, professional tax or TDS).
  - Overtime is paid at 1× the hourly rate.
  - No bank upload file for bulk salary transfer.
- **Sales:**
  - Customer receipts are recorded on the booking but not posted to Finance or the Day Book as income.
  - No GST on sales and no printable receipt or demand letter.
  - "Raise demand" is a manual click. It is not triggered automatically when a construction stage reaches 100%.
- **Equipment:** hire and fuel costs logged here are not added to the project budget automatically. Hire bills should still be entered in Finance under the Equipment cost head.
- **Quality:** the five checklists are fixed. There is no screen yet to make your own checklist.
- **Drawings:** no markup or side-by-side comparison of revisions. Files are limited to PDF or images up to 10 MB.

### Ideas for a Phase 6 (not started)

| Feature | Notes |
|---|---|
| Customer portal | Buyers log in to see their payment schedule, receipts and construction photos. |
| Tally / GST export | Export bills, payments and sales receipts for the accountant. |
| Offline mobile app | Supervisors on site with weak signal can fill in reports and photos offline, and they sync later. |
| Automatic stage demands | When a stage hits 100% on the Progress tab, raise the matching customer demands and WhatsApp the buyers. |

### General gaps

- **Nothing is pushed to GitHub yet.** All five phases are committed locally on `claude/project-thread-7co71b` and delivered as bundle files. A pull request still needs to be opened and merged when you are ready.
- **WhatsApp is click-to-chat only.** The buttons open WhatsApp with the number and a message filled in. Automatic WhatsApp messages (for example sending reminders without a click) would need the WhatsApp Business API and an account.
- **No mobile push notifications.** Alerts appear inside the app (the bell icon). There is no phone push or SMS.
- **Photos and drawings are stored on the server's disk** (`storage/uploads/private`), with a backup copy in the database. For heavy use they should move to cloud storage such as S3, so the database stays small.
- **Check-in has no GPS or selfie check.** Attendance trusts the person checking in.
- **Material request lines typed as free text** must be matched to a catalogue material before they can be ordered.
- **Two older tests fail.** These failures existed before this work started and are not caused by it:
  - `phase3-e2e-workflows-and-roles` B-1, the login and session lifecycle test.
  - `phase4-release-gate` section 7, the measurement-book backup recovery test.

  The rest of the suite passes: 343 of 345 tests.

## Checks run on the latest version (Phase 5)

- Tests: 343 of 345 pass. The only failures are the 2 older tests listed above. This includes 8 new tests for Phase 5 and 10 for Phase 4.
- Type check: clean.
- Lint: 9 warnings, the same as before the redesign.
- Production build: succeeds.
