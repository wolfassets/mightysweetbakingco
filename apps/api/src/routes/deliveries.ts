import { OpenAPIHono } from "@hono/zod-openapi";
import { desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { deliveries, deliveryItems } from "../db/schema.js";
import { insertAudit } from "../lib/audit.js";
import { publishEvent } from "../lib/sse.js";
import { authMiddleware } from "../middleware/auth.js";
import { idempotencyMiddleware } from "../middleware/idempotency.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";
import {
  createDeliverySchema,
  hardDeleteQuerySchema,
  updateDeliverySchema,
} from "../validators/deliveries.js";

const app = new OpenAPIHono();
app.use("*", authMiddleware);
app.use("*", rateLimitMiddleware());

function calculateExpirationDate(datePrepared: string): string {
  const date = new Date(`${datePrepared}T00:00:00`);
  date.setDate(date.getDate() + 7);
  return date.toISOString().split("T")[0] ?? datePrepared;
}

// GET /
app.get("/", async (c) => {
  const archived = c.req.query("archived") === "true";
  const rows = archived
    ? await db
        .select()
        .from(deliveries)
        .where(isNotNull(deliveries.deletedAt))
        .orderBy(desc(deliveries.datePrepared))
    : await db
        .select()
        .from(deliveries)
        .where(isNull(deliveries.deletedAt))
        .orderBy(desc(deliveries.datePrepared));
  return c.json({ data: rows });
});

// GET /:id
app.get("/:id", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const delivery = await db.select().from(deliveries).where(eq(deliveries.id, id)).get();
  if (!delivery)
    return c.json({ error: { code: "NOT_FOUND", message: "Delivery not found" } }, 404);
  const items = await db.select().from(deliveryItems).where(eq(deliveryItems.deliveryId, id));
  return c.json({ data: { ...delivery, items } });
});

// POST /
app.post("/", idempotencyMiddleware, async (c) => {
  const body = createDeliverySchema.parse(await c.req.json());
  const userId = c.get("userId");
  const expirationDate = calculateExpirationDate(body.datePrepared);

  const [created] = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(deliveries)
      .values({
        storeName: body.storeName,
        location: body.location ?? null,
        datePrepared: body.datePrepared,
        dropoffDate: body.dropoffDate ?? null,
        expirationDate,
        notes: body.notes ?? null,
        invoiceNotes: body.invoiceNotes ?? null,
        additionalFees: body.additionalFees ?? 0,
        discount: body.discount ?? 0,
        prepaidAmount: body.prepaidAmount ?? 0,
        cashCollected: body.cashCollected ?? 0,
        venmoCollected: body.venmoCollected ?? 0,
        otherCollected: body.otherCollected ?? 0,
        totalPrepared: 0,
        totalCogs: 0,
        totalRevenue: 0,
        grossProfit: 0,
        profitMargin: 0,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Insert returned no rows");

    await insertAudit(tx as unknown as typeof db, {
      userId,
      entity: "delivery",
      entityId: row.id,
      entityLabel: row.storeName,
      action: "create",
      after: row,
    });

    return rows;
  });

  await publishEvent("delivery.updated", created);
  return c.json({ data: created }, 201);
});

// PATCH /:id
app.patch("/:id", idempotencyMiddleware, async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const body = updateDeliverySchema.parse(await c.req.json());
  const userId = c.get("userId");

  const before = await db.select().from(deliveries).where(eq(deliveries.id, id)).get();
  if (!before) return c.json({ error: { code: "NOT_FOUND", message: "Delivery not found" } }, 404);

  const expirationDate = body.datePrepared ? calculateExpirationDate(body.datePrepared) : undefined;

  const patchValues = expirationDate ? { ...body, expirationDate } : { ...body };

  const [updated] = await db.transaction(async (tx) => {
    await tx.update(deliveries).set(patchValues).where(eq(deliveries.id, id));
    const rows = await tx.select().from(deliveries).where(eq(deliveries.id, id));
    const row = rows[0];
    if (!row) throw new Error("Row vanished after update");

    await insertAudit(tx as unknown as typeof db, {
      userId,
      entity: "delivery",
      entityId: id,
      entityLabel: row.storeName,
      action: "update",
      before,
      after: row,
    });

    return rows;
  });

  await publishEvent("delivery.updated", updated);
  return c.json({ data: updated });
});

// DELETE /:id
app.delete("/:id", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const hard = hardDeleteQuerySchema.parse({ hard: c.req.query("hard") }).hard;
  const userId = c.get("userId");

  const before = await db.select().from(deliveries).where(eq(deliveries.id, id)).get();
  if (!before) return c.json({ error: { code: "NOT_FOUND", message: "Delivery not found" } }, 404);

  await db.transaction(async (tx) => {
    if (hard) {
      await tx.delete(deliveryItems).where(eq(deliveryItems.deliveryId, id));
      await tx.delete(deliveries).where(eq(deliveries.id, id));
    } else {
      await tx
        .update(deliveries)
        .set({ deletedAt: new Date().toISOString() })
        .where(eq(deliveries.id, id));
    }

    await insertAudit(tx as unknown as typeof db, {
      userId,
      entity: "delivery",
      entityId: id,
      entityLabel: before.storeName,
      action: "delete",
      before,
    });
  });

  await publishEvent("delivery.updated", { id, deleted: true, hard });
  return c.json({ data: { deleted: true, id, hard } });
});

export default app;
