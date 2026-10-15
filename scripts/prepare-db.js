const { execSync } = require("child_process");

const dbUrl = process.env.DATABASE_URL || "";

// If a valid production database URL is configured, push schema automatically
if (dbUrl && !dbUrl.includes("localhost:5432")) {
  try {
    console.log("⚡ Syncing database schema to remote PostgreSQL...");
    execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
    console.log("✅ Database schema synchronized successfully.");
  } catch (err) {
    console.warn("⚠️ prisma db push encountered an issue, proceeding with build:", err.message);
  }
} else {
  console.log("ℹ️ No remote DATABASE_URL configured during build, skipping automatic db push.");
}
