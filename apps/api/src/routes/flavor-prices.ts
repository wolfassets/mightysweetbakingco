/**
 * Flavor-prices route.
 *
 * The PATCH handler wraps everything — including the cascade across
 * delivery_items and event_items — in a single Drizzle transaction.
 * Atomic or nothing.
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { deliveryItems, eventItems, flavorPrices } from "../db/schema.js";
import { insertAudit } from "../lib/audit.js";
import { cascadeFlavorPrice } from "../lib/cascade.js";
import { publishEvent } from "../lib/sse.js";
import { authMiddleware } from "../middleware/auth.js";
import { idempotencyMiddleware } from "../middleware/idempotency.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";
import { createFlavorPriceSchema, updateFlavorPriceSchema } from "../validators/flavor-prices.js";

const app = new OpenAPIHono();
app.use("*", authMiddleware);
app.use("*", rateLimitMiddleware());

// GET /
app.get("/", async (c) => {
  const raw = c.req.query("flavorId");
  const flavorId = raw ? Number.parseInt(raw, 10) : undefined;
  const rows = flavorId
    ? await db.select().from(flavorPrices).where(eq(flavorPrices.flavorId, flavorId))
    : await db.select().from(flavorPrices);
  return c.json({ data: rows });
});

// GET /:id
app.get("/:id", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const row = await db.select().from(flavorPrices).where(eq(flavorPrices.id, id)).get();
  if (!row) return c.json({ error: { code: "NOT_FOUND", message: "Flavor price not found" } }, 404);
  return c.json({ data: row });
});

// POST /
app.post("/", idempotencyMiddleware, async (c) => {
  const body = createFlavorPriceSchema.parse(await c.req.json());
  const userId = c.get("userId");

  const [created] = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(flavorPrices)
      .values({
        flavorId: body.flavorId,
        tierName: body.tierName,
        price: body.price,
        cost: body.cost ?? null,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Insert returned no rows");

    await insertAudit(tx as unknown as typeof db, {
      userId,
      entity: "flavor_price",
      entityId: row.id,
      entityLabel: row.tierName,
      action: "create",
      after: row,
    });

    return rows;
  });

  await publishEvent("flavor_price.updated", created);
  return c.json({ data: created }, 201);
});

// PATCH /:id — triggers full cascade transaction when price/cost changes
app.patch("/:id", idempotencyMiddleware, async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const body = updateFlavorPriceSchema.parse(await c.req.json());
  const userId = c.get("userId");

  const before = await db.select().from(flavorPrices).where(eq(flavorPrices.id, id)).get();
  if (!before)
    return c.json({ error: { code: "NOT_FOUND", message: "Flavor price not found" } }, 404);

  const priceOrCostChanged = body.price !== undefined || body.cost !== undefined;

  const [updated] = await db.transaction(async (tx) => {
    // 1. Update the rate row.
    await tx.update(flavorPrices).set(body).where(eq(flavorPrices.id, id));

    // 2. Cascade atomically to linked delivery_items and event_items.
    if (priceOrCostChanged) {
      await cascadeFlavorPrice(tx as unknown as typeof db, id);
    }

    // 3. Read final state.
    const rows = await tx.select().from(flavorPrices).where(eq(flavorPrices.id, id));
    const row = rows[0];
    if (!row) throw new Error("Row vanished after update");

    // 4. Audit inside the same transaction.
    await insertAudit(tx as unknown as typeof db, {
      userId,
      entity: "flavor_price",
      entityId: id,
      entityLabel: row.tierName,
      action: "update",
      before,
      after: row,
    });

    return rows;
  });

  await publishEvent("flavor_price.updated", updated);
  return c.json({ data: updated });
});

// DELETE /:id
// Default: soft-archive (sets isActive=false). Pass ?hard=true to hard-delete
// the price + unlink rateId on referencing items.
app.delete("/:id", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const hard = c.req.query("hard") === "true";
  const userId = c.get("userId");

  const before = await db.select().from(flavorPrices).where(eq(flavorPrices.id, id)).get();
  if (!before)
    return c.json({ error: { code: "NOT_FOUND", message: "Flavor price not found" } }, 404);

  await db.transaction(async (tx) => {
    if (hard) {
      // Unlink before deleting so items aren't left with a dangling rateId.
      await tx.update(deliveryItems).set({ rateId: null }).where(eq(deliveryItems.rateId, id));
      await tx.update(eventItems).set({ rateId: null }).where(eq(eventItems.rateId, id));
      await tx.delete(flavorPrices).where(eq(flavorPrices.id, id));
    } else {
      await tx.update(flavorPrices).set({ isActive: false }).where(eq(flavorPrices.id, id));
    }
    await insertAudit(tx as unknown as typeof db, {
      userId,
      entity: "flavor_price",
      entityId: id,
      entityLabel: before.tierName,
      action: "delete",
      before,
    });
  });

  await publishEvent("flavor_price.updated", { id, deleted: true });
  return c.json({ data: { deleted: true, id } });
});

export default app;
