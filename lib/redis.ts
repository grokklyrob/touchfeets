import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;

export function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (_redis) return _redis;
  _redis = new Redis({ url, token });
  return _redis;
}

/**
 * Try to acquire a one-time idempotency lock in Redis.
 * Returns true if acquired (process this event), false if already held (dedupe).
 * Uses NX + EX semantics; no release is needed.
 */
export async function tryAcquireIdempotency(key: string, ttlSeconds = 24 * 60 * 60): Promise<boolean> {
  const client = getRedis();
  if (!client) {
    // If Redis is not configured, allow processing (fallback to DB idempotency).
    return true;
  }
  try {
    const res = await client.set(key, "1", { nx: true, ex: ttlSeconds });
    return res === "OK";
  } catch {
    // Fail open to avoid blocking processing due to transient Redis issues.
    return true;
  }
}

/**
 * Convenience helper specifically for Stripe webhook event ids.
 */
export function stripeEventLockKey(eventId: string) {
  return `stripe:event:${eventId}`;
}

/**
 * Build a rate limit key for a given scope and identifier (e.g., userId or ip).
 * Example: rateLimitKey("gen", userId)
 */
export function rateLimitKey(scope: string, id: string) {
  return `rl:${scope}:${id}`;
}

/**
 * Sliding-window-ish fixed window limiter using INCR + EXPIRE.
 * - key: redis key to increment
 * - windowSeconds: duration of the window
 * - max: maximum allowed hits per window
 *
 * Returns:
 *  - allowed: whether the action is permitted
 *  - remaining: how many attempts remain in the current window
 *  - resetSeconds: seconds until window resets (approx TTL)
 */
export async function rateLimitWindow(
  key: string,
  windowSeconds = 60,
  max = 30
): Promise<{ allowed: boolean; remaining: number; resetSeconds: number }> {
  const client = getRedis();
  if (!client) {
    // If Redis is not configured, allow through to avoid hard-failing.
    return { allowed: true, remaining: max, resetSeconds: windowSeconds };
  }
  try {
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, windowSeconds);
    }
    const ttl = await client.ttl(key);
    const remaining = Math.max(0, max - count);
    return {
      allowed: count <= max,
      remaining,
      resetSeconds: typeof ttl === "number" && ttl >= 0 ? ttl : windowSeconds,
    };
  } catch {
    // Fail open on transient Redis errors.
    return { allowed: true, remaining: max, resetSeconds: windowSeconds };
  }
}