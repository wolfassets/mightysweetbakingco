import { OpenAPIHono } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { eventItems, flavorPrices } from "../db/schema.js";
import { insertAudit } from "../lib/audit.js";
import { recalcEventTotals } from "../lib/cascade.js";
import { publishEvent } from "../lib/sse.js";
import { authMiddleware } from "../middleware/auth.js";
import { idempotencyMiddleware } from "../middleware/idempotency.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";
import { createEventItemSchema, updateEventItemSchema } from "../validators/event-items.js";

const app = new OpenAPIHono();
app.use("*", authMiddleware);
app.use("*", rateLimitMiddleware());

function normalizeCounts(input: {
  prepared?: number | null;
  remaining?: number | null;
  giveaway?: number | null;
}) {
  const prepared = Math.max(input.prepared ?? 0, 0);
  const remaining = Math.min(Math.max(input.remaining ?? 0, 0), prepared);
  const giveaway = Math.min(Math.max(input.giveaway ?? 0, 0), prepared - remaining);
  const sold = prepared - remaining - giveaway;
  return { prepared, remaining, giveaway, sold };
}

// GET /
app.get("/", async (c) => {
  const raw = c.req.query("eventId");
  const eventId = raw ? Number.parseInt(raw, 10) : undefined;
  const rows = eventId
    ? await db.select().from(eventItems).where(eq(eventItems.eventId, eventId))
    : await db.select().from(eventItems);
  return c.json({ data: rows });
});

// GET /:id
app.get("/:id", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const row = await db.select().from(eventItems).where(eq(eventItems.id, id)).get();
  if (!row) return c.json({ error: { code: "NOT_FOUND", message: "Event item not found" } }, 404);
  return c.json({ data: row });
});

// POST /
app.post("/", idempotencyMiddleware, async (c) => {
  const body = createEventItemSchema.parse(await c.req.json());
  const userId = c.get("userId");

  const [created] = await db.transaction(async (tx) => {
    const rate = body.rateId
      ? await tx.select().from(flavorPrices).where(eq(flavorPrices.id, body.rateId)).get()
      : null;
    const { prepared, remaining, giveaway, sold } = normalizeCounts(body);
    const unitCost = body.unitCost ?? rate?.cost ?? 0;
    const revenue = rate ? sold * rate.price : 0;
    const cogs = sold * unitCost;
    const profit = revenue - cogs;

    const rows = await tx
      .insert(eventItems)
      .values({
        eventId: body.eventId,
        flavorName: body.flavorName,
        prepared,
        remaining,
        giveaway,
        sold,
        revenue,
        unitCost: unitCost || null,
        cogs,
        profit,
        rateId: body.rateId ?? null,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Insert returned no rows");

    await recalcEventTotals(tx as unknown as typeof db, body.eventId);

    await insertAudit(tx as unknown as typeof db, {
      userId,
      entity: "event_item",
      entityId: row.id,
      entityLabel: row.flavorName,
      action: "create",
      after: row,
    });

    return rows;
  });

  await publishEvent("event.updated", { eventId: body.eventId });
  return c.json({ data: created }, 201);
});

// PATCH /:id
app.patch("/:id", idempotencyMiddleware, async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const body = updateEventItemSchema.parse(await c.req.json());
  const userId = c.get("userId");

  const before = await db.select().from(eventItems).where(eq(eventItems.id, id)).get();
  if (!before)
    return c.json({ error: { code: "NOT_FOUND", message: "Event item not found" } }, 404);

  const [updated] = await db.transaction(async (tx) => {
    const counts = normalizeCounts({
      prepared: body.prepared ?? before.prepared ?? 0,
      remaining: body.remaining ?? before.remaining ?? 0,
      giveaway: body.giveaway ?? before.giveaway ?? 0,
    });
    const rateId = body.rateId !== undefined ? body.rateId : before.rateId;
    const rate = rateId
      ? await tx.select().from(flavorPrices).where(eq(flavorPrices.id, rateId)).get()
      : null;
    const unitCost =
      body.unitCost !== undefined
        ? (body.unitCost ?? 0)
        : body.rateId !== undefined
          ? (rate?.cost ?? 0)
          : (before.unitCost ?? rate?.cost ?? 0);
    const revenue = rate ? counts.sold * rate.price : 0;
    const cogs = counts.sold * unitCost;
    const profit = revenue - cogs;

    await tx
      .update(eventItems)
      .set({ ...body, ...counts, unitCost: unitCost || null, revenue, cogs, profit })
      .where(eq(eventItems.id, id));
    await recalcEventTotals(tx as unknown as typeof db, before.eventId);

    const rows = await tx.select().from(eventItems).where(eq(eventItems.id, id));
    const row = rows[0];
    if (!row) throw new Error("Row vanished after update");

    await insertAudit(tx as unknown as typeof db, {
      userId,
      entity: "event_item",
      entityId: id,
      entityLabel: row.flavorName,
      action: "update",
      before,
      after: row,
    });

    return rows;
  });

  await publishEvent("event.updated", { eventId: before.eventId });
  return c.json({ data: updated });
});

// DELETE /:id
app.delete("/:id", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const userId = c.get("userId");

  const before = await db.select().from(eventItems).where(eq(eventItems.id, id)).get();
  if (!before)
    return c.json({ error: { code: "NOT_FOUND", message: "Event item not found" } }, 404);

  await db.transaction(async (tx) => {
    await tx.delete(eventItems).where(eq(eventItems.id, id));
    await recalcEventTotals(tx as unknown as typeof db, before.eventId);
    await insertAudit(tx as unknown as typeof db, {
      userId,
      entity: "event_item",
      entityId: id,
      entityLabel: before.flavorName,
      action: "delete",
      before,
    });
  });

  await publishEvent("event.updated", { eventId: before.eventId });
  return c.json({ data: { deleted: true, id } });
});

export default app;
