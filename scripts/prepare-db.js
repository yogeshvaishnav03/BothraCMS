const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Load .env file into process.env if present
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
            : "file:./prisma/dev.db"),
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
    execSync("npx prisma db push --skip-generate", {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: directUrl,
      },
    });
    console.log("✅ Database schema synchronized successfully.");
  } catch (err) {
    console.warn("⚠️ prisma db push encountered an issue, proceeding with build:", err.message);
  }
} else {
  console.log("ℹ️ Local or default database configured, skipping remote db push.");
}
