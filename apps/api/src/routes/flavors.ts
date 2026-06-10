import { OpenAPIHono } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { deliveryItems, eventItems, flavorPrices, flavors } from "../db/schema.js";
import { insertAudit } from "../lib/audit.js";
import { publishEvent } from "../lib/sse.js";
import { authMiddleware } from "../middleware/auth.js";
import { idempotencyMiddleware } from "../middleware/idempotency.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";
import { createFlavorSchema, updateFlavorSchema } from "../validators/flavors.js";

const app = new OpenAPIHono();
app.use("*", authMiddleware);
app.use("*", rateLimitMiddleware());

// GET /
app.get("/", async (c) => {
  const active = c.req.query("active");
  const rows =
    active !== undefined
      ? await db
          .select()
          .from(flavors)
          .where(eq(flavors.isActive, active === "true"))
      : await db.select().from(flavors);
  return c.json({ data: rows });
});

// GET /:id
app.get("/:id", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const row = await db.select().from(flavors).where(eq(flavors.id, id)).get();
  if (!row) return c.json({ error: { code: "NOT_FOUND", message: "Flavor not found" } }, 404);
  return c.json({ data: row });
});

// POST /
app.post("/", idempotencyMiddleware, async (c) => {
  const body = createFlavorSchema.parse(await c.req.json());
  const userId = c.get("userId");

  const [created] = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(flavors)
      .values({
        name: body.name,
        unitPrice: body.unitPrice,
        unitCost: body.unitCost ?? null,
        isActive: body.isActive,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Insert returned no rows");

    await insertAudit(tx as unknown as typeof db, {
      userId,
      entity: "flavor",
      entityId: row.id,
      entityLabel: row.name,
      action: "create",
      after: row,
    });

    return rows;
  });

  await publishEvent("flavor.updated", created);
  return c.json({ data: created }, 201);
});

// PATCH /:id
app.patch("/:id", idempotencyMiddleware, async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const body = updateFlavorSchema.parse(await c.req.json());
  const userId = c.get("userId");

  const before = await db.select().from(flavors).where(eq(flavors.id, id)).get();
  if (!before) return c.json({ error: { code: "NOT_FOUND", message: "Flavor not found" } }, 404);

  const [updated] = await db.transaction(async (tx) => {
    await tx.update(flavors).set(body).where(eq(flavors.id, id));
    const rows = await tx.select().from(flavors).where(eq(flavors.id, id));
    const row = rows[0];
    if (!row) throw new Error("Row vanished after update");

    await insertAudit(tx as unknown as typeof db, {
      userId,
      entity: "flavor",
      entityId: id,
      entityLabel: row.name,
      action: "update",
      before,
      after: row,
    });
    return rows;
  });

  await publishEvent("flavor.updated", updated);
  return c.json({ data: updated });
});

// DELETE /:id
// Default: soft-archive (sets isActive=false). Pass ?hard=true to hard-delete
// the flavor AND null out rateId on linked items + archive child flavor_prices.
app.delete("/:id", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const hard = c.req.query("hard") === "true";
  const userId = c.get("userId");

  const before = await db.select().from(flavors).where(eq(flavors.id, id)).get();
  if (!before) return c.json({ error: { code: "NOT_FOUND", message: "Flavor not found" } }, 404);

  await db.transaction(async (tx) => {
    if (hard) {
      // Cleanup: unlink rateId on items that reference this flavor's prices,
      // then delete the flavor_prices, then the flavor.
      const prices = await tx.select().from(flavorPrices).where(eq(flavorPrices.flavorId, id));
      for (const p of prices) {
        await tx.update(deliveryItems).set({ rateId: null }).where(eq(deliveryItems.rateId, p.id));
        await tx.update(eventItems).set({ rateId: null }).where(eq(eventItems.rateId, p.id));
      }
      await tx.delete(flavorPrices).where(eq(flavorPrices.flavorId, id));
      await tx.delete(flavors).where(eq(flavors.id, id));
    } else {
      await tx.update(flavors).set({ isActive: false }).where(eq(flavors.id, id));
    }
    await insertAudit(tx as unknown as typeof db, {
      userId,
      entity: "flavor",
      entityId: id,
      entityLabel: before.name,
      action: "delete",
      before,
    });
  });

  await publishEvent("flavor.updated", { id, deleted: true, hard });
  return c.json({ data: { deleted: true, id, hard } });
});

export default app;
