/**
 * Atomic flavor-price cascade.
 *
 * When a flavor_prices row is updated, this function (inside a single Drizzle
 * transaction) recomputes every linked delivery_item and event_item, then
 * rolls up parent delivery / event totals. Atomic or nothing.
 */

import { eq } from "drizzle-orm";
import type { DB } from "../db/index.js";
import { events, deliveries, deliveryItems, eventItems, flavorPrices } from "../db/schema.js";

// ---------------------------------------------------------------------------
// Recalculation helpers (shared with route handlers)
// ---------------------------------------------------------------------------

export async function recalcDeliveryTotals(tx: DB, deliveryId: number): Promise<void> {
  const items = await tx
    .select()
    .from(deliveryItems)
    .where(eq(deliveryItems.deliveryId, deliveryId));

  const totalPrepared = items.reduce((s, i) => s + (i.prepared ?? 0), 0);
  const totalCogs = items.reduce((s, i) => s + (i.cogs ?? 0), 0);
  const totalRevenue = items.reduce((s, i) => s + (i.revenue ?? 0), 0);
  const grossProfit = totalRevenue - totalCogs;
  const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  await tx
    .update(deliveries)
    .set({ totalPrepared, totalCogs, totalRevenue, grossProfit, profitMargin })
    .where(eq(deliveries.id, deliveryId));
}

export async function recalcEventTotals(tx: DB, eventId: number): Promise<void> {
  const items = await tx.select().from(eventItems).where(eq(eventItems.eventId, eventId));

  const totalPrepared = items.reduce((s, i) => s + (i.prepared ?? 0), 0);
  const totalSold = items.reduce((s, i) => s + (i.sold ?? 0), 0);
  const totalGiveaway = items.reduce((s, i) => s + (i.giveaway ?? 0), 0);
  const totalRevenue = items.reduce((s, i) => s + (i.revenue ?? 0), 0);
  const totalCost = items.reduce((s, i) => s + (i.cogs ?? 0), 0);
  const netProfit = totalRevenue - totalCost;

  await tx
    .update(events)
    .set({ totalPrepared, totalSold, totalGiveaway, totalRevenue, totalCost, netProfit })
    .where(eq(events.id, eventId));
}

// ---------------------------------------------------------------------------
// The cascade transaction itself
// ---------------------------------------------------------------------------

/**
 * Run the full cascade for a flavor-price update inside the supplied
 * Drizzle transaction handle `tx`.
 *
 * Caller is responsible for wrapping this in `db.transaction(async (tx) => { ... })`.
 */
export async function cascadeFlavorPrice(tx: DB, rateId: number): Promise<void> {
  // Re-read the rate inside the transaction to get the authoritative values.
  const rate = await tx.select().from(flavorPrices).where(eq(flavorPrices.id, rateId)).get();

  if (!rate) {
    throw new Error(`flavor_prices row ${rateId} not found — cannot cascade`);
  }

  const newPrice = rate.price;
  const newCost = rate.cost ?? 0;

  // --- Delivery items ---
  const linkedDeliveryItems = await tx
    .select()
    .from(deliveryItems)
    .where(eq(deliveryItems.rateId, rateId));

  const affectedDeliveryIds = new Set<number>();

  for (const item of linkedDeliveryItems) {
    const prepared = item.prepared ?? 0;
    const newRevenue = prepared * newPrice;
    const newCogs = prepared * newCost;
    const newProfit = newRevenue - newCogs;

    await tx
      .update(deliveryItems)
      .set({
        unitPrice: newPrice,
        unitCost: newCost,
        revenue: newRevenue,
        cogs: newCogs,
        profit: newProfit,
      })
      .where(eq(deliveryItems.id, item.id));

    affectedDeliveryIds.add(item.deliveryId);
  }

  // Recalculate each affected delivery
  for (const deliveryId of affectedDeliveryIds) {
    await recalcDeliveryTotals(tx, deliveryId);
  }

  // --- Event items ---
  const linkedEventItems = await tx.select().from(eventItems).where(eq(eventItems.rateId, rateId));

  const affectedEventIds = new Set<number>();

  for (const item of linkedEventItems) {
    const sold = item.sold ?? 0;
    const newRevenue = sold * newPrice;
    const newCogs = sold * newCost;
    const newProfit = newRevenue - newCogs;

    await tx
      .update(eventItems)
      .set({ unitCost: newCost, revenue: newRevenue, cogs: newCogs, profit: newProfit })
      .where(eq(eventItems.id, item.id));

    affectedEventIds.add(item.eventId);
  }

  // Recalculate each affected event
  for (const eventId of affectedEventIds) {
    await recalcEventTotals(tx, eventId);
  }
}
