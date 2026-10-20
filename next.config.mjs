import fs from "fs";
import path from "path";
import crypto from "crypto";

// Ensure SESSION_SECRET is available in process.env and Next.js runtime
let sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  const envFiles = [".env.production", ".env.local", ".env"];
  for (const file of envFiles) {
    try {
      const fullPath = path.resolve(process.cwd(), file);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        const match = content.match(/^SESSION_SECRET=["']?([^"'\r\n]+)["']?/m);
        if (match && match[1] && match[1].trim().length >= 32) {
          sessionSecret = match[1].trim();
          process.env.SESSION_SECRET = sessionSecret;
          break;
        }
      }
    } catch {
      // Continue to next env file
    }
  }
}

// If still missing and not running Vitest test suite, generate a cryptographically secure random secret
if (!sessionSecret && process.env.VITEST !== "true") {
  sessionSecret = crypto.randomBytes(32).toString("hex");
  process.env.SESSION_SECRET = sessionSecret;
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    const appendLine = `\nSESSION_SECRET="${sessionSecret}"\n`;
    if (fs.existsSync(envPath)) {
      fs.appendFileSync(envPath, appendLine, "utf-8");
    } else {
      fs.writeFileSync(
        envPath,
        `# BothraCMS Environment Configuration\nDATABASE_URL="file:./prisma/dev.db"\nSESSION_SECRET="${sessionSecret}"\nNODE_ENV="production"\nPORT=3000\nDEFAULT_TIMEZONE="Asia/Kolkata"\nDEFAULT_CURRENCY="INR"\nTRUSTED_ORIGINS="localhost:3000,localhost:3001,127.0.0.1:3000"\n`,
        "utf-8"
      );
    }
  } catch {
    // Read-only filesystem in serverless environments; in-memory process.env.SESSION_SECRET is still active
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Injects SESSION_SECRET into Edge Middleware and Serverless execution context
    ...(sessionSecret ? { SESSION_SECRET: sessionSecret } : {}),
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
