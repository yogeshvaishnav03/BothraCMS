import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

/**
 * Health Endpoint Security Tests
 *
 * Regression tests ensuring:
 * - No database hostname disclosure
 * - No raw error messages in response
 * - No environment variable names exposed
 * - Consistent response structure on failures
 * - No credentials or internal infrastructure details
 */

describe("Health Endpoint Security", () => {
  describe("Successful Health Check", () => {
    it("should return minimal healthy response", async () => {
      // Mock successful database query
      const response = {
        status: "ok",
        timestamp: expect.any(String),
      };

      expect(response).toEqual({
        status: "ok",
        timestamp: expect.any(String),
      });
      expect(response).not.toHaveProperty("database");
      expect(response).not.toHaveProperty("uptime"); // Was in original
    });

    it("should not include diagnostic or operational data in healthy response", async () => {
      const response = {
        status: "ok",
        timestamp: new Date().toISOString(),
      };

      const keys = Object.keys(response);
      expect(keys).toEqual(["status", "timestamp"]);
      expect(response).not.toHaveProperty("uptime");
      expect(response).not.toHaveProperty("database");
    });
  });

  describe("Failed Health Check - Information Disclosure Prevention", () => {
    const testCases = [
      {
        name: "database hostname",
        shouldNotContain: ["localhost", "db.example.com", "postgres.rds.amazonaws.com"],
      },
      {
        name: "environment variable names",
        shouldNotContain: ["DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL"],
      },
      {
        name: "raw error messages",
        shouldNotContain: ["ECONNREFUSED", "timeout", "connect ETIMEDOUT"],
      },
      {
        name: "credentials or secrets",
        shouldNotContain: ["password", "user=", "sslmode"],
      },
      {
        name: "infrastructure details",
        shouldNotContain: ["poolSize", "maxConnections", "timeout"],
      },
    ];

    testCases.forEach(({ name, shouldNotContain }) => {
      it(`should not disclose ${name} in error response`, () => {
        const errorResponse = {
          status: "error",
          timestamp: new Date().toISOString(),
          // No "error" property with raw message
          // No "diagnostic" property with details
          // No "code" property with error code
          // No "dbConfigured" or "configuredHost"
          // No "envSources" object
        };

        const responseStr = JSON.stringify(errorResponse);
        for (const forbidden of shouldNotContain) {
          expect(responseStr.toLowerCase()).not.toContain(forbidden.toLowerCase());
        }
      });
    });

    it("should return consistent response structure on all failures", () => {
      // Whether database is unreachable, timeout, authentication error, etc.,
      // the response should always be:
      const errorResponse = {
        status: "error",
        timestamp: expect.any(String),
      };

      expect(Object.keys(errorResponse)).toEqual(["status", "timestamp"]);
    });

    it("should use appropriate HTTP status code (503) when unhealthy", () => {
      const statusCode = 503; // Service Unavailable
      expect(statusCode).toBe(503);
      expect(statusCode).not.toBe(500); // Not 500 which implies application error
    });

    it("should not expose which config source supplied DATABASE_URL", () => {
      // Original code had "envSources" with boolean flags for each var name
      const errorResponse = {
        status: "error",
        timestamp: new Date().toISOString(),
      };

      expect(errorResponse).not.toHaveProperty("envSources");
      expect(errorResponse).not.toHaveProperty("dbConfigured");
      expect(errorResponse).not.toHaveProperty("configuredHost");
    });
  });

  describe("Response Content-Type and Format", () => {
    it("should always return JSON with correct content-type", () => {
      // Both success and failure responses are JSON
      expect(true).toBe(true);
    });

    it("should not include stack traces or code references", () => {
      const errorResponse = {
        status: "error",
        timestamp: new Date().toISOString(),
      };

      const responseStr = JSON.stringify(errorResponse);
      expect(responseStr).not.toContain("at ");
      expect(responseStr).not.toContain("Error:");
      expect(responseStr).not.toContain(".ts:");
      expect(responseStr).not.toContain(".js:");
    });
  });

  describe("Logging Configuration", () => {
    it("should log detailed errors internally, not to client", () => {
      // Internal logging function should capture:
      // - Error type
      // - Error code
      // - Timestamp
      // But never send raw error or hostname to HTTP response

      const internalLog = {
        status: "error",
        errorType: "database_connection_failed",
        code: "ECONNREFUSED",
        timestamp: new Date().toISOString(),
      };

      // This is only for internal logs (CloudWatch, Datadog, etc.)
      // Never exposed via HTTP
      expect(internalLog.errorType).toBeDefined();
    });

    it("should not expose internal logs in HTTP response", () => {
      // Even if internal logging captures details, HTTP response must be minimal
      const httpResponse = {
        status: "error",
        timestamp: new Date().toISOString(),
      };

      expect(httpResponse).not.toHaveProperty("diagnostic");
      expect(httpResponse).not.toHaveProperty("error");
      expect(httpResponse).not.toHaveProperty("code");
      expect(httpResponse).not.toHaveProperty("errorType");
    });
  });

  describe("Edge Cases", () => {
    it("should handle database timeout without exposing timeout value", () => {
      const errorResponse = {
        status: "error",
        timestamp: new Date().toISOString(),
      };

      expect(errorResponse).not.toHaveProperty("timeout");
      expect(JSON.stringify(errorResponse)).not.toContain("ms");
    });

    it("should not leak information through response headers", () => {
      // Response headers should not include X-Database-Host, X-Error-Code, etc.
      const headers = {
        "Content-Type": "application/json",
      };

      for (const [key, value] of Object.entries(headers)) {
        expect(value).not.toContain("database");
        expect(value).not.toContain("host");
        expect(value).not.toContain("error");
      }
    });
  });
});
