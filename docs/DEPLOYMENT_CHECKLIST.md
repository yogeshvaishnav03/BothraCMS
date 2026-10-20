# Production Deployment & Readiness Checklist

**BuildTrack Pro / BothraCMS Enterprise Construction Platform**  
*Phase 2 Production Gate Review*  
*Date: 2026-10-20*

---

## 1. Environment Variables Verification

The application requires the following environment variables for production environments. Ensure no variables contain placeholder or development values.

| Variable Name | Required | Minimum Security Standard | Description |
|:---|:---:|:---|:---|
| `NODE_ENV` | Yes | `production` | Enables strict production fail-safes, secure cookies, and redacted error messages. |
| `SESSION_SECRET` | Yes | Cryptographically random string >= 32 characters (e.g. `openssl rand -hex 32`) | Used to sign and verify HS256 JWT session tokens. Weak secrets halt server startup. |
| `DATABASE_URL` | Yes | Valid PostgreSQL connection string with SSL enabled | Example: `postgresql://user:pass@host:5432/db?sslmode=require` |
| `PORT` | Optional | Integer (Default: `3000`) | Network port for the Next.js production server. |
| `TRUSTED_ORIGINS` | Recommended | Comma-separated domains without trailing slashes | Example: `https://app.bothracms.com,https://bothracms.com` |
| `STORAGE_PROVIDER` | Optional | `local` or `s3` (Default: `local`) | File storage driver. Set to `s3` for multi-instance cloud deployments. |
| `AWS_REGION` | If S3 | AWS region string (e.g. `ap-south-1`) | Required when `STORAGE_PROVIDER=s3`. |
| `AWS_S3_BUCKET` | If S3 | S3 bucket name | Required when `STORAGE_PROVIDER=s3`. |
| `AWS_ACCESS_KEY_ID` | If S3 | IAM access key | Least-privilege IAM credentials for S3 PutObject/GetObject. |
| `AWS_SECRET_ACCESS_KEY`| If S3| IAM secret key | Sensitive credential; configure via secret manager. |

> [!CAUTION]
> Never commit actual passwords, private keys, or `.env` files into source control. Verify `.gitignore` contains `.env`, `.env.local`, and `.env.production`.

---

## 2. Pre-Deployment Build & Verification Commands

Execute the following sequential commands on the target build agent:

```bash
# 1. Install production dependencies
npm ci

# 2. Verify TypeScript static typing (Must produce 0 errors)
node_modules/.bin/tsc --noEmit

# 3. Apply database migrations
npx prisma generate
npx prisma migrate deploy

# 4. If migrating from legacy JSON storage in a fresh deployment:
node scripts/migrate-data-to-db.js

# 5. Run full automated test suite (Must achieve 100% pass rate)
node_modules/.bin/vitest run src/__tests__

# 6. Execute Next.js optimized production build
npm run build
```

---

## 3. Production Security Headers Verification

The application automatically injects hardened HTTP security headers via `next.config.mjs`:

- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` (HSTS)
- `X-Frame-Options: DENY` (Clickjacking prevention)
- `X-Content-Type-Options: nosniff` (MIME sniffing defense)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`
- `Content-Security-Policy`: Default-src restricted to self with verified image/data schemes.

---

## 4. Health Check & Monitoring Validation

Following service start, invoke the public health endpoint:
```bash
curl -i http://localhost:3000/api/health
```

Expected HTTP Response (200 OK):
```json
{
  "status": "ok",
  "database": "connected",
  "uptime": 12.45,
  "timestamp": "2026-10-20T13:45:00.000Z"
}
```

Verify that on database disruption, the endpoint responds with `503 Service Unavailable` without leaking connection strings, server paths, or internal stack traces.

---

## 5. Rollback & Emergency Recovery Protocol

In the event of an unplanned deployment failure:
1. **Container / Process Rollback**: Immediately revert the container tag or Git commit to the previous stable release.
2. **Database Rollback**:
   - Revert schema changes using `npx prisma migrate resolve`.
   - Restore database snapshot from pre-deployment backup.
3. **Storage Fallback**: Legacy pre-migration data is preserved in `storage/data/measurement-book.json.bak`.
