/**
 * Mighty Sweet Cookies — Hono API service
 *
 * Entry point. Mounts all routes, registers OpenAPI spec, starts the HTTP server.
 */

import { serve } from "@hono/node-server";
import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { compress } from "hono/compress";
import { cors } from "hono/cors";

import { ensureIndexes } from "./db/indexes.js";
import { extractIp, requestContext } from "./lib/request-context.js";
import { startSSESubscription } from "./lib/sse.js";

import auditLogRouter from "./routes/audit-log.js";
import deliveriesRouter from "./routes/deliveries.js";
import deliveryItemsRouter from "./routes/delivery-items.js";
import eventItemsRouter from "./routes/event-items.js";
import eventsRouter from "./routes/events.js";
import flavorPricesRouter from "./routes/flavor-prices.js";
import flavorsRouter from "./routes/flavors.js";
import streamRouter from "./routes/stream.js";

import {
  createDeliverySchema,
  hardDeleteQuerySchema as deliveryHardDelete,
  listDeliveriesQuerySchema,
  updateDeliverySchema,
} from "./validators/deliveries.js";
import {
  createDeliveryItemSchema,
  listDeliveryItemsQuerySchema,
  updateDeliveryItemSchema,
} from "./validators/delivery-items.js";
import {
  createEventItemSchema,
  listEventItemsQuerySchema,
  updateEventItemSchema,
} from "./validators/event-items.js";
import {
  createEventSchema,
  hardDeleteQuerySchema as eventHardDelete,
  listEventsQuerySchema,
  updateEventSchema,
} from "./validators/events.js";
import {
  createFlavorPriceSchema,
  listFlavorPricesQuerySchema,
  updateFlavorPriceSchema,
} from "./validators/flavor-prices.js";
// ---------------------------------------------------------------------------
// Import validators for OpenAPI spec
// ---------------------------------------------------------------------------
import {
  createFlavorSchema,
  listFlavorsQuerySchema,
  updateFlavorSchema,
} from "./validators/flavors.js";

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// CORS — must be registered before any route. Browser preflights every
// non-GET request because the frontend sends Content-Type: application/json.
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS = (
  process.env.CORS_ORIGINS ?? "http://localhost:4001,http://localhost:4000,http://localhost:3000"
)
  .split(",")
  .map((s) => s.trim());

app.use(
  "*",
  cors({
    origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]),
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "X-Requested-With"],
    exposeHeaders: ["X-Idempotency-Replayed"],
    maxAge: 600,
    credentials: false,
  }),
);

// gzip / deflate JSON responses. Big win on list endpoints (deliveries, audit-log).
app.use("*", compress());

// Request-scoped context: capture client IP into AsyncLocalStorage so that
// `insertAudit` can persist it without every route handler passing it through.
app.use("*", async (c, next) => {
  const remote = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)
    ?.incoming?.socket?.remoteAddress;
  const ip = extractIp((n) => c.req.header(n), remote ?? null);
  await requestContext.run({ ip, userId: null }, async () => {
    await next();
  });
});

// ---------------------------------------------------------------------------
// Health check (no auth)
// ---------------------------------------------------------------------------

app.get("/health", (c) =>
  c.json({ status: "ok", version: "cicd-test-1", ts: new Date().toISOString() }),
);

// ---------------------------------------------------------------------------
// Mount routers
// ---------------------------------------------------------------------------

app.route("/flavors", flavorsRouter);
app.route("/events", eventsRouter);
app.route("/event-items", eventItemsRouter);
app.route("/deliveries", deliveriesRouter);
app.route("/delivery-items", deliveryItemsRouter);
app.route("/flavor-prices", flavorPricesRouter);
app.route("/audit-log", auditLogRouter);
app.route("/stream", streamRouter);

// ---------------------------------------------------------------------------
// OpenAPI component registrations
// ---------------------------------------------------------------------------

// Register Bearer auth scheme via the registry (components cannot be passed to app.doc()).
app.openAPIRegistry.registerComponent("securitySchemes", "BearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: "Clerk-issued JWT — obtain from the Clerk frontend SDK.",
});

// ---------------------------------------------------------------------------
// OpenAPI path registrations (for spec generation at GET /openapi.json)
// All paths are absolute — they must match what the mounted routers serve.
// ---------------------------------------------------------------------------

const anyResp = (desc: string) => ({
  description: desc,
  content: { "application/json": { schema: z.object({ data: z.any() }) } },
});
const errResp = (desc: string) => ({
  description: desc,
  content: { "application/json": { schema: z.object({ error: z.any() }) } },
});

// --- Flavors ---
app.openAPIRegistry.registerPath(
  createRoute({
    method: "get",
    path: "/flavors",
    tags: ["Flavors"],
    summary: "List flavors",
    request: { query: listFlavorsQuerySchema },
    responses: { 200: anyResp("List") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "get",
    path: "/flavors/{id}",
    tags: ["Flavors"],
    summary: "Get flavor",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: anyResp("Flavor"), 404: errResp("Not found") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "post",
    path: "/flavors",
    tags: ["Flavors"],
    summary: "Create flavor",
    request: { body: { content: { "application/json": { schema: createFlavorSchema } } } },
    responses: { 201: anyResp("Created") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "patch",
    path: "/flavors/{id}",
    tags: ["Flavors"],
    summary: "Update flavor",
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { "application/json": { schema: updateFlavorSchema } } },
    },
    responses: { 200: anyResp("Updated"), 404: errResp("Not found") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "delete",
    path: "/flavors/{id}",
    tags: ["Flavors"],
    summary: "Delete flavor",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: anyResp("Deleted"), 404: errResp("Not found") },
  }),
);

// --- Events ---
app.openAPIRegistry.registerPath(
  createRoute({
    method: "get",
    path: "/events",
    tags: ["Events"],
    summary: "List events",
    request: { query: listEventsQuerySchema },
    responses: { 200: anyResp("List") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "get",
    path: "/events/{id}",
    tags: ["Events"],
    summary: "Get event",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: anyResp("Event with items"), 404: errResp("Not found") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "post",
    path: "/events",
    tags: ["Events"],
    summary: "Create event",
    request: { body: { content: { "application/json": { schema: createEventSchema } } } },
    responses: { 201: anyResp("Created") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "patch",
    path: "/events/{id}",
    tags: ["Events"],
    summary: "Update event",
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { "application/json": { schema: updateEventSchema } } },
    },
    responses: { 200: anyResp("Updated"), 404: errResp("Not found") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "delete",
    path: "/events/{id}",
    tags: ["Events"],
    summary: "Delete event",
    request: { params: z.object({ id: z.string() }), query: eventHardDelete },
    responses: { 200: anyResp("Deleted"), 404: errResp("Not found") },
  }),
);

// --- EventItems ---
app.openAPIRegistry.registerPath(
  createRoute({
    method: "get",
    path: "/event-items",
    tags: ["EventItems"],
    summary: "List event items",
    request: { query: listEventItemsQuerySchema },
    responses: { 200: anyResp("List") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "get",
    path: "/event-items/{id}",
    tags: ["EventItems"],
    summary: "Get event item",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: anyResp("EventItem"), 404: errResp("Not found") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "post",
    path: "/event-items",
    tags: ["EventItems"],
    summary: "Create event item",
    request: { body: { content: { "application/json": { schema: createEventItemSchema } } } },
    responses: { 201: anyResp("Created") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "patch",
    path: "/event-items/{id}",
    tags: ["EventItems"],
    summary: "Update event item",
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { "application/json": { schema: updateEventItemSchema } } },
    },
    responses: { 200: anyResp("Updated"), 404: errResp("Not found") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "delete",
    path: "/event-items/{id}",
    tags: ["EventItems"],
    summary: "Delete event item",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: anyResp("Deleted"), 404: errResp("Not found") },
  }),
);

// --- Deliveries ---
app.openAPIRegistry.registerPath(
  createRoute({
    method: "get",
    path: "/deliveries",
    tags: ["Deliveries"],
    summary: "List deliveries",
    request: { query: listDeliveriesQuerySchema },
    responses: { 200: anyResp("List") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "get",
    path: "/deliveries/{id}",
    tags: ["Deliveries"],
    summary: "Get delivery",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: anyResp("Delivery with items"), 404: errResp("Not found") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "post",
    path: "/deliveries",
    tags: ["Deliveries"],
    summary: "Create delivery",
    request: { body: { content: { "application/json": { schema: createDeliverySchema } } } },
    responses: { 201: anyResp("Created") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "patch",
    path: "/deliveries/{id}",
    tags: ["Deliveries"],
    summary: "Update delivery",
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { "application/json": { schema: updateDeliverySchema } } },
    },
    responses: { 200: anyResp("Updated"), 404: errResp("Not found") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "delete",
    path: "/deliveries/{id}",
    tags: ["Deliveries"],
    summary: "Delete delivery",
    request: { params: z.object({ id: z.string() }), query: deliveryHardDelete },
    responses: { 200: anyResp("Deleted"), 404: errResp("Not found") },
  }),
);

// --- DeliveryItems ---
app.openAPIRegistry.registerPath(
  createRoute({
    method: "get",
    path: "/delivery-items",
    tags: ["DeliveryItems"],
    summary: "List delivery items",
    request: { query: listDeliveryItemsQuerySchema },
    responses: { 200: anyResp("List") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "get",
    path: "/delivery-items/{id}",
    tags: ["DeliveryItems"],
    summary: "Get delivery item",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: anyResp("DeliveryItem"), 404: errResp("Not found") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "post",
    path: "/delivery-items",
    tags: ["DeliveryItems"],
    summary: "Create delivery item",
    request: { body: { content: { "application/json": { schema: createDeliveryItemSchema } } } },
    responses: { 201: anyResp("Created") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "patch",
    path: "/delivery-items/{id}",
    tags: ["DeliveryItems"],
    summary: "Update delivery item",
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { "application/json": { schema: updateDeliveryItemSchema } } },
    },
    responses: { 200: anyResp("Updated"), 404: errResp("Not found") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "delete",
    path: "/delivery-items/{id}",
    tags: ["DeliveryItems"],
    summary: "Delete delivery item",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: anyResp("Deleted"), 404: errResp("Not found") },
  }),
);

// --- FlavorPrices ---
app.openAPIRegistry.registerPath(
  createRoute({
    method: "get",
    path: "/flavor-prices",
    tags: ["FlavorPrices"],
    summary: "List flavor prices",
    request: { query: listFlavorPricesQuerySchema },
    responses: { 200: anyResp("List") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "get",
    path: "/flavor-prices/{id}",
    tags: ["FlavorPrices"],
    summary: "Get flavor price",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: anyResp("FlavorPrice"), 404: errResp("Not found") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "post",
    path: "/flavor-prices",
    tags: ["FlavorPrices"],
    summary: "Create flavor price",
    request: { body: { content: { "application/json": { schema: createFlavorPriceSchema } } } },
    responses: { 201: anyResp("Created") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "patch",
    path: "/flavor-prices/{id}",
    tags: ["FlavorPrices"],
    summary: "Update flavor price (cascades atomically)",
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { "application/json": { schema: updateFlavorPriceSchema } } },
    },
    responses: { 200: anyResp("Updated"), 404: errResp("Not found") },
  }),
);
app.openAPIRegistry.registerPath(
  createRoute({
    method: "delete",
    path: "/flavor-prices/{id}",
    tags: ["FlavorPrices"],
    summary: "Delete flavor price",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: anyResp("Deleted"), 404: errResp("Not found") },
  }),
);

// --- SSE Stream ---
app.openAPIRegistry.registerPath(
  createRoute({
    method: "get",
    path: "/stream",
    tags: ["Stream"],
    summary:
      "Server-Sent Events stream (events: flavor.updated, event.updated, delivery.updated, flavor_price.updated)",
    responses: {
      200: {
        description: "SSE stream (text/event-stream)",
        content: { "text/event-stream": { schema: z.string() } },
      },
      401: errResp("Unauthorized"),
    },
  }),
);

// --- Health ---
app.openAPIRegistry.registerPath(
  createRoute({
    method: "get",
    path: "/health",
    tags: ["System"],
    summary: "Health check",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: z.object({ status: z.string(), ts: z.string() }) },
        },
      },
    },
  }),
);

// ---------------------------------------------------------------------------
// OpenAPI JSON spec
// ---------------------------------------------------------------------------

app.doc("/openapi.json", {
  openapi: "3.0.0",
  info: {
    title: "Mighty Sweet Cookies API",
    version: "1.0.0",
    description: [
      "Bakery business management API for Mighty Sweet Cookies.",
      "",
      "**Authentication**: All endpoints (except /health and /openapi.json) require",
      "`Authorization: Bearer <clerk-jwt>` header.",
      "",
      "**Response envelope**: Success → `{ data: T }` | Error → `{ error: { code, message } }`",
      "",
      "**Idempotency**: POST/PUT requests accept `Idempotency-Key` header (cached 24h).",
      "",
      "**Rate limiting**: Sliding window — 60 req/min per user per route.",
    ].join("\n"),
  },
  servers: [
    { url: "https://api.mightysweetcookies.com", description: "Production" },
    { url: "http://localhost:3000", description: "Local dev" },
  ],
  security: [{ BearerAuth: [] }],
});

// Swagger UI at /docs
app.get("/docs", swaggerUI({ url: "/openapi.json" }));

// ---------------------------------------------------------------------------
// Global error handler — always returns the response envelope
// ---------------------------------------------------------------------------

app.onError((err, c) => {
  const status = "status" in err ? (err.status as number) : 500;
  const message = err.message ?? "Internal server error";
  console.error(`[error] ${c.req.method} ${c.req.url} → ${status}: ${message}`);

  const code = status === 429 ? "RATE_LIMITED" : status === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR";

  return c.json({ error: { code, message } }, status as Parameters<typeof c.json>[1]);
});

app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Route not found" } }, 404));

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT ?? 3000);

// Start Redis SSE subscription before accepting connections.
await startSSESubscription();

// Ensure DB indexes exist (idempotent, runs once per boot).
await ensureIndexes();

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`msc-api listening on http://localhost:${info.port}`);
  console.log(`OpenAPI spec  → http://localhost:${info.port}/openapi.json`);
  console.log(`Swagger UI    → http://localhost:${info.port}/docs`);
});

export default app;
