/**
 * Sliding-window rate limiter using a Redis Lua script.
 *
 * Key format: `rl:<userId>:<route>`
 * Default: 60 requests per 60-second window per user per route.
 *
 * The Lua script is atomic — no TOCTOU race between ZCOUNT and ZADD.
 */

import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { redis } from "../lib/redis.js";

// Sliding window Lua script.
// KEYS[1]  = the rate-limit key
// ARGV[1]  = current timestamp in ms (string)
// ARGV[2]  = window size in ms (string)
// ARGV[3]  = max requests per window (string)
// Returns  = remaining requests (number). -1 means limit exceeded.
const SLIDING_WINDOW_SCRIPT = `
local key    = KEYS[1]
local now    = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit  = tonumber(ARGV[3])

-- Remove entries older than the window
redis.call("ZREMRANGEBYSCORE", key, "-inf", now - window)

local count = redis.call("ZCARD", key)
if count >= limit then
  return -1
end

-- Use microsecond precision member to avoid key collisions within same ms
redis.call("ZADD", key, now, now .. math.random(1, 1000000))
redis.call("PEXPIRE", key, window)
return limit - count - 1
`;

export interface RateLimitOptions {
  /** Max requests per window. Default: 60 */
  limit?: number;
  /** Window size in milliseconds. Default: 60_000 (60s) */
  windowMs?: number;
}

export function rateLimitMiddleware(options: RateLimitOptions = {}): MiddlewareHandler {
  const limit = options.limit ?? 60;
  const windowMs = options.windowMs ?? 60_000;
  const isDev = process.env.NODE_ENV !== "production";

  return async (c, next) => {
    // In dev mode the synthetic userId="local-dev" makes every browser tab
    // share the same bucket, which throttles legitimate dev work. Skip.
    if (isDev) {
      await next();
      return;
    }
    // Use userId if set (auth middleware runs first), else fall back to IP.
    const userId: string = c.get("userId") ?? c.req.header("x-forwarded-for") ?? "anon";
    const route = `${c.req.method}:${c.req.routePath}`;
    const key = `rl:${userId}:${route}`;

    const now = Date.now();

    let remaining: number;
    try {
      const result = await redis.eval(
        SLIDING_WINDOW_SCRIPT,
        1,
        key,
        String(now),
        String(windowMs),
        String(limit),
      );
      remaining = result as number;
    } catch (err) {
      // If Redis is unavailable, fail open (log but continue).
      console.error("[rate-limit] Redis eval error:", (err as Error).message);
      await next();
      return;
    }

    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(Math.max(0, remaining)));
    c.header("X-RateLimit-Window", String(windowMs));

    if (remaining < 0) {
      throw new HTTPException(429, { message: "Rate limit exceeded. Try again shortly." });
    }

    await next();
  };
}
