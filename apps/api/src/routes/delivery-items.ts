import { OpenAPIHono } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { deliveryItems } from "../db/schema.js";
import { insertAudit } from "../lib/audit.js";
import { recalcDeliveryTotals } from "../lib/cascade.js";
import { publishEvent } from "../lib/sse.js";
import { authMiddleware } from "../middleware/auth.js";
import { idempotencyMiddleware } from "../middleware/idempotency.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";
import {
  createDeliveryItemSchema,
  updateDeliveryItemSchema,
} from "../validators/delivery-items.js";

const app = new OpenAPIHono();
app.use("*", authMiddleware);
app.use("*", rateLimitMiddleware());

// GET /
app.get("/", async (c) => {
  const raw = c.req.query("deliveryId");
  const deliveryId = raw ? Number.parseInt(raw, 10) : undefined;
  const rows = deliveryId
    ? await db.select().from(deliveryItems).where(eq(deliveryItems.deliveryId, deliveryId))
    : await db.select().from(deliveryItems);
  return c.json({ data: rows });
});

// GET /:id
app.get("/:id", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const row = await db.select().from(deliveryItems).where(eq(deliveryItems.id, id)).get();
  if (!row)
    return c.json({ error: { code: "NOT_FOUND", message: "Delivery item not found" } }, 404);
  return c.json({ data: row });
});

// POST /
app.post("/", idempotencyMiddleware, async (c) => {
  const body = createDeliveryItemSchema.parse(await c.req.json());
  const userId = c.get("userId");

  const prepared = body.prepared ?? 0;
  const unsold = Math.min(Math.max(body.unsold ?? 0, 0), prepared);
  const unitPrice = body.unitPrice ?? null;
  const unitCost = body.unitCost ?? null;
  const effectiveSold = prepared - unsold;
  const revenue = unitPrice != null ? effectiveSold * unitPrice : (body.revenue ?? 0);
  const cogs = unitCost != null ? prepared * unitCost : (body.cogs ?? 0);
  const profit = revenue - cogs;

  const [created] = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(deliveryItems)
      .values({
        deliveryId: body.deliveryId,
        flavorName: body.flavorName,
        prepared,
        unsold,
        unitPrice,
        unitCost,
        revenue,
        cogs,
        profit,
        rateId: body.rateId ?? null,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Insert returned no rows");

    await recalcDeliveryTotals(tx as unknown as typeof db, body.deliveryId);

    await insertAudit(tx as unknown as typeof db, {
      userId,
      entity: "delivery_item",
      entityId: row.id,
      entityLabel: row.flavorName,
      action: "create",
      after: row,
    });

    return rows;
  });

  await publishEvent("delivery.updated", { deliveryId: body.deliveryId });
  return c.json({ data: created }, 201);
});

// PATCH /:id
app.patch("/:id", idempotencyMiddleware, async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const body = updateDeliveryItemSchema.parse(await c.req.json());
  const userId = c.get("userId");

  const before = await db.select().from(deliveryItems).where(eq(deliveryItems.id, id)).get();
  if (!before)
    return c.json({ error: { code: "NOT_FOUND", message: "Delivery item not found" } }, 404);

  const [updated] = await db.transaction(async (tx) => {
    const prepared = body.prepared ?? before.prepared ?? 0;
    const unsoldRaw = body.unsold ?? before.unsold ?? 0;
    const unsold = Math.min(Math.max(unsoldRaw, 0), prepared);
    const unitPrice = body.unitPrice !== undefined ? body.unitPrice : (before.unitPrice ?? null);
    const unitCost = body.unitCost !== undefined ? body.unitCost : (before.unitCost ?? null);
    const effectiveSold = prepared - unsold;
    const revenue =
      unitPrice != null ? effectiveSold * unitPrice : (body.revenue ?? before.revenue ?? 0);
    const cogs = unitCost != null ? prepared * unitCost : (body.cogs ?? before.cogs ?? 0);
    const profit = revenue - cogs;

    await tx
      .update(deliveryItems)
      .set({ ...body, unsold, unitPrice, unitCost, revenue, cogs, profit })
      .where(eq(deliveryItems.id, id));

    await recalcDeliveryTotals(tx as unknown as typeof db, before.deliveryId);

    const rows = await tx.select().from(deliveryItems).where(eq(deliveryItems.id, id));
    const row = rows[0];
    if (!row) throw new Error("Row vanished after update");

    await insertAudit(tx as unknown as typeof db, {
      userId,
      entity: "delivery_item",
      entityId: id,
      entityLabel: row.flavorName,
      action: "update",
      before,
      after: row,
    });

    return rows;
  });

  await publishEvent("delivery.updated", { deliveryId: before.deliveryId });
  return c.json({ data: updated });
});

// DELETE /:id
app.delete("/:id", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const userId = c.get("userId");

  const before = await db.select().from(deliveryItems).where(eq(deliveryItems.id, id)).get();
  if (!before)
    return c.json({ error: { code: "NOT_FOUND", message: "Delivery item not found" } }, 404);

  await db.transaction(async (tx) => {
    await tx.delete(deliveryItems).where(eq(deliveryItems.id, id));
    await recalcDeliveryTotals(tx as unknown as typeof db, before.deliveryId);
    await insertAudit(tx as unknown as typeof db, {
      userId,
      entity: "delivery_item",
      entityId: id,
      entityLabel: before.flavorName,
      action: "delete",
      before,
    });
  });

  await publishEvent("delivery.updated", { deliveryId: before.deliveryId });
  return c.json({ data: { deleted: true, id } });
});

export default app;
