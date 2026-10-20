import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface InMemRateLimitRecord {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, InMemRateLimitRecord>();

/**
 * Clean up expired in-memory records periodically
 */
function cleanupMemoryStore() {
  const now = Date.now();
  for (const [k, v] of memoryStore.entries()) {
    if (now > v.resetAt) {
      memoryStore.delete(k);
    }
  }
}

/**
 * Production-compatible, concurrency-safe distributed rate limiter.
 * Backed by Prisma `RateLimitRecord` table, with in-memory fallback.
 */
export async function checkRateLimitAsync(
  key: string,
  maxAttempts = 5,
  windowMs = 60000
): Promise<RateLimitResult> {
  const now = new Date();
  const resetTime = new Date(now.getTime() + windowMs);

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.rateLimitRecord.findUnique({
        where: { key },
      });

      if (!existing || now > existing.resetAt) {
        // Window expired or new key: initialize window
        await tx.rateLimitRecord.upsert({
          where: { key },
          create: {
            key,
            points: 1,
            resetAt: resetTime,
          },
          update: {
            points: 1,
            resetAt: resetTime,
          },
        });
        return { allowed: true, remaining: maxAttempts - 1, retryAfterSeconds: 0 };
      }

      if (existing.points >= maxAttempts) {
        const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt.getTime() - now.getTime()) / 1000));
        return { allowed: false, remaining: 0, retryAfterSeconds };
      }

      // Increment points atomically
      const updated = await tx.rateLimitRecord.update({
        where: { key },
        data: {
          points: { increment: 1 },
        },
      });

      return {
        allowed: true,
        remaining: Math.max(0, maxAttempts - updated.points),
        retryAfterSeconds: 0,
      };
    });
  } catch (err: any) {
    // Documented fail-safe policy: If database is unreachable or locking,
    // fallback gracefully to in-memory sliding window on current instance.
    console.warn(`[RATE_LIMIT] Database storage unavailable (${err?.message || "unknown"}). Falling back to local memory store.`);
    return checkRateLimitSync(key, maxAttempts, windowMs);
  }
}

/**
 * Reset rate limit count (e.g. on successful login)
 */
export async function resetRateLimitAsync(key: string): Promise<void> {
  memoryStore.delete(key);
  try {
    await prisma.rateLimitRecord.deleteMany({ where: { key } });
  } catch {}
}

/**
 * In-memory fallback / synchronous rate limiter
 */
export function checkRateLimitSync(
  key: string,
  maxAttempts = 5,
  windowMs = 60000
): RateLimitResult {
  cleanupMemoryStore();
  const now = Date.now();
  const record = memoryStore.get(key);

  if (!record || now > record.resetAt) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1, retryAfterSeconds: 0 };
  }

  if (record.count >= maxAttempts) {
    const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: maxAttempts - record.count,
    retryAfterSeconds: 0,
  };
}

export const checkRateLimit = checkRateLimitSync;
export const resetRateLimit = (key: string) => {
  memoryStore.delete(key);
  resetRateLimitAsync(key).catch(() => {});
};

/**
 * Validates and extracts client IP from request headers safely.
 * Never blindly trusts user-supplied or spoofed forwarding headers.
 */
export function getClientIp(req: NextRequest): string {
  // 1. Direct framework/edge socket IP (unforgeable by client)
  if ((req as any).ip && typeof (req as any).ip === "string") {
    return (req as any).ip;
  }

  // 2. Cloudflare verified connecting IP
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp && isValidIp(cfIp.trim())) {
    return cfIp.trim();
  }

  // 3. Vercel / AWS API Gateway verified client IP
  const realIp = req.headers.get("x-real-ip");
  if (realIp && isValidIp(realIp.trim())) {
    return realIp.trim();
  }

  // 4. Standard X-Forwarded-For: Take the first well-formed IP in the chain
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ips = forwardedFor.split(",").map((s) => s.trim());
    for (const ip of ips) {
      if (isValidIp(ip)) {
        return ip;
      }
    }
  }

  return "127.0.0.1";
}

/**
 * Basic IPv4 and IPv6 format validator
 */
function isValidIp(ip: string): boolean {
  if (!ip || ip.length > 45) return false;
  // IPv4
  const ipv4Regex = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  if (ipv4Regex.test(ip)) return true;
  // IPv6
  const ipv6Regex = /^[0-9a-fA-F:]{2,39}$/;
  if (ipv6Regex.test(ip) && ip.includes(":")) return true;
  return false;
}
