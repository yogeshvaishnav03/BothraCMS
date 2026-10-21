# Changes & Status — branch `claude/fixes-and-ui-polish`

Date: 21 Oct 2026. Base commit: `e557e38` (plus `d1206c9` "WIP before Claude fixes", which only adds `CRM-REPORT.md`).
Nothing was pushed. `.env`, `prisma/dev.db` and the other `.db` files were not modified.

## 1. Logic and security fixes

| # | Problem | Fix |
|---|---|---|
| 1 | `GET /api/day-book` wrote demo projects, bills, payments, stock and users into the live tenant whenever a date had no activity. | GET now only reads, so an empty date returns empty data. `POST` (manual demo seed) now needs **SUPER_ADMIN** and is refused in production unless `ALLOW_DEMO_SEED=true`. The Day Book page shows the "Load Demo Data" / "Populate Demo Records" buttons to Super Admins only, and everyone else gets a proper empty state ("No Day Book entries for …" with "+ Log Day Entry" and "Jump to <recent date>"). |
| 2 | Super Admin "Add Demo Data" created logins with the fixed password `Password123!`, and reset the role of existing accounts. | `/api/admin/seed` now has the same production guard. Each run generates a random password, which is used only for accounts that don't exist yet. Existing accounts are left untouched (role and password). The password is returned once (`demoCredentials`), and the admin console shows it once with a "copy now" notice. |
| 3 | `DayBookSeedService` created a user with a fake bcrypt hash when an org had no users. | It now stops with a clear error instead. |
| 4 | Payment approval bypass: any `finance:write` role (e.g. ACCOUNTANT) could send `autoApprove: true` or `status: "POSTED"` and post the payment immediately. | Only SUPER_ADMIN / ORG_ADMIN can post directly. Every other role always gets `PENDING_APPROVAL`. Arbitrary `status` values from the request are ignored. |
| 5 | `next.config.mjs` generated a random `SESSION_SECRET`, appended it to `.env`, and injected it through `nextConfig.env`. That breaks across serverless instances and risks inlining the secret into bundles. | The config no longer generates, writes or injects the secret, and only warns at production runtime if it is missing. `src/lib/jwt-secret.ts` already fails fast in production. **Verified:** after a production build, the secret appears in 0 files under `.next/`. Login, the middleware redirect and authenticated page loads all work on `next start`, because middleware reads `process.env.SESSION_SECRET` at runtime. |
| 6 | **Found during this work:** `scripts/prepare-db.js` (run by `npm run build` **and** `npm start`) always ran three demo-seed scripts against whatever `DATABASE_URL` pointed at, including a production Postgres. It also auto-generated and appended `SESSION_SECRET`. | In a production-like environment (`NODE_ENV=production`, `VERCEL_ENV=production`, or a non-localhost Postgres URL), seeding is skipped unless `ALLOW_DEMO_SEED=true`, and a missing secret is only warned about, never generated. Local development behaves as before. |
| 7 | Dead code `src/lib/dynamic-store.ts` (~38 KB). | Deleted. Nothing imported it; only a test *title* mentioned the word. |

Validation errors from the API now read like `Validation error: amount — Number must be greater than 0` instead of a bare "Validation error", so every form shows a clearer message without per-page changes. `.env.example` documents `ALLOW_DEMO_SEED`.

### Tests
- New: `src/__tests__/payment-auto-approve-restriction.test.ts` (6 tests). ACCOUNTANT `autoApprove`/`POSTED` gives PENDING, PROJECT_MANAGER is forbidden, and ORG_ADMIN/SUPER_ADMIN can post or choose to route for approval.
- New: `src/__tests__/day-book-no-auto-seed.test.ts` (3 tests). GET on an empty date doesn't seed, POST is 403 for non-Super-Admins, and POST is 403 in production without the flag.
- Updated to the intended behaviour (not skipped): `priority4-vendors-contractors.test.ts`, where the accountant payment is now PENDING and is then approved by ORG_ADMIN. Also `admin-seed.test.ts`, which now covers the new `demoCredentials` and adds a production-guard test.

## 2. UI polish (same stack, no new libraries)
- **New shared components** in `src/components/ui`: `Button`, `Card`/`CardHeader`, `PageHeader`, `EmptyState`, `Badge` (+ `statusTone()`), `Alert`, `LoadingState`, plus a `cn()` helper (`src/lib/cn.ts`, built on the existing clsx + tailwind-merge).
- **Consistent page headers:** Audit, Finance, Materials, Projects, Parties, Reports and Tasks now use `PageHeader`. It shrinks the title on mobile, stacks the actions below it and wraps long titles.
- **Consistent feedback messages:** 19 hand-rolled success/error banners on Attendance, Chat, Finance, Materials, Parties, Projects, Settings, Tasks and Workforce now use `Alert`, which has an icon and `role="alert"` for errors. Day Book status messages became dismissible `Alert`s with the right colour.
- **Shadows were silently missing:** pages used `shadow-xs` / `shadow-2xs` about 190 times, but those are Tailwind v4 names and did nothing on Tailwind 3. They are now defined in `tailwind.config.ts`, so cards get their intended subtle shadow.
- **Mobile layout:** the main content area gets `min-w-0` and the shell clips horizontal overflow, so wide tables scroll inside their own `overflow-x-auto` container instead of widening the page. Table scroll containers get smooth touch scrolling, long text wraps, and media is capped at the container width. **Checked at 375 px on all 15 main pages: none scroll sideways.**
- **Keyboard focus:** links and buttons now have a visible amber focus outline (keyboard only).
- **Login form:** labels are linked to inputs, `autocomplete` is set for email and password, errors are announced (`role="alert"`, `aria-invalid`), and a 401 now says "The email or password is incorrect…".

Behaviour and API calls on the pages are unchanged. Edits were made in place; the large page files were not rewritten.

## 3. Verification results (exact)
| Check | Result |
|---|---|
| `npx tsc --noEmit` | **Pass**, 0 errors |
| `npm run lint` | **Pass**: 0 errors, 9 warnings, all pre-existing (hook dependencies, `<img>` usage), none in changed code |
| `npm test` (Vitest) | **35/35 files, 301/301 tests pass** (the baseline before my changes was 33 files / 291 tests, all passing) |
| Production build | **Pass** (`next build`, compiled successfully) |
| Manual check on `next start` | Login 200 → `/api/auth/me` returns the user. `/finance` without a cookie redirects to `/login`, and with a cookie returns 200. Empty Day Book date returns 0 records and seeds nothing. 15 pages show no horizontal overflow at 375 px. |

How the checks were run, and why:
- **Tests and build used a copy of `dev.db`** in a temp folder, not `prisma/dev.db`. The tests write rows, and the instruction was not to touch the `.db` files.
- **The checked-in `prisma/dev.db` is behind the Prisma schema.** For example, `Store.isArchived` is missing. Against it as-is, **24 of 33 test files fail**, both before and after my changes. The copy was brought up to date with `prisma db push` first.
- With no `DATABASE_URL` set, `vitest.config.ts` defaults to `file:./prisma/dev.db`, which Prisma resolves to `prisma/prisma/dev.db`. That is the reason for the "Unable to open the database file" errors you may see.
- **The build was run as `npx next build`**, not `npm run build`. `npm run build` first runs `prepare-db.js`, which pushes the schema into `dev.db`, seeds demo data and copies the file.
- To run things the normal way locally, run `npx prisma db push` once (this updates your `dev.db`), then `npm test` / `npm run build`.
- The Playwright e2e suite was **not** run.

## 4. What is good in the system
- Clean layering: route handlers → services → Prisma, with Zod validation and a single JSON response shape.
- Real multi-tenancy (every query is scoped by `organizationId`) and 8-role RBAC enforced on the API, plus project-level assignments.
- A sound inventory model: stock comes from the ledger, negative stock is blocked, transfers are atomic, and balances can be reconciled.
- Sound finance model: money in integer paise, payment allocations, idempotency keys, reversals, an approval queue (now actually enforced) and party statements.
- Strong security basics: HTTP-only JWT cookie, CSRF origin checks, DB-backed rate limiting, security headers, upload magic-byte checks, a fail-fast production secret check, and an audit log on most mutations.
- Wide feature coverage for a construction business: projects/tasks, Day Book, Measurement Book → bills, GPS attendance, headcount, document folders with ACLs, chat, English/Hindi.
- A large automated test suite (301 Vitest tests) that passes once the DB schema is current.

## 5. What is still not good / not done
- **User management is missing:** there is no UI/API to invite or create users, change roles, deactivate, or reset passwords. Users come only from `scripts/create-super-admin.ts` or the demo seed.
- **Tenant creation is missing:** the Super Admin console can only list and suspend companies.
- **No stock adjustment endpoint/UI:** `InventoryService.adjustStock` and `inventory:adjust` exist but nothing calls them, so physical stock counts are impossible.
- **No credit notes;** outstanding = bills − payments only.
- **Sites/stores** can't be edited or deleted.
- **No scheduler:** due-task reminders and low-stock alerts only fire when someone's browser polls `/api/notifications`. A cron job (e.g. Vercel Cron) is needed.
- **No real WhatsApp/SMS/email:** only `wa.me` / `mailto` links. Chat and notifications poll every 4–5 s (Pusher keys in `.env.example` are unused).
- **Database:** SQLite by default, Postgres only by rewriting `schema.prisma` at build time, and no Prisma migrations (`db push` only). Production needs Postgres + real migrations. The local `dev.db` is currently behind the schema (see §3).
- **Uploaded files are also stored as base64 in the DB** (`IdempotencyRecord`), which bloats the database.
- **Giant page files:** dashboard ≈3,300 lines, finance ≈2,650, day-book ≈2,500, ~340 `any` types, and no shared data-fetching hook. The new UI components are only adopted where the change was safe; most cards, buttons and tables inside these files are still hand-styled.
- **Dev seed scripts** (`prisma/seed.ts`, `scripts/seed-daybook-demo-data.js`, verify scripts) still use fixed demo passwords. They now only run locally (or with `ALLOW_DEMO_SEED=true`), but should not be used against real tenants.
- **Error message prefixes** such as `Forbidden:` / `NotFound:` from services are shown to users as-is.
- **No CI** (`.github/workflows` absent). The Playwright e2e suite exists but was not run here.
- **Documentation sprawl:** ~50 overlapping markdown reports with contradicting numbers. `SECURITY_REMEDIATION/implementations/*` are stale copies of live code.
