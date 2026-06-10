/**
 * SSE pub/sub helpers backed by Redis.
 *
 * Flow:
 *  - Publisher calls `publishEvent(channel, payload)` → publishes to Redis.
 *  - The single `redisSub` client subscribes once to "msc:events".
 *  - All Hono SSE connections register a local listener; when Redis delivers
 *    a message, it fans out to every active listener in this process.
 *  - If you run multiple API instances, each has its own set of listeners —
 *    Redis fan-out ensures every instance (and therefore every connected client)
 *    receives the event.
 */

import { redis, redisSub } from "./redis.js";

export const SSE_CHANNEL = "msc:events";

export type SSEEventType =
  | "flavor.updated"
  | "event.updated"
  | "delivery.updated"
  | "flavor_price.updated";

export interface SSEPayload {
  type: SSEEventType;
  data: unknown;
  ts: string;
}

// In-process listener registry: Set of callbacks registered by SSE connections.
type Listener = (raw: string) => void;
const listeners = new Set<Listener>();

let subscribed = false;

/** Boot the Redis subscription once. Called from index.ts at startup. */
export async function startSSESubscription(): Promise<void> {
  if (subscribed) return;
  subscribed = true;

  await redisSub.subscribe(SSE_CHANNEL);
  console.log(`[sse] subscribed to ${SSE_CHANNEL}`);

  redisSub.on("message", (_channel: string, raw: string) => {
    for (const cb of listeners) {
      try {
        cb(raw);
      } catch {
        // Ignore individual listener errors so others keep running.
      }
    }
  });
}

/** Register a listener; returns a cleanup function. */
export function addSSEListener(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Publish an event to all connected SSE clients (across all instances). */
export async function publishEvent(type: SSEEventType, data: unknown): Promise<void> {
  const payload: SSEPayload = { type, data, ts: new Date().toISOString() };
  await redis.publish(SSE_CHANNEL, JSON.stringify(payload));
}
