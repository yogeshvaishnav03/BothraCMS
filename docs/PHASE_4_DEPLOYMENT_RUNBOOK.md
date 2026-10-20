# Phase 4: Production Deployment Runbook

**System:** Build Track Pro / BothraCMS  
**Target Release Tag:** `v1.0.0-phase4`  
**Base Commit:** `d5ad223`  
**Status:** READY FOR CONTROLLED PRODUCTION DEPLOYMENT  
**Primary Operators:** DevOps Engineer, Full-Stack Architect, Lead Systems Administrator

---

## 1. System Architecture & Hosting Topology

Build Track Pro is built on Next.js 14 (App Router) with Prisma ORM. The platform supports two production hosting architectures:

### Option A: Serverless Edge (Vercel / Cloudflare / AWS Lambda)
- **Application Runtime:** Vercel Edge / Serverless Functions.
- **Database Engine:** Managed PostgreSQL (e.g. Neon, Supabase, AWS RDS PostgreSQL) with connection pooling enabled.
- **File Storage:** AWS S3 or Cloudflare R2 (`STORAGE_PROVIDER=S3`).
- **Build Trigger:** `vercel.json` automatically triggers `node scripts/prepare-db.js && next build`, which switches Prisma datasource from SQLite to PostgreSQL dynamically.

### Option B: Standalone Container / Linux VM (Docker / Render / AWS EC2)
- **Application Runtime:** Node.js v20 LTS managed by PM2 or Docker.
- **Database Engine:** Local SQLite 3 with WAL mode checkpointing (`PRAGMA journal_mode=WAL`) on persistent storage, or managed PostgreSQL.
- **File Storage:** Persistent disk mount at `/storage/uploads/private` with automatic database blob backup (`idempotencyRecord`).

---

## 2. Environment Configuration Matrix

The following environment variables must be injected into the production environment before triggering deployment. **Never commit these values to source control.**

| Variable | Required | Description | Example / Syntax |
|---|:---:|---|---|
| `NODE_ENV` | Yes | Enforces production security checks | `production` |
| `SESSION_SECRET` | Yes | 64+ character random cryptographic secret | Generated via `openssl rand -hex 32` |
| `DATABASE_URL` | Yes | Database connection string | `postgresql://user:pass@host:5432/db?sslmode=require` or `file:./prisma/dev.db` |
| `DIRECT_URL` | Cloud | Unpooled direct URL for Prisma migrations | `postgresql://user:pass@host:5432/db?sslmode=require` |
| `TRUSTED_ORIGINS` | Yes | Comma-delimited list of authorized domains | `https://bothracms.com,https://app.bothracms.com` |
| `NEXT_PUBLIC_APP_URL` | Yes | Canonical root URL of the web application | `https://app.bothracms.com` |
| `STORAGE_PROVIDER` | No | Storage backend (`LOCAL` or `S3`) | Default: `LOCAL` |
| `S3_BUCKET` | If S3 | AWS S3 Bucket Name | `bothracms-production-files` |
| `AWS_ACCESS_KEY_ID` | If S3 | Cloud Storage Access Key | IAM credentials |
| `AWS_SECRET_ACCESS_KEY` | If S3 | Cloud Storage Secret Key | IAM credentials |
| `AWS_REGION` | If S3 | AWS Datacenter Region | `ap-south-1` |

---

## 3. Step-by-Step Deployment Protocol

### Step 3.1: Pre-Deployment Audit & Git Check
```bash
# 1. Ensure working tree is clean and checked out to release commit
git checkout main
git pull origin main
git verify-commit HEAD

# 2. Confirm SHA matches baseline
# Baseline commit: d5ad223
git rev-parse --short HEAD
```

### Step 3.2: Automated Pre-Flight Test Suite
```bash
# Execute full automated test suite (31 files, 270 tests)
npm run test
```
*Gating condition: 100% of tests must pass. Any failure aborts deployment immediately.*

### Step 3.3: Database Safety Snapshot
Before running schema sync or migrations:
```bash
# SQLite container:
node scripts/db-backup.js

# PostgreSQL:
pg_dump -Fc --no-acl --no-owner -h $DB_HOST -U $DB_USER -d $DB_NAME > storage/backups/pre_deploy_$(date +%Y%m%d_%H%M%S).dump
```

### Step 3.4: Schema Synchronization & Build
```bash
# Prepares provider (Postgres or SQLite), regenerates Prisma client, and synchronizes schema
node scripts/prepare-db.js

# Compile production Next.js build
npm run build
```

### Step 3.5: Process Execution / Container Launch
**For PM2 Cluster on Linux:**
```bash
pm2 start npm --name "bothracms-prod" -- run start -- -p 3000
pm2 save
```

**For Docker Container:**
```bash
docker build -t bothracms:latest .
docker run -d --name bothracms-prod \
  -p 3000:3000 \
  --env-file .env.production \
  -v /var/data/bothracms/storage:/app/storage \
  bothracms:latest
```

---

## 4. Post-Deployment Verification (Smoke Test)

Execute immediately following server startup:

1. **Ping Health Endpoint:**
   ```bash
   curl -i https://app.bothracms.com/api/health
   ```
   *Expected response: HTTP 200 with `{ "status": "ok", "database": "connected" }`.*

2. **Verify Security Headers:**
   ```bash
   curl -I https://app.bothracms.com/login
   ```
   *Verify presence of:*
   - `X-Frame-Options: DENY`
   - `X-Content-Type-Options: nosniff`
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
   - `Referrer-Policy: strict-origin-when-cross-origin`

3. **Verify Auth & CSRF Cookie:**
   Log into the application and check browser cookie:
   - `buildtrack_session` must have flags: `HttpOnly; Secure; SameSite=Lax; Path=/`.

4. **Verify Day Book & Workforce UI:**
   - Navigate to `/day-book` -> verify bills and expenses load without timezone shift.
   - Navigate to `/workforce` -> verify "All Sites" headcount renders properly.

---

## 5. Rollback Procedures

If any critical defect or database inconsistency is detected post-deployment:

### Scenario A: Application Level Regression (Code rollback)
```bash
# 1. Switch back to previous known stable tag
git checkout tags/v1.0.0-phase3
npm run build
pm2 restart bothracms-prod
```

### Scenario B: Database Migration Failure (State rollback)
```bash
# 1. Stop web traffic / place in maintenance mode
pm2 stop bothracms-prod

# 2. Restore pre-deployment database backup
# For SQLite:
node scripts/db-restore.js storage/backups/dev_backup_<timestamp>.db

# For PostgreSQL:
pg_restore --clean --if-exists -h $DB_HOST -U $DB_USER -d $DB_NAME storage/backups/pre_deploy_<timestamp>.dump

# 3. Restart application
pm2 restart bothracms-prod
```
