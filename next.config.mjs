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
  async rewrites() {
    return [
      {
        source: "/.well-known/assetlinks.json",
        destination: "/api/assetlinks",
      },
    ];
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://*.amazonaws.com https://*.blob.vercel-storage.com",
      "connect-src 'self' https://*.r2.cloudflarestorage.com https://*.amazonaws.com https://*.vercel-storage.com https://*.blob.vercel-storage.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");

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
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
