/**
 * GET /stream — Server-Sent Events endpoint.
 *
 * Holds the connection open and pushes events to the client as they happen.
 * Events originate from Redis pub/sub (see lib/sse.ts), so multiple API
 * instances fan out to all connected clients automatically.
 *
 * Protocol (SSE wire format):
 *   data: {"type":"flavor.updated","data":{...},"ts":"2026-04-22T00:00:00.000Z"}\n\n
 *
 * Clients reconnect automatically — the browser EventSource API does this
 * natively; the iOS swift-openapi-generator client should do the same.
 *
 * Auth: Clerk JWT via Authorization: Bearer <token>.
 * Rate-limit: 10 new connections per minute per user.
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { addSSEListener } from "../lib/sse.js";
import { authMiddleware } from "../middleware/auth.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";

const app = new Hono();
app.use("*", authMiddleware);
app.use("*", rateLimitMiddleware({ limit: 10, windowMs: 60_000 }));

app.get("/", async (c) => {
  const userId = c.get("userId");
  console.log(`[sse] client connected: ${userId}`);

  return streamSSE(
    c,
    async (stream) => {
      // Initial ping so the client knows the stream is alive.
      await stream.writeSSE({
        event: "connected",
        data: JSON.stringify({ ts: new Date().toISOString(), userId }),
      });

      // Keep-alive pings every 25 s (many proxies close idle SSE after 30 s).
      const pingInterval = setInterval(() => {
        if (stream.aborted) return;
        stream.writeSSE({ event: "ping", data: new Date().toISOString() }).catch(() => {
          // Client disconnected — the abort handler below cleans up.
        });
      }, 25_000);

      // Register for Redis-delivered events.
      const removeListener = addSSEListener((raw) => {
        if (stream.aborted) return;
        stream.writeSSE({ data: raw }).catch(() => {
          // Ignore — stream is closed.
        });
      });

      // Block until the client disconnects.
      // streamSSE holds the handler open; we use a never-resolving promise
      // that we cancel via `stream.abort()` when needed.
      await new Promise<void>((resolve) => {
        // Poll for abort every 500 ms — lightweight for long-lived connections.
        const abortPoller = setInterval(() => {
          if (stream.aborted) {
            clearInterval(abortPoller);
            resolve();
          }
        }, 500);

        // Also resolve when the stream is explicitly closed.
        stream.close().then(resolve).catch(resolve);
      });

      // Cleanup.
      clearInterval(pingInterval);
      removeListener();
      console.log(`[sse] client disconnected: ${userId}`);
    },
    async (err, stream) => {
      console.error(`[sse] stream error for ${userId}:`, err.message);
      await stream.writeSSE({ event: "error", data: err.message });
    },
  );
});

export default app;
