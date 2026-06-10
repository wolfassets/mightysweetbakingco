# apps/api — Hono backend

Standalone REST + SSE service. Runs on `:3000`. Serves `apps/web-b`.

## Stack

- Hono 4 + `@hono/node-server`
- `@hono/zod-openapi` (OpenAPI spec at `/openapi.json`, Swagger UI at `/docs`)
- Zod v3 validators (`src/validators/`)
- Drizzle + `@libsql/client` (Turso)
- Redis via `ioredis` (rate-limit + idempotency + SSE pub/sub)
- `tsx watch` for dev. `tsc → node dist/index.js` for prod (not wired yet)
- Biome for lint/format

## Run

```bash
pnpm dev               # from this dir, or `pnpm dev:api` from repo root
```

Requires Redis: `redis-cli ping` → `PONG`. The api throws on boot if
`startSSESubscription()` can't connect to Redis.

## Endpoint shape

- Success: `{ data: T }` (single object or array)
- Error: `{ error: { code: "NOT_FOUND" | "RATE_LIMITED" | "UNAUTHORIZED" | "INTERNAL_ERROR", message: string } }`
- POST → 201, others → 200, missing rows → 404.

The frontend's `app/api.ts` proxy unwraps `.data` automatically, so most
components don't see the envelope.

## Routes (mount → file)

| Mount | File | Notes |
|---|---|---|
| `/flavors` | `routes/flavors.ts` | Soft-archive on DELETE; `?hard=true` hard-deletes + unlinks rateId on items |
| `/flavor-prices` | `routes/flavor-prices.ts` | Same soft/hard pattern. PATCH cascades to linked items in same tx |
| `/events` | `routes/events.ts` | Recalc totals after item changes |
| `/event-items` | `routes/event-items.ts` | Server computes revenue/cogs/profit |
| `/deliveries` | `routes/deliveries.ts` | Auto-computes `expirationDate` = `datePrepared + 7d` |
| `/delivery-items` | `routes/delivery-items.ts` | `unsold` field clamped to [0, prepared]; revenue = (prepared − unsold) × unitPrice |
| `/audit-log` | `routes/audit-log.ts` | Read-only feed. Supports `entityType`, `action`, `from`, `to`, `limit` query params |
| `/stream` | `routes/stream.ts` | SSE; emits `flavor.updated`, `event.updated`, `delivery.updated`, `flavor_price.updated` |
| `/health` | `index.ts` | No auth, no rate-limit. Liveness probe |
| `/openapi.json`, `/docs` | `index.ts` | OpenAPI spec + Swagger UI |

## Middleware order

Per-route mount, in order:

1. `authMiddleware` — currently a no-op (Clerk stripped). Sets `userId='local-dev'`.
2. `rateLimitMiddleware()` — sliding window via Redis Lua, 60 req/min/route. **Bypassed in dev** (`NODE_ENV !== production`).
3. `idempotencyMiddleware` (POST/PATCH only) — 24h cache of 2xx responses by `Idempotency-Key` header.

## Transactional guarantees

Every mutating handler runs the DB write + `insertAudit` + cascade
updates in a single Drizzle `tx.transaction()`. Audit failure = whole
op rolls back. The audit row carries `entityLabel` so the Activity
feed shows names instead of `#42`.

## After-commit side effects

After tx commits, each handler calls `publishEvent(<topic>, payload)` to
Redis. The `/stream` endpoint fans this out via SSE. **If Redis is down,
the publish silently fails-open** — the data write committed, but
real-time clients won't see the update until refresh.

## Indexes

`src/db/indexes.ts` runs `CREATE INDEX IF NOT EXISTS` on boot for:
- `delivery_items.delivery_id`, `event_items.event_id`
- `delivery_items.rate_id`, `event_items.rate_id`
- `flavor_prices.flavor_id`
- `deliveries.date_prepared`, `deliveries.deleted_at`
- `events.event_date`, `events.deleted_at`
- `audit_log.created_at` (DESC), `audit_log.entity_type+entity_id`

Boot log: `[db] verified 11 indexes`.

## Don't ship to prod without

1. Reinstating auth in `src/middleware/auth.ts` (Clerk or replacement).
2. Setting `CORS_ORIGINS` env to the prod frontend domain (not localhost).
3. Body-size limit (`bodyLimit({ maxSize: 1_000_000 })`) — currently
   unbounded.
4. Building to `dist/` and running `node dist/index.js` (not `tsx watch`).
5. Moving Turso credentials out of `.env` into a secret manager.
