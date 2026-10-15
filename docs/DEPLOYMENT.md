# Deployment Guide & Operations Manual

## 1. Local Environment Setup

### Prerequisites
- Node.js >= 18.x (tested on v24.18.0)
- npm >= 9.x (tested on 11.16.0)
- Git

### Quickstart Steps
1. **Clone & Navigate**:
   ```bash
   cd c:\Users\Owner\Desktop\crm
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

4. **Initialize Database & Run Migrations**:
   ```bash
   npx prisma migrate dev --name init
   ```

5. **Seed Initial Demo / Test Data (Optional)**:
   ```bash
   npm run seed
   ```

6. **Run Automated Test Suite**:
   ```bash
   npm run test
   ```

7. **Start Development Server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

## 2. Environment Variables Specification

| Variable | Description | Default / Example |
|---|---|---|
| `DATABASE_URL` | Prisma connection string | `file:./dev.db` (local SQLite) or `postgresql://...` |
| `SESSION_SECRET` | 32+ character random secret for signing session cookies | `super-secret-key-at-least-32-chars-long` |
| `NODE_ENV` | Application environment | `development` or `production` |
| `PORT` | Web server listening port | `3000` |
| `DEFAULT_TIMEZONE` | Fallback system timezone | `Asia/Kolkata` |
| `DEFAULT_CURRENCY` | Default currency ISO code | `INR` |

## 3. Production Deployment Guidelines

### Container / Cloud Platform (Vercel, Render, Railway, Docker, AWS ECS)
1. Set `DATABASE_URL` to your production PostgreSQL connection string.
2. In `prisma/schema.prisma`, update `datasource db { provider = "postgresql" }`.
3. Run `npx prisma migrate deploy` in your CI/CD build or release phase.
4. Run `npm run build` to generate the optimized Next.js standalone server bundle.
5. Launch `npm start`.

### Database Backup & Recovery
- **SQLite (Local)**: The database file is located at `prisma/dev.db`. Create a daily timestamped copy:
  ```bash
  copy prisma\dev.db backups\backup-%DATE%.db
  ```
- **PostgreSQL (Production)**: Use standard `pg_dump` automated scheduled backups.
