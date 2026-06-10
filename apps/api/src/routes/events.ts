import { OpenAPIHono } from "@hono/zod-openapi";
import { desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { events, eventItems } from "../db/schema.js";
import { insertAudit } from "../lib/audit.js";
import { recalcEventTotals } from "../lib/cascade.js";
import { publishEvent } from "../lib/sse.js";
import { authMiddleware } from "../middleware/auth.js";
import { idempotencyMiddleware } from "../middleware/idempotency.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";
import {
  createEventSchema,
  hardDeleteQuerySchema,
  updateEventSchema,
} from "../validators/events.js";

const app = new OpenAPIHono();
app.use("*", authMiddleware);
app.use("*", rateLimitMiddleware());

// GET /
app.get("/", async (c) => {
  const archived = c.req.query("archived") === "true";
  const rows = archived
    ? await db
        .select()
        .from(events)
        .where(isNotNull(events.deletedAt))
        .orderBy(desc(events.eventDate), desc(events.id))
    : await db
        .select()
        .from(events)
        .where(isNull(events.deletedAt))
        .orderBy(desc(events.eventDate), desc(events.id));
  return c.json({ data: rows });
});

// GET /:id
app.get("/:id", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const event = await db.select().from(events).where(eq(events.id, id)).get();
  if (!event) return c.json({ error: { code: "NOT_FOUND", message: "Event not found" } }, 404);
  const items = await db.select().from(eventItems).where(eq(eventItems.eventId, id));
  return c.json({ data: { ...event, items } });
});

// POST /
app.post("/", idempotencyMiddleware, async (c) => {
  const body = createEventSchema.parse(await c.req.json());
  const userId = c.get("userId");

  const [created] = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(events)
      .values({
        name: body.name,
        eventDate: body.eventDate,
        location: body.location ?? null,
        eventCost: body.eventCost ?? 0,
        cashCollected: body.cashCollected ?? 0,
        venmoCollected: body.venmoCollected ?? 0,
        otherCollected: body.otherCollected ?? 0,
        notes: body.notes ?? null,
        totalPrepared: 0,
        totalSold: 0,
        totalGiveaway: 0,
        totalRevenue: 0,
        totalCost: 0,
        netProfit: 0,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Insert returned no rows");

    await insertAudit(tx as unknown as typeof db, {
      userId,
      entity: "event",
      entityId: row.id,
      entityLabel: row.name,
      action: "create",
      after: row,
    });

    return rows;
  });

  await publishEvent("event.updated", created);
  return c.json({ data: created }, 201);
});

// PATCH /:id
app.patch("/:id", idempotencyMiddleware, async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const body = updateEventSchema.parse(await c.req.json());
  const userId = c.get("userId");

  const before = await db.select().from(events).where(eq(events.id, id)).get();
  if (!before) return c.json({ error: { code: "NOT_FOUND", message: "Event not found" } }, 404);

  const [updated] = await db.transaction(async (tx) => {
    await tx.update(events).set(body).where(eq(events.id, id));
    await recalcEventTotals(tx as unknown as typeof db, id);
    const rows = await tx.select().from(events).where(eq(events.id, id));
    const row = rows[0];
    if (!row) throw new Error("Row vanished after update");

    await insertAudit(tx as unknown as typeof db, {
      userId,
      entity: "event",
      entityId: id,
      entityLabel: row.name,
      action: "update",
      before,
      after: row,
    });

    return rows;
  });

  await publishEvent("event.updated", updated);
  return c.json({ data: updated });
});

// DELETE /:id
app.delete("/:id", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const hard = hardDeleteQuerySchema.parse({ hard: c.req.query("hard") }).hard;
  const userId = c.get("userId");

  const before = await db.select().from(events).where(eq(events.id, id)).get();
  if (!before) return c.json({ error: { code: "NOT_FOUND", message: "Event not found" } }, 404);

  await db.transaction(async (tx) => {
    if (hard) {
      await tx.delete(eventItems).where(eq(eventItems.eventId, id));
      await tx.delete(events).where(eq(events.id, id));
    } else {
      await tx.update(events).set({ deletedAt: new Date().toISOString() }).where(eq(events.id, id));
    }

    await insertAudit(tx as unknown as typeof db, {
      userId,
      entity: "event",
      entityId: id,
      entityLabel: before.name,
      action: "delete",
      before,
    });
  });

  await publishEvent("event.updated", { id, deleted: true, hard });
  return c.json({ data: { deleted: true, id, hard } });
});

export default app;
