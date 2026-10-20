import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL || "file:./prisma/dev.db",
    },
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["audit-artifacts/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
