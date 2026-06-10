/**
 * Idempotency-Key middleware for POST and PUT requests.
 *
 * If the request carries an `Idempotency-Key` header:
 *  - Check Redis for a cached response. If found, return it immediately.
 *  - If not found, let the request proceed. After the handler returns,
 *    cache the status code + body JSON in Redis for 24 hours.
 *
 * Key format: `idem:<userId>:<idempotencyKey>`
 */

import type { MiddlewareHandler } from "hono";
import { redis } from "../lib/redis.js";

const TTL_SECONDS = 86_400; // 24 hours

interface CachedResponse {
  status: number;
  body: unknown;
}

export const idempotencyMiddleware: MiddlewareHandler = async (c, next) => {
  // Only applies to state-changing methods.
  if (c.req.method !== "POST" && c.req.method !== "PUT") {
    await next();
    return;
  }

  const idempotencyKey = c.req.header("Idempotency-Key");
  if (!idempotencyKey) {
    await next();
    return;
  }

  const userId: string = c.get("userId") ?? "anon";
  const redisKey = `idem:${userId}:${idempotencyKey}`;

  // Check for a cached response.
  let cached: string | null = null;
  try {
    cached = await redis.get(redisKey);
  } catch (err) {
    console.error("[idempotency] Redis get error:", (err as Error).message);
  }

  if (cached) {
    const parsed = JSON.parse(cached) as CachedResponse;
    c.header("X-Idempotency-Replayed", "true");
    return c.json(parsed.body, parsed.status as Parameters<typeof c.json>[1]);
  }

  // Let the handler run.
  await next();

  // Only cache 2xx responses — caching a 500 would replay errors for 24h.
  if (c.res.status < 200 || c.res.status >= 300) return;

  // Cache the response for 24h (best-effort; don't fail the request if Redis is down).
  try {
    const responseBody = await c.res.clone().json();
    const entry: CachedResponse = { status: c.res.status, body: responseBody };
    await redis.setex(redisKey, TTL_SECONDS, JSON.stringify(entry));
  } catch (err) {
    console.error("[idempotency] failed to cache response:", (err as Error).message);
  }
};
