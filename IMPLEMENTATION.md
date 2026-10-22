# Bothra CMS: Implementation Status

Last updated: 23 Oct 2026 (after Phase 7)
Branch: `claude/project-thread-7co71b` (committed locally, **not pushed** to GitHub yet)

This file lists every phase of the redesign and feature work. It shows what is finished and what is still planned or incomplete.

## Summary

| Phase | What it covers | Status | Commit | Update file |
|---|---|---|---|---|
| 1 | New design and the admin Command Center (Day Book dashboard) | Done | `f97301d` | `bothra-redesign-phase1.bundle` |
| 2 | Vendor and contractor bank details, one-click WhatsApp, chat links, team management | Done | `353072e` | `bothra-redesign-phase2.bundle` |
| 3 | Task history with photos, task updates to admin, daily work reports, staff attendance | Done | `bb493be` | `bothra-redesign-phase3.bundle` |
| 4 | Budget vs actual, construction stages and progress, material requests | Done | `d81adfc` | `bothra-redesign-phase4.bundle` |
| 5 | Payroll, drawings register, quality and safety, equipment, sales | Done | `0cc23cf` | `bothra-redesign-phase5.bundle` |
| 6 | Buyer portal, automatic stage demands, GST receipts, Tally / GST export, PF / ESI / PT in payroll | Done | `224a2e5` | `bothra-redesign-phase6.bundle` |
| 7 | GST on supplier bills, PF / ESI for site workers with PF ECR and ESI files, cancelling a receipt, offline site app | Done | see `git log` | `bothra-redesign-phase7.bundle` |

**Seven phases are done.** Each bundle contains all earlier phases, so `bothra-redesign-phase7.bundle` is the only one you need.

### How to load the latest version

```bash
git fetch bothra-redesign-phase7.bundle claude/project-thread-7co71b:claude/redesign-phase7
git checkout claude/redesign-phase7
npm install
npx prisma db push      # required: phases 2 to 7 add new tables and columns
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

## Phase 6: Buyer side, accounts export and statutory payroll (done)

**Automatic customer demands**
- Each construction-linked instalment is tied to a project stage by its name: foundation, plinth, slab, brickwork, plaster and possession. The office can pick a different stage for any instalment on the booking.
- When a stage reaches 100% on the Progress tab, the matching demands for every buyer in that project are raised automatically, due in 15 days. Admins and the person who made the booking get an alert.
- A buyer who books late owes the stages already finished. Those demands are raised at booking.
- Sales shows a "demands raised and not yet paid" list with a printable demand letter and a WhatsApp button for each buyer. The message includes the buyer's page link.

**GST and receipts**
- Each booking has a GST rate: 5% for flats, 12% for shops and offices and 0% for plots by default, and it can be changed.
- Each instalment shows its price plus GST.
- Every amount received gets a numbered receipt (RC-YYMM-NNN), split between price and GST.
- Printable receipt with CGST and SGST, the amount in words and the company GSTIN from Settings.
- Printable demand letter that adds any earlier instalments still unpaid.

**Money in**
- Customer receipts show on the Day Book as "Money in from customers".
- On the dashboard they appear on the timeline, the cash card and a third "Received" bar in the 7-day cash chart.
- Accountants now see every booking, so they can record receipts for any project.

**Buyer portal** (a private link per booking, no login)
- The buyer sees their payment schedule, what is due now, their receipts (printable), construction progress by stage and the latest site photos from their own project.
- The link can be sent on WhatsApp, and reset if it is shared by mistake. Cancelling a booking turns the link off.
- Photos are only served if they belong to that buyer's project. The link is long and random, and photo requests are rate limited.

**Accounts export** (`/exports`, for finance staff)
- Quick ranges for this month, last month, this quarter and this financial year, with totals for the range.
- One Tally import file (XML) with the ledgers it needs and these vouchers:
  - Supplier bills as Purchase vouchers.
  - Payments (including wages and salaries) as Payment vouchers.
  - Each customer receipt as a Sales invoice with CGST and SGST, plus a Receipt.
- CSV registers: GST sales register (for GSTR-1 and 3B), purchase register with supplier GSTIN (for GSTR-2B matching) and a payments list for the bank reconciliation.
- Every export is written to the audit log.

**Payroll deductions**
- For each staff member: PF and ESI switches, plus UAN and ESIC numbers.
- PF is 12% of basic up to the ₹15,000 wage ceiling. The company's 12% is shown too.
- ESI is 0.75% (company 3.25%) while the salary is ₹21,000 or less.
- Professional tax by state: Maharashtra (with ₹300 in February), Karnataka, Gujarat, West Bengal, Telangana and Andhra Pradesh, or none (Rajasthan has none).
- TDS is typed in per person and kept when the draft is refreshed.
- Payroll shows what to deposit this month (PF, ESI, PT, TDS). Payslips list each deduction and the company's share.
- Bank transfer file (CSV) for bulk salary upload once payroll is approved. People with no bank details are listed last, to pay by cash or cheque.

---

## Phase 7: GST on purchases, statutory filings, receipt cancellation and the offline site app (done)

**GST on supplier bills**
- The bill form has a GST rate (0, 5, 12, 18 or 28%) added on top of the lines, and shows the taxable value, the tax and the total.
- Tax type is worked out from the GSTINs: a supplier in another state (different first two digits from the company GSTIN in Settings) is IGST, otherwise CGST plus SGST. It can be set by hand.
- An "input tax credit" tick for each bill. Untick it for blocked credit, such as furniture or food.
- Bills with no GST work as before.

**GST in the accounts export**
- Tally purchase vouchers now debit the expense with the taxable value and "Input CGST", "Input SGST" or "Input IGST" (under Duties & Taxes) with the tax, and credit the supplier with the total. When credit is not claimed the tax stays in the expense.
- The purchase register has taxable value, rate, CGST, SGST, IGST and ITC columns, with totals, ready to match against GSTR-2B.

**PF and ESI for site workers**
- Payroll → Staff salaries now has a site-workers table: PF and ESI ticks, UAN, ESIC number, bank account and IFSC for each worker. Account numbers are shown masked.
- PF is 12% of wages up to ₹15,000 a month. ESI is 0.75% (company 3.25%) while 26 days' wages are ₹21,000 or less. Professional tax is not cut from daily wages.
- The bank transfer file now includes site workers' bank details.

**Statutory files** (after payroll is approved)
- PF ECR file in the EPFO text format (`#~#` between fields): UAN, name, gross, EPF/EPS/EDLI wages, employee 12%, EPS 8.33%, the difference, non-contributory days and refund. Amounts are in whole rupees.
- ESI monthly contribution file (CSV) for the ESIC portal: IP number, name, days paid and wages.
- People ticked for PF or ESI who have no UAN or ESIC number are left out of the file, and Payroll names them so they can be added before filing.

**Cancelling a receipt** (admins only)
- For a bounced cheque or a receipt entered by mistake. A reason is required.
- The amount goes back on the instalment, and a sold unit goes back to booked.
- The receipt stays on record with a "Cancelled" stamp and is struck through on the booking. Its number is not reused.
- Cancelled receipts are left out of money in, the Day Book, the dashboard, the GST sales register, Tally and the buyer's page.

**Offline site app**
- The app can be installed on a phone's home screen (Add to Home screen) with its own icon.
- Pages already opened, such as a project's stages and the daily report, open with no signal. The latest data seen is shown.
- With no signal, a stage progress update or a daily report is saved on the phone, with its photos. A bar at the top shows "No signal" and how many are waiting.
- They are sent by themselves when the signal comes back, photos first. "Send now" retries by hand. If the server refuses one (for example the stage was deleted), it is marked so it can be read and discarded.
- A page never opened before shows a "No signal" page instead of an error.
- Logging out clears the pages kept on the phone. If anything is still waiting to be sent, it asks first, because saved updates are sent as whoever is logged in.

**Why buyers do not get IGST**
- GST on an under-construction flat is charged where the property is, not where the buyer lives. So a buyer from another state is still charged CGST plus SGST. IGST for buyers was left out on purpose.

---

## Incomplete or still planned

All seven phases are built. The items below are not built yet, or work only partly.

### Gaps in Phase 5, 6 and 7 features

- **Payroll:**
  - The PF ECR and ESI files are made for upload; filing and paying the challan are still done on the EPFO and ESIC portals.
  - The ECR assumes everyone is in the pension scheme (EPS). Members over 58 or not eligible for EPS need their line edited before upload.
  - No Form 16.
  - Professional tax ignores the exemption for women in Maharashtra. TDS is not worked out from the tax regime; it is typed in.
  - Statutory amounts are not posted to Finance as payables until they are paid as ordinary payments.
  - Overtime is paid at 1× the hourly rate.
- **Sales:**
  - No 1% affordable-housing GST check. The rate is set per booking.
  - A receipt can be cancelled but not edited. To correct one, cancel it and enter it again.
  - "On each slab" is one instalment raised when the whole superstructure stage is done. It is not one demand per slab.
  - The demand WhatsApp is still sent by a click per buyer.
- **Exports:**
  - GST on a supplier bill is one rate for the whole bill. A bill with items at different rates should be entered as separate bills.
  - Reverse charge (for example on unregistered suppliers or some services) is not handled.
  - Ledger names are fixed (for example "Purchase - Construction Material"). Rename them in Tally, or ask for a mapping screen.
  - There is no direct sync with Tally. It is an import file.
- **Equipment:** hire and fuel costs logged here are not added to the project budget automatically. Hire bills should still be entered in Finance under the Equipment cost head.
- **Quality:** the five checklists are fixed. There is no screen yet to make your own checklist.
- **Drawings:** no markup or side-by-side comparison of revisions. Files are limited to PDF or images up to 10 MB.
- **Offline app:**
  - Only stage progress and daily reports can be saved offline. Attendance, material requests, payments and the rest need a signal.
  - A page has to be opened once with a signal before it works offline.
  - Offline saving works in the installed app and in Chrome or Safari on the phone. The offline page cache only runs on the production build, not in `npm run dev`.
  - If the signal drops just after the server saved an update but before the phone heard back, that update can be sent twice. It shows as two entries in the stage history.

### Ideas for a Phase 8 (not started)

| Feature | Notes |
|---|---|
| Automatic WhatsApp | Send demand letters and reminders without a click, using the WhatsApp Business API. |
| Buyer login | A proper sign-in for buyers (OTP on their mobile) in place of the secret link. |
| More offline forms | Attendance, material requests and quality checklists saved offline too. |
| Form 16 and TDS | Work out TDS from the tax regime and make Form 16 at year end. |
| GST per bill line | Different GST rates on lines of the same bill, and reverse charge. |

### General gaps

- **Nothing is pushed to GitHub yet.** All seven phases are committed locally on `claude/project-thread-7co71b` and delivered as bundle files. A pull request still needs to be opened and merged when you are ready.
- **WhatsApp is click-to-chat only.** The buttons open WhatsApp with the number and a message filled in. Automatic WhatsApp messages (for example sending reminders without a click) would need the WhatsApp Business API and an account.
- **No mobile push notifications.** Alerts appear inside the app (the bell icon). There is no phone push or SMS.
- **Photos and drawings are stored on the server's disk** (`storage/uploads/private`), with a backup copy in the database. For heavy use they should move to cloud storage such as S3, so the database stays small.
- **Check-in has no GPS or selfie check.** Attendance trusts the person checking in.
- **Material request lines typed as free text** must be matched to a catalogue material before they can be ordered.
- **Two older tests fail.** These failures existed before this work started and are not caused by it:
  - `phase3-e2e-workflows-and-roles` B-1, the login and session lifecycle test.
  - `phase4-release-gate` section 7, the measurement-book backup recovery test.

  The rest of the suite passes: 354 of 356 tests.

## Checks run on the latest version (Phase 7)

- Tests: 354 of 356 pass. The only failures are the 2 older tests listed above. This includes 4 new tests for Phase 7, 7 for Phase 6, 8 for Phase 5 and 10 for Phase 4.
- Offline app, tried in a phone-sized browser on the production build with the server switched off: a stage update with a photo and a daily report were saved on the phone, and both reached the server with the photo when it came back.
- Type check: clean.
- Lint: 9 warnings, the same as before the redesign.
- Production build: succeeds.
