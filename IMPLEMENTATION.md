# Bothra CMS: Implementation Status

Last updated: 22 Oct 2026
Branch: `claude/project-thread-7co71b` (committed locally, **not pushed** to GitHub yet)

This file lists every phase of the redesign and feature work. It shows what is finished and what is still planned or incomplete.

## Summary

| Phase | What it covers | Status | Commit | Update file |
|---|---|---|---|---|
| 1 | New design and the admin Command Center (Day Book dashboard) | Done | `f97301d` | `bothra-redesign-phase1.bundle` |
| 2 | Vendor and contractor bank details, one-click WhatsApp, chat links, team management | Done | `353072e` | `bothra-redesign-phase2.bundle` |
| 3 | Task history with photos, task updates to admin, daily work reports, staff attendance | Done | `bb493be` | `bothra-redesign-phase3.bundle` |
| 4 | Budget vs actual, construction stages and progress, material requests | Done | `d81adfc` | `bothra-redesign-phase4.bundle` |
| 5 | Payroll, drawings register, quality and safety, equipment, sales | **Not started** | n/a | n/a |

Each bundle contains all earlier phases, so `bothra-redesign-phase4.bundle` is the only one you need.

### How to load the latest version

```bash
git fetch bothra-redesign-phase4.bundle claude/project-thread-7co71b:claude/redesign-phase4
git checkout claude/redesign-phase4
npm install
npx prisma db push      # required: phases 2 to 4 add new tables and columns
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

## Incomplete or still planned

### Phase 5 (not started)

| Feature | Notes |
|---|---|
| Payroll | Monthly salary and labour wages worked out from the attendance register, with advances and deductions and payslips. Attendance (Phase 3) is ready to feed this. |
| Drawings register | Drawing numbers, revisions (R0, R1 and so on), approval status, and which revision is current on site. |
| Quality and safety | Checklists for each stage (for example pre-pour slab checks), inspection photos, non-conformance reports, safety incidents and toolbox talks. |
| Equipment | Owned and hired machines, usage logs, fuel, maintenance and hire charges linked to the Equipment budget head. |
| Sales / CRM | Leads, site visits, unit booking, customer payment schedules and collections. |

### Known gaps in the finished phases

- **Nothing is pushed to GitHub yet.** All four phases are committed locally on `claude/project-thread-7co71b` and delivered as bundle files. A pull request still needs to be opened and merged when you are ready.
- **WhatsApp is click-to-chat only.** The buttons open WhatsApp with the number and a message filled in. Automatic WhatsApp messages (for example sending reminders without a click) would need the WhatsApp Business API and an account.
- **No mobile push notifications.** Alerts appear inside the app (the bell icon). There is no phone push or SMS.
- **Photos are stored on the server's disk** (`storage/uploads/private`). For a live deployment with more than one server, or on Vercel, they should move to cloud storage such as S3.
- **Check-in has no GPS or selfie check.** Attendance trusts the person checking in.
- **Material request lines typed as free text** must be matched to a catalogue material before they can be ordered.
- **Two older tests fail.** These failures existed before this work started and are not caused by it:
  - `phase3-e2e-workflows-and-roles` B-1, the login and session lifecycle test.
  - `phase4-release-gate` section 7, the measurement-book backup recovery test.

  The rest of the suite passes: 335 of 337 tests.

## Checks run on the latest version (Phase 4)

- Tests: 335 of 337 pass. The only failures are the 2 older tests listed above. This includes 10 new tests for Phase 4.
- Type check: clean.
- Lint: 9 warnings, the same as before the redesign.
- Production build: succeeds.
