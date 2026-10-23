const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Load .env file into process.env if present, or create with secure defaults
const envPath = path.resolve(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
} else if (process.env.VERCEL) {
  // On Vercel, settings come from the project's environment variables. A .env
  // written here would be copied into the Edge middleware at build time but not
  // read by the Node.js functions, so logins would be signed and checked with
  // different keys (the user lands back on the login page).
  console.log("ℹ️ Vercel build: using the project's environment variables (no .env file is written).");
} else {
  // Generate a cryptographically secure 64-char SESSION_SECRET on fresh environments
  const autoSecret = crypto.randomBytes(32).toString("hex");
  const defaultEnv = `# BothraCMS (BuildTrack Pro) — Production & Local Environment Configuration
DATABASE_URL="file:./dev.db"
SESSION_SECRET="${autoSecret}"
NODE_ENV="production"
PORT=3000
DEFAULT_TIMEZONE="Asia/Kolkata"
DEFAULT_CURRENCY="INR"
TRUSTED_ORIGINS="localhost:3000,localhost:3001,127.0.0.1:3000"
`;
  try {
    fs.writeFileSync(envPath, defaultEnv, "utf-8");
    process.env.SESSION_SECRET = autoSecret;
    console.log("⚡ Auto-created .env with cryptographically secure SESSION_SECRET.");
  } catch (err) {}
}

const rawDbUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  "";
// Production-like: never generate secrets or seed demo data silently here.
const isProductionLike =
  process.env.NODE_ENV === "production" ||
  process.env.VERCEL_ENV === "production" ||
  ((rawDbUrl.startsWith("postgres://") || rawDbUrl.startsWith("postgresql://")) &&
    !rawDbUrl.includes("localhost"));
const allowDemoSeed = !isProductionLike || process.env.ALLOW_DEMO_SEED === "true";

// Ensure SESSION_SECRET is guaranteed in process.env (local development only)
if (!process.env.SESSION_SECRET && isProductionLike) {
  console.warn(
    "⚠️ SESSION_SECRET is not set. It is NOT auto-generated for production; set it (>= 32 chars) in the deployment environment or the app will refuse authenticated requests."
  );
} else if (!process.env.SESSION_SECRET) {
  const generatedSecret = crypto.randomBytes(32).toString("hex");
  process.env.SESSION_SECRET = generatedSecret;
  try {
    if (fs.existsSync(envPath)) {
      fs.appendFileSync(envPath, `\nSESSION_SECRET="${generatedSecret}"\n`, "utf-8");
    }
  } catch (err) {}
}

const dbUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  "";

const directUrl =
  process.env.DIRECT_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  dbUrl;

if (dbUrl && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = dbUrl;
}

const schemaPath = path.resolve(__dirname, "..", "prisma", "schema.prisma");

if (fs.existsSync(schemaPath)) {
  let schema = fs.readFileSync(schemaPath, "utf-8");
  const isPostgres = dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://");
  const currentProvider = schema.includes('provider = "postgresql"') ? "postgresql" : "sqlite";
  const targetProvider = isPostgres ? "postgresql" : "sqlite";

  if (currentProvider !== targetProvider) {
    console.log(`⚡ Configuring Prisma datasource provider for ${targetProvider}...`);
    schema = schema.replace(
      /datasource db\s*\{\s*provider\s*=\s*"[^"]+"\s*url\s*=\s*env\("DATABASE_URL"\)\s*\}/,
      `datasource db {\n  provider = "${targetProvider}"\n  url      = env("DATABASE_URL")\n}`
    );
    fs.writeFileSync(schemaPath, schema, "utf-8");
  }

  // Always generate Prisma client with explicit DATABASE_URL env
  try {
    console.log(`⚡ Generating Prisma Client for ${targetProvider}...`);
    execSync("npx prisma generate", {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL:
          dbUrl ||
          (targetProvider === "postgresql"
            ? "postgresql://postgres:postgres@localhost:5432/postgres"
            : "file:./dev.db"),
      },
    });
  } catch (genErr) {
    console.warn("⚠️ prisma generate warning:", genErr.message);
  }
}

// If a valid production database URL is configured, push schema automatically
if (
  dbUrl &&
  (dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://")) &&
  !dbUrl.includes("localhost:5432")
) {
  try {
    console.log("⚡ Syncing database schema to remote PostgreSQL...");
    execSync("npx prisma db push --accept-data-loss --skip-generate", {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: directUrl.includes('pgbouncer=true') ? directUrl.replace(/[?&]pgbouncer=true/g, '').replace(':6543', ':5432') : directUrl,
      },
    });
    console.log("✅ Database schema synchronized successfully.");
  } catch (err) {
    console.warn("⚠️ prisma db push notice:", err.message);
  }

  // Ensure all Phase 5-11 tables and columns are guaranteed to exist
  try {
    console.log("⚡ Verifying table and column definitions via direct PostgreSQL migration...");
    execSync("node scripts/apply-postgres-migration.js", {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
      },
    });
  } catch (ddlErr) {
    console.warn("Notice: Direct DDL sync notice:", ddlErr.message);
  }
} else {
  console.log("ℹ️ Local or default database configured, skipping remote db push.");
}

// Demo data seeding: local development only, or when ALLOW_DEMO_SEED=true is set explicitly.
if (!allowDemoSeed) {
  console.log("?? Production-like environment: checking if default bootstrap admin is requested...");
  try {
    const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL || "admin@buildtrack.pro";
    const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || "Password123!";
    const bootstrapName = process.env.ADMIN_BOOTSTRAP_NAME || "Vikram Malhotra";
    console.log(`? Running safe super admin bootstrap for ${bootstrapEmail}...`);
    execSync(`npx tsx scripts/create-super-admin.ts "${bootstrapEmail}" "${bootstrapPassword}" "${bootstrapName}"`, {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: directUrl || dbUrl || "file:./dev.db",
      },
    });
  } catch (bootstrapErr) {
    console.warn("Notice: Super Admin bootstrap check completed or skipped:", bootstrapErr.message);
  }
} else {
  // Ensure Day Book demo data is always seeded in database
  try {
    console.log("⚡ Ensuring Day Book demo data is populated...");
    execSync("node scripts/seed-daybook-demo-data.js", {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: dbUrl || "file:./dev.db",
      },
    });
  } catch (seedErr) {
    console.warn("Notice: Day book demo data seed completed or skipped:", seedErr.message);
  }

  // Ensure 100+ demo data across all modules is populated
  try {
    console.log("⚡ Ensuring 100+ demo data across all modules is populated...");
    execSync("node scripts/seed-100-demo-data.js", {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: dbUrl || "file:./dev.db",
      },
    });
  } catch (seed100Err) {
    console.warn("Notice: 100+ demo data seed completed or skipped:", seed100Err.message);
  }

  // Ensure 100+ Projects, Purchase Orders and cross-org datasets are populated
  try {
    console.log("⚡ Ensuring 100+ Projects & Orders are populated...");
    execSync("node scripts/seed-projects-and-orders.js", {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: dbUrl || "file:./dev.db",
      },
    });
  } catch (poErr) {
    console.warn("Notice: Projects and orders seed completed or skipped:", poErr.message);
  }
}

// Synchronize prisma/dev.db to prisma/prisma/dev.db
try {
  const mainDb = path.resolve(__dirname, "..", "prisma", "dev.db");
  const mirrorDb = path.resolve(__dirname, "..", "prisma", "prisma", "dev.db");
  if (fs.existsSync(mainDb)) {
    fs.copyFileSync(mainDb, mirrorDb);
    console.log("🔄 Synchronized prisma/dev.db -> prisma/prisma/dev.db");
  }
} catch (syncErr) {
  console.warn("Notice: Final db sync copy warning:", syncErr.message);
}
