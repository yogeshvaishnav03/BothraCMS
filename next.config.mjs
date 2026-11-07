// SESSION_SECRET is read at runtime from process.env (Next.js loads .env files
// itself, and Edge middleware can read server env vars). It is deliberately NOT
// generated here and NOT exposed through `nextConfig.env`, which would inline it
// into compiled bundles. src/lib/jwt-secret.ts fails fast in production when the
// secret is missing or weak, and uses a dev-only fallback locally.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
if (process.env.NODE_ENV === "production" && !isBuildPhase && !process.env.SESSION_SECRET) {
  console.warn(
    "[config] SESSION_SECRET is not set. Authenticated requests will fail until it is configured (>= 32 chars)."
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Prevent unescaped character or lint formatting warnings from failing Vercel production deployment
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Ensure Vercel fails only on real typecheck errors, which we run locally
    ignoreBuildErrors: false,
  },
  env: {
    ALLOW_DEMO_SEED: process.env.ALLOW_DEMO_SEED ?? "true",
  },
  async rewrites() {
    return [
      {
        source: "/.well-known/assetlinks.json",
        destination: "/api/assetlinks",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/.well-known/assetlinks.json",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=86400" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
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
