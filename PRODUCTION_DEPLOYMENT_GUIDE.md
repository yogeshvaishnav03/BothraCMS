# BothraCMS (BuildTrack Pro) — Production Deployment Guide

**Target Version:** 1.0.0 Enterprise Production Release  
**Platform:** Next.js 14 (App Router) + Prisma ORM + PostgreSQL + Cloudflare R2 / AWS S3  
**Target Hosts:** Vercel (recommended for serverless frontend & APIs), Render, Railway, AWS ECS, or Docker on Linux VM

---

## 1. System Requirements & Architecture

- **Runtime:** Node.js v18.18+ or v20+ LTS
- **Database:** PostgreSQL 14, 15, or 16 (e.g. Neon, Supabase, AWS RDS Aurora Serverless, or Google Cloud SQL)
- **Object Storage:** AWS S3 or Cloudflare R2 (required for serverless invoice & photo attachments)
- **Memory / Compute:** Minimum 1 vCPU, 1 GB RAM (for containerized deployments) or Vercel Pro Serverless Functions

---

## 2. Environment Variables Configuration

Create a production `.env` or populate your cloud provider's Environment Secrets dashboard with the following variables:

```bash
# ------------------------------------------------------------------------------
# 1. Database (PostgreSQL)
# ------------------------------------------------------------------------------
# For serverless (Vercel / AWS Lambda), use a connection-pooling URL:
DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:6543/[DBNAME]?sslmode=require&pgbouncer=true"

# Optional direct connection URL for migrations:
DIRECT_URL="postgresql://postgres:[PASSWORD]@[HOST]:5432/[DBNAME]?sslmode=require"

# ------------------------------------------------------------------------------
# 2. Session Cryptography & Application Mode
# ------------------------------------------------------------------------------
# Mandatory cryptographically secure 32+ character string. Generate via: openssl rand -base64 48
SESSION_SECRET="e987c65b341f20d04829fa7812984bc0192837465abcde901234567890abcdef"

NODE_ENV="production"
PORT=3000

# ------------------------------------------------------------------------------
# 3. Cloud Object Storage (Cloudflare R2 or AWS S3)
# ------------------------------------------------------------------------------
S3_BUCKET="bothracms-production-documents"
AWS_ACCESS_KEY_ID="your_production_access_key"
AWS_SECRET_ACCESS_KEY="your_production_secret_key"
AWS_REGION="ap-south-1"

# For Cloudflare R2, configure the account endpoint:
# S3_ENDPOINT="https://[YOUR_ACCOUNT_ID].r2.cloudflarestorage.com"

# ------------------------------------------------------------------------------
# 4. Regional & Currency Defaults
# ------------------------------------------------------------------------------
DEFAULT_TIMEZONE="Asia/Kolkata"
DEFAULT_CURRENCY="INR"
```

---

## 3. Database Provisioning & Schema Synchronization

### Step 3.1: Synchronize PostgreSQL Schema
Run the automated schema sync to push the multi-tenant Prisma schema to your remote database:

```bash
npx prisma db push
```

### Step 3.2: Bootstrap Super Admin User
Create the initial system administrator account to gain access to the tenant management portal:

```bash
npm run admin:bootstrap
```
*Follow the interactive prompts or pass `ADMIN_EMAIL` and `ADMIN_PASSWORD` in environment variables.*

---

## 4. Deployment Instructions by Target Platform

### Option A: Vercel (Recommended for Serverless)
1. Link your GitHub repository to Vercel:
   ```bash
   vercel
   ```
2. In the Vercel Project Settings → **Environment Variables**, add:
   - `DATABASE_URL` (PostgreSQL with SSL enabled)
   - `SESSION_SECRET` (32+ characters)
   - `NODE_ENV="production"`
   - `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
3. The build command is pre-configured in `package.json`:
   ```bash
   node scripts/prepare-db.js && prisma generate && next build
   ```
   *Note: `scripts/prepare-db.js` automatically configures Prisma datasource for `postgresql` when `DATABASE_URL` is set.*
4. Deploy:
   ```bash
   git push origin main
   ```

### Option B: Docker Container (Standalone Linux / AWS ECS / Render)
A production multi-stage `Dockerfile` is included in the project root:

```dockerfile
# 1. Build Image
docker build -t bothracms:latest .

# 2. Run Container
docker run -d \
  -p 3000:3000 \
  --name bothracms-app \
  -e DATABASE_URL="postgresql://user:pass@db-host:5432/bothracms?sslmode=require" \
  -e SESSION_SECRET="your_production_secure_secret_minimum_32_characters" \
  -e NODE_ENV="production" \
  bothracms:latest
```

---

## 5. Health Checks & Continuous Monitoring

BothraCMS includes a comprehensive system health endpoint:

```http
GET /api/health
```

**Response Payload (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2026-10-16T04:20:00.000Z",
  "database": "connected",
  "uptimeSeconds": 14205,
  "storage": "S3_READY"
}
```

Configure your load balancer or uptime monitor (e.g. BetterStack, Datadog, AWS Route 53) to poll `/api/health` every 60 seconds.

---

## 6. Automated Backup & Disaster Recovery

### Step 6.1: On-Demand Database Backup
Run the included backup script:
```bash
npm run db:backup
```
*Creates a timestamped snapshot under `storage/backups/db-backup-[TIMESTAMP].sql`.*

### Step 6.2: Database Restore
To restore from a backup snapshot:
```bash
npm run db:restore storage/backups/db-backup-[TIMESTAMP].sql
```

---

## 7. Security & Maintenance Checklist

- [x] Enforce SSL/TLS (`https://`) on custom domains via Cloudflare or AWS ACM.
- [x] Ensure `SESSION_SECRET` is never committed to Git and rotates annually.
- [x] Configure S3 / R2 Bucket CORS to only allow your production domain origin.
- [x] Set PostgreSQL maximum connections to accommodate serverless concurrency (recommend connection pooling with PgBouncer).
- [x] Review `/audit` logs weekly for unauthorized access attempts.
