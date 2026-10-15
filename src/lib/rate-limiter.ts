interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, RateLimitRecord>();

/**
 * In-memory sliding window rate limiter
 * @param key unique identifier (e.g. `login:${ip}:${email}`)
 * @param maxAttempts maximum attempts allowed in the window (default: 5)
 * @param windowMs window duration in milliseconds (default: 60,000ms = 1 minute)
 */
export function checkRateLimit(
  key: string,
  maxAttempts = 5,
  windowMs = 60000
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  const record = attempts.get(key);

  if (!record || now > record.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
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

export function resetRateLimit(key: string): void {
  attempts.delete(key);
}
