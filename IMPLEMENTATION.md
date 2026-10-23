# Bothra CMS: Implementation Status

Last updated: 23 Oct 2026 (after Phase 10)
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
| 7 | GST on supplier bills, PF / ESI for site workers with PF ECR and ESI files, cancelling a receipt, offline site app | Done | `96fec30` | `bothra-redesign-phase7.bundle` |
| 8 | More offline forms, GST rate per bill line and reverse charge, TDS from the tax regime with a yearly tax statement, statutory dues posted to Finance | Done | `7f7c45a` | `bothra-redesign-phase8.bundle` |
| 9 | Offline items sent only once, the Site Muster for site workers (works with no signal), TDS return on salary (24Q) with PAN and TAN | Done | `8619060` | `bothra-redesign-phase9.bundle` |
| 10 | TDS on contractor payments (194C) with the 26Q return, buyer sign-in with a code on their mobile, WhatsApp demand letters and reminders sent by themselves | Done | `fada0ba`, merged in PR #2 | `bothra-redesign-phase10.bundle` |
| 11 | TDS on professional fees (194J) and rent (194I) next to 194C, WhatsApp alerts for staff (approvals, tasks, site alerts) | Done | see `git log` | merged to `main`, deployed on Vercel |

**Eleven phases are done.** From Phase 10 on, the work is on GitHub and merged into `main`, so Vercel deploys it by itself. The bundle files are only needed for a copy outside GitHub.

### How to load the latest version

```bash
git fetch bothra-redesign-phase10.bundle claude/project-thread-7co71b:claude/redesign-phase10
git checkout claude/redesign-phase10
npm install
npx prisma db push      # required: phases 2 to 11 add new tables and columns (Vercel does this on each build)
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

## Phase 8: More offline forms, GST per bill line, TDS on salary and statutory dues in Finance (done)

**More forms work with no signal**
- Material requests, quality inspections and quality issue reports (with photos), and staff check-in and check-out can now be saved on the phone, as stage updates and daily reports already could.
- A check-in saved offline keeps the time the button was pressed, not the time it reached the server. The record is marked "Saved on phone with no signal, sent later". The server refuses a saved time more than 18 hours old or in the future.
- If the phone sends the same check-in twice (the signal dropped before the reply came back), it counts once.
- With two tabs or windows open, only one sends the saved items when the signal returns, so nothing is sent twice.
- If the person never answers the phone's location prompt, Check in no longer spins; it goes ahead without a location after 8 seconds.

**GST per bill line and reverse charge**
- Each line of a supplier bill can have its own GST rate ("Same as bill" by default), so steel at 18% and another item at 12% go on one bill. The bill shows the tax at line rates.
- A "Reverse charge" tick for bills where the company pays the GST itself (for example a goods transport agency or an unregistered supplier). The supplier is owed only the taxable value.
- Tally: reverse-charge bills credit "CGST / SGST / IGST Payable (RCM)" and, when credit is claimed, debit input GST.
- The purchase register has a "Reverse charge" column, and a mixed-rate bill shows its rates as, for example, "12/18".

**TDS on salary**
- Payroll → Staff salaries: each person has a tax regime (new or old). For the old regime, enter their declared deductions (80C, 80D, HRA and so on); PF and professional tax are counted automatically.
- When payroll is made, TDS is worked out from the year's salary so far plus the rest of the year at this month's pay, less TDS already cut, spread over the months left. Slabs, the standard deduction, the rebate (with marginal relief in the new regime), surcharge and 4% cess follow the Finance Act 2025 rates.
- A month's TDS can still be typed by hand. Ticking "Work out TDS from their tax regime" again switches it back.

**Yearly tax statement**
- "Tax for the year" opens a printable statement for each person for any financial year: salary, PF, ESI, professional tax, TDS and net pay month by month, and how the year's tax is worked out.
- People can see their own; payroll managers can see everyone's.
- It is a summary in the shape of Form 16 Part B, not Form 16 itself.

**Statutory dues posted to Finance**
- When payroll is approved, bills are created in Finance for the month: PF (to EPFO, due the 15th of next month), ESI (to ESIC, due the 15th), TDS (to the Income Tax Department, due the 7th) and professional tax (due at the end of next month).
- Each is paid like any other bill, so what is owed to the government shows in outstanding payables.

---

## Phase 9: Offline items sent once, the Site Muster and the TDS return (done)

**Nothing saved offline is sent twice**
- Every item saved on a phone now carries its own id. If the signal drops after the server has saved it but before the phone hears back, the phone sends it again and the server recognises it: it returns the first reply and creates nothing new. This covers stage updates, daily reports, check-ins, material requests, quality checks and the muster.
- Photos already uploaded are remembered on the phone, so a retry does not upload them again.
- If the server turns an item down (for example a missing field), the id is freed, so the corrected item can still go through.

**Site Muster** (Attendance → Site muster, or People → Site Muster)
- A supervisor picks the project and the day and marks each site worker P (present), ½ (half day) or A (absent). Tapping the same mark again clears it.
- Overtime is added in half-hour steps, up to 8 hours.
- "Rest present" marks everyone not yet marked as present. Workers whose usual site is elsewhere are hidden until asked for, and a worker already marked at another site that day is flagged.
- The bar at the bottom shows the day's wages from each worker's daily rate, including overtime.
- It works with no signal: the whole muster is saved on the phone and sent when the signal returns. Saving the same muster again only updates it.
- Payroll picks it up directly: a full day, half a day, and overtime beyond 8 hours at the hourly rate.
- Supervisors can fill in today and the last 7 days. Older days need someone who can correct attendance. A day an admin has corrected is not changed by the muster.

**TDS return on salary (Form 24Q)** (Payroll → Staff salaries → TDS return)
- Choose a quarter. The page shows salary paid, TDS cut, TDS deposited, and the date the return is due (31 Jul, 31 Oct, 31 Jan, 31 May).
- Challans: one per month, from the TDS bill in Finance and the payments made against it, with the date and the challan number taken from the payment reference. Late deposits are marked, with the interest at 1.5% a month.
- Annexure I: each person's salary and TDS for each month, with their PAN.
- Annexure II (in the fourth quarter): each person's salary, deductions, taxable income, tax and TDS for the year, with any shortfall.
- Each table downloads as a CSV laid out for the NSDL return utility. A missing PAN is written as PANNOTAVBL.
- "Fix before filing" lists what is missing: the company TAN, PANs, months with payroll not approved, and TDS not deposited or deposited late.
- New fields: PAN for each staff member (Staff salaries) and the company TAN (Settings).

---

## Phase 10: TDS on contractors, buyer sign-in and automatic WhatsApp (done)

**TDS on contractor payments (section 194C)** (Finance → Record Payment)
- When paying a contractor, the payment form works out the TDS by itself and shows what is held back and what the bank pays.
  - 1% for an individual or HUF, 2% for a firm or company, from the 4th letter of the PAN. The PAN is read from the contractor's PAN field, or from inside their GSTIN.
  - 20% when there is no PAN, with a warning to add it.
  - Nothing is cut while a payment is ₹30,000 or less and the year's payments to that contractor stay within ₹1 lakh. The payment that crosses ₹1 lakh also catches up the TDS on the earlier small payments.
  - When paying a bill with GST shown separately, TDS is on the amount before GST.
- The TDS can be set to "No TDS" (for example a transporter's declaration), which needs a reason, or typed in (for example under a lower-deduction certificate).
- Suppliers are not touched; only contractors and parties marked as both.
- The contractor's bill is settled in full. The bank pays the amount less TDS, and the TDS is owed to the government on one bill a month ("TDS194C-2026-10", due the 7th of the next month, 30 April for March). Reversing a payment takes its TDS off that bill.
- The payments register shows "TDS held" and "Bank paid" under each such payment. Totals of money out (Day Book, dashboard) count what left the bank.
- Tally export: the bank is credited the net amount and the TDS goes to a "TDS Payable (194C)" ledger. The payments CSV has "TDS held" and "From bank" columns.

**TDS return on contractors (Form 26Q)** (Finance → TDS return (26Q), or Payroll → TDS return → Contractors)
- Same layout as the salary return: payments and TDS for the quarter, the challans from the monthly TDS bills, the due date (31 Jul, 31 Oct, 31 Jan, 31 May), and "Fix before filing".
- Each payment shows the contractor, PAN, amount, rate and TDS, with the 26Q remark codes: C (no PAN, 20%), A (lower rate), T (transporter, no TDS).
- Both tables download as CSV for the NSDL return utility.

**Buyer sign-in with a code on their mobile** (Settings → Messages → "Buyers sign in with a code")
- When switched on, the buyer's page link asks for a 6-digit code sent to the mobile number on their booking. A forwarded link alone no longer opens the page, the receipts or the site photos.
- The code goes on WhatsApp (an authentication template) or, if WhatsApp is not set up, by SMS through MSG91.
- A code works once, for 10 minutes. Five wrong tries end it, and a number can ask for at most 3 codes in 15 minutes.
- Signing in shows every home booked on that number. The buyer stays signed in on that phone for 30 days and can sign out.
- When it is switched off, the link works on its own, as before. The sign-in page is at `/portal/sign-in`.

**WhatsApp demand letters and reminders sent by themselves** (Settings → Messages)
- When a stage is done and a demand is raised, the buyer gets the demand on WhatsApp with the amount, the due date and the link to their page.
- Then reminders: a few days before the due date (3 by default), and every few days while it is overdue (every 7 days, at most 3 times by default).
- A buyer gets at most one message a day. Several overdue instalments go in one message with the total.
- A wrong number is tried 3 times and then left alone. Nothing is sent once the instalment is paid.
- Messages go out right after a demand is raised, and once a day from the scheduler. There is also a "Send today's messages now" button.
- Every message is in the "Sent messages" log on the same page, with Meta's reason when one fails.
- **Test mode** writes messages and sign-in codes into the log instead of sending them, so the whole flow can be tried before WhatsApp is set up.

**Setting it up**
1. Make a WhatsApp Business account in Meta Business Suite and add a phone number. Copy the phone number ID and make a permanent access token (System user).
2. Submit three templates for approval: a sign-in code (Authentication), a demand and a reminder (Utility). The text to submit is on the Messages page.
3. Fill in Settings → Messages, press "Send test" with your own mobile, then switch on what you need.
4. For SMS sign-in codes instead, add the MSG91 auth key and a DLT-approved OTP template ID.
5. For the daily run, set `CRON_SECRET` (16 characters or more) on the server. On Vercel the daily job is already in `vercel.json` (10 am IST). Elsewhere, call `GET /api/cron/whatsapp` once a day with the header `Authorization: Bearer <CRON_SECRET>`.

The WhatsApp token and SMS key are kept on the server. The settings page only shows their last 4 characters, and they are left out of the audit log and every other API reply.

---

## Phase 11: TDS on fees and rent, and WhatsApp alerts for staff (done)

**TDS on professional fees (194J) and rent (194I)** (Vendors & Contractors → Edit → "TDS on payments")
- Each party now has a TDS section. "Automatic" means 194C for contractors and no TDS for goods suppliers, as in Phase 10.

  | Choice | Rate | No TDS while | 26Q code |
  |---|---|---|---|
  | Contractor (194C) | 1% individual or HUF, 2% others | a payment is ₹30,000 or less and the year stays within ₹1 lakh | 94C |
  | Professional fees (194J), e.g. architect, structural engineer, CA, lawyer | 10% | the year's fees stay within ₹50,000 | 94J-B |
  | Technical services (194J), e.g. soil testing, lab tests | 2% | the year stays within ₹50,000 | 94J-A |
  | Rent of land or building (194I), e.g. site office, godown | 10% | the month's rent stays within ₹50,000 | 4IB |
  | Machinery on hire (194I), e.g. crane, JCB, shuttering on rent | 2% | the month stays within ₹50,000 | 4IA |
  | No TDS | | | |

- No PAN means 20%, as before. The payment that crosses the limit also catches up the TDS on earlier payments in the year (or month, for rent).
- The payment form shows the section by name ("TDS · Professional fees (194J)") and works the same way: automatic, "No TDS" with a reason, or a typed amount.
- The TDS is owed on one bill a month per section: "TDS194C-2026-10", "TDS194J-2026-10" and "TDS194I-2026-10", all to the Income Tax Department (TDS). Pay each with its own challan.
- Tally export: a ledger for each, "TDS Payable (194C)", "TDS Payable (194J)" and "TDS Payable (194I)". Depositing a TDS bill clears its own ledger.
- The 26Q page (now "Contractors, fees & rent") lists every payment with its section and code, and the challans per section and month. The CSV sheets have the section code column the NSDL utility asks for. A party marked "No TDS" is left out of the return.

**WhatsApp alerts for staff** (Settings → Messages → "Alert staff on WhatsApp")
- Staff get what needs them on WhatsApp as well as in the bell in the app. Three kinds, each with its own tick box:
  - **Approvals waiting:** admins hear about payments and purchase orders waiting for approval. Material requests go to the people they are meant for.
  - **Tasks:** task reminders, and each morning (10 am) a list of a person's overdue tasks.
  - **Site alerts:** quality, safety and equipment alerts, and anything marked critical.
- Everything waiting for a person goes in one message. Each person gets at most one message every 15 minutes, and none between 9 pm and 8 am. Anything held back goes with the next message or the 10 am run.
- An approval is sent once; reading an alert in the app first means it is not sent on WhatsApp.
- Staff need a mobile number on the Team page. The settings page shows how many have none.
- It uses the same WhatsApp number as the buyer messages. Submit one more Utility template to Meta: `Hi {{1}}, {{2}}. Open Bothra CMS: {{3}}`, and put its name in "Staff alert template". Test mode works here too.
- "Send today's messages now" also sends staff alerts and the overdue-task list.

---

## Incomplete or still planned

All eleven phases are built. The items below are not built yet, or work only partly.

### Gaps in Phase 5 to 10 features

- **Payroll:**
  - The PF ECR and ESI files are made for upload; filing and paying the challan are still done on the EPFO and ESIC portals.
  - The ECR assumes everyone is in the pension scheme (EPS). Members over 58 or not eligible for EPS need their line edited before upload.
  - The tax statement is not Form 16. Part A (TDS deposited) comes from the TRACES portal after the quarterly return is filed.
  - The TDS return page gathers the figures and makes CSV sheets, but not the FVU upload file. The return is still prepared in the NSDL utility and filed on the income-tax portal.
  - The challan number is read from the payment reference; the BSR code and challan serial are not split out. Enter them in the utility.
  - Interest on late TDS is an estimate; the late-filing fee (₹200 a day) is not worked out.
  - TDS assumes the rest of the year at the latest month's pay. A raise or a bonus later in the year is picked up only from that month.
  - Income from a previous employer in the same year is not counted. Add it to the TDS by hand.
  - Surcharge has no marginal relief (it matters only above ₹50 lakh a year).
  - Tax slabs and rates are from the Finance Act 2025. Check them each April after the budget.
  - The statutory bills for PF and ESI include the employee's share, which was already cut from pay; they are booked under the Overheads cost head.
  - Professional tax ignores the exemption for women in Maharashtra.
  - Overtime is paid at 1× the hourly rate.
- **Sales:**
  - No 1% affordable-housing GST check. The rate is set per booking.
  - A receipt can be cancelled but not edited. To correct one, cancel it and enter it again.
  - "On each slab" is one instalment raised when the whole superstructure stage is done. It is not one demand per slab.
  - Automatic WhatsApp needs a WhatsApp Business account and approved templates; until then, use test mode or the click-to-send button.
  - The messages are in English only. A Hindi template can be set by changing the template language, but the app sends one language to everyone.
  - Replies from buyers on WhatsApp do not come into the app. They arrive in the WhatsApp Business inbox.
- **TDS on payments (194C, 194J, 194I):**
  - Purchases over ₹50 lakh a year from one supplier (194Q) and payments to non-residents are not worked out.
  - Directors' fees under 194J (no limit) are not a separate choice; use "typed in" for them.
  - The limits use payments made in the app. Payments to the same party made before the app was used are not counted.
  - TDS is cut when paying, not when the bill is booked. Advances count as paid.
  - Form 16A certificates are downloaded from TRACES after filing; the app does not make them.
  - The 26Q page makes CSV sheets, not the FVU file, the same as the salary return.
- **Staff WhatsApp alerts:**
  - Task updates and chat messages stay in the app; only reminders, the morning overdue list, approvals and site alerts go on WhatsApp.
  - On the Vercel Hobby plan the scheduled run is once a day, so an alert held overnight goes at 10 am. Alerts during the day go straight away.
  - Replies on WhatsApp do not come back into the app.
- **Exports:**
  - Reverse charge does not post the "RCM paid" entry; pay the RCM tax in cash through the GST portal and record it as a payment.
  - Ledger names are fixed (for example "Purchase - Construction Material"). Rename them in Tally, or ask for a mapping screen.
  - There is no direct sync with Tally. It is an import file.
- **Site muster:** a shift is recorded as 9 am to 5 pm (or 1 pm for a half day), not the real times. A muster for one project marks the worker at that project's site; a worker who moved between two sites in a day should be marked at the main one.
- **Equipment:** hire and fuel costs logged here are not added to the project budget automatically. Hire bills should still be entered in Finance under the Equipment cost head.
- **Quality:** the five checklists are fixed. There is no screen yet to make your own checklist.
- **Drawings:** no markup or side-by-side comparison of revisions. Files are limited to PDF or images up to 10 MB.
- **Offline app:**
  - Stage progress, daily reports, check-in and check-out, the site muster, material requests and quality checks can be saved offline. Payments, bills, payroll and the rest need a signal.
  - The muster needs the project's worker list to have been opened once with a signal.
  - A page has to be opened once with a signal before it works offline.
  - Offline saving works in the installed app and in Chrome or Safari on the phone. The offline page cache only runs on the production build, not in `npm run dev`.
  - Items saved by an older version of the app (before Phase 9) and still waiting on a phone have no id, so they could still arrive twice.

### Ideas for a Phase 12 (not started)

| Feature | Notes |
|---|---|
| Photo storage in the cloud | Move photos and drawings to S3, Vercel Blob or similar. On Vercel the server disk is not kept between deploys, so this matters there. Needs a storage account. |
| Online payment for buyers | A "Pay now" button on the buyer's page through a payment gateway (Razorpay or similar). Needs a gateway account. |
| TDS on large purchases (194Q) | 0.1% on purchases over ₹50 lakh a year from one supplier. |
| Form 16A | Make the TDS certificates in the app instead of downloading them from TRACES. |

### General gaps

- **Automatic WhatsApp covers buyers and staff.** Messages to vendors and contractors are still click-to-chat buttons.
- **No mobile push notifications.** Alerts appear inside the app (the bell icon). There is no phone push or SMS.
- **Photos and drawings are stored on the server's disk** (`storage/uploads/private`), with a backup copy in the database. For heavy use they should move to cloud storage such as S3, so the database stays small.
- **Check-in has no GPS or selfie check.** Attendance trusts the person checking in.
- **Material request lines typed as free text** must be matched to a catalogue material before they can be ordered.
- **Two older tests fail.** These failures existed before this work started and are not caused by it:
  - `phase3-e2e-workflows-and-roles` B-1, the login and session lifecycle test.
  - `phase4-release-gate` section 7, the measurement-book backup recovery test.

  The rest of the suite passes: 370 of 372 tests.

## Checks run on the latest version (Phase 11)

- Tests: 370 of 372 pass. The only failures are the 2 older tests listed above. This includes 5 new tests for Phase 11 (194J yearly limit and catch-up, 2% technical services, 194I monthly rent, a supplier with a section, an exempt party, one TDS bill per section, Tally ledgers per section and a deposit, the 26Q with section codes and challans per section; staff alerts grouped per person, an approval sent once, chat left in the app, the 15-minute gap, quiet hours, the morning overdue list once a day, and the call to the Meta API), 8 for Phase 10 (194C rates, limits and catch-up, GST excluded, no PAN, transporters, the monthly TDS bill and reversal, Tally and CSV, the 26Q return; buyer sign-in with wrong codes, expiry and limits, the page lock; demand, due-soon and overdue messages to the Meta API, one message a day per buyer, a refused template, and the token kept off every reply), 3 for Phase 9 (a request sent twice with the same id is saved once, the muster and its pay in payroll, the TDS return with a late challan and missing PANs), 4 for Phase 8 (tax maths, automatic and manual TDS with the statement and statutory bills, mixed-rate and reverse-charge bills, a late and repeated offline check-in), 4 for Phase 7, 7 for Phase 6, 8 for Phase 5 and 10 for Phase 4.
- Tried on the production build in a browser (Phase 11): the TDS choice on a party, a payment to an architect showing 10% under 194J, the 26Q page with 194C, 194J and 194I, and Settings → Messages with staff alerts in test mode.
- Tried on the production build in a browser (Phase 10): a contractor payment showing the TDS and catch-up, the 26Q page, Settings → Messages in test mode sending one message per buyer, and a buyer signing in on a phone with the code from the log.
- Offline app, tried in a phone-sized browser on the production build with the server switched off: a muster of 8 workers was saved on the phone and reached the server once when it came back. In Phase 8 a check-in and a material request were tried the same way with two tabs open.
- Type check: clean.
- Lint: 9 warnings, the same as before the redesign.
- Production build: succeeds.
