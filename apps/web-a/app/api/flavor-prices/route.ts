import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { flavorPrices, deliveryItems, deliveries, eventItems, events, flavors } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { logAudit, diffFields } from '@/db/audit';

interface CreateFlavorPriceBody {
  flavorId: number;
  tierName: string;
  price: number;
  cost?: number | null;
}

interface UpdateFlavorPriceBody {
  id: number;
  flavorId?: number;
  tierName?: string;
  price?: number;
  cost?: number | null;
  isActive?: boolean;
}

interface DeleteFlavorPriceBody {
  id: number;
  hard?: boolean;
}

async function buildFlavorPriceLabel(flavorId: number, tierName: string): Promise<string> {
  try {
    const flavor = await db.select().from(flavors).where(eq(flavors.id, flavorId)).get();
    if (flavor?.name) return `${flavor.name} — ${tierName}`;
  } catch {
    // ignore
  }
  return tierName;
}

export async function GET(request: NextRequest) {
  await ensureDbInitialized();

  const { searchParams } = new URL(request.url);
  const flavorId = searchParams.get('flavorId');
  const archived = searchParams.get('archived') === 'true';
  const includeArchived = searchParams.get('includeArchived') === 'true';

  if (flavorId) {
    const flavorIdCondition = eq(flavorPrices.flavorId, parseInt(flavorId));
    const prices = await db
      .select()
      .from(flavorPrices)
      .where(includeArchived ? flavorIdCondition : and(flavorIdCondition, eq(flavorPrices.isActive, !archived)));
    return NextResponse.json(prices);
  }

  if (includeArchived) {
    const allPrices = await db.select().from(flavorPrices);
    return NextResponse.json(allPrices);
  }

  const filteredPrices = await db
    .select()
    .from(flavorPrices)
    .where(eq(flavorPrices.isActive, !archived));

  return NextResponse.json(filteredPrices);
}

export async function POST(request: NextRequest) {
  await ensureDbInitialized();

  const body: CreateFlavorPriceBody = await request.json();

  const result = await db.insert(flavorPrices).values({
    flavorId: body.flavorId,
    tierName: body.tierName,
    price: body.price,
    cost: body.cost ?? null,
    isActive: true,
  }).returning();

  const newRow = result[0];
  const label = await buildFlavorPriceLabel(newRow.flavorId, newRow.tierName);
  await logAudit({
    action: 'create',
    entityType: 'flavor_price',
    entityId: newRow.id,
    entityLabel: label,
    after: { ...newRow },
  });

  return NextResponse.json(newRow);
}

export async function PUT(request: NextRequest) {
  await ensureDbInitialized();

  const body: UpdateFlavorPriceBody = await request.json();
  const { id, ...updates } = body;

  const before = await db.select().from(flavorPrices).where(eq(flavorPrices.id, id)).get();
  if (!before) {
    return NextResponse.json({ error: 'Rate not found' }, { status: 404 });
  }

  // Update the rate itself
  await db.update(flavorPrices).set(updates).where(eq(flavorPrices.id, id));
  const updated = await db.select().from(flavorPrices).where(eq(flavorPrices.id, id)).get();

  if (!updated) {
    return NextResponse.json({ error: 'Rate not found' }, { status: 404 });
  }

  if (before) {
    let action: 'update' | 'delete' | 'restore' = 'update';
    if (updates.isActive !== undefined) {
      if (updates.isActive && !before.isActive) {
        action = 'restore';
      } else if (!updates.isActive && before.isActive) {
        action = 'delete';
      }
    }

    const label = await buildFlavorPriceLabel(updated.flavorId, updated.tierName);
    await logAudit({
      action,
      entityType: 'flavor_price',
      entityId: id,
      entityLabel: label,
      changedFields: diffFields(before as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>),
      before: { ...before },
      after: { ...updated },
    });
  }

  // Cascade: update all delivery_items linked to this rate
  if (updates.price !== undefined || updates.cost !== undefined) {
    const linkedDeliveryItems = await db.select().from(deliveryItems).where(eq(deliveryItems.rateId, id));

    for (const item of linkedDeliveryItems) {
      const newPrice = updated.price;
      const newCost = updated.cost ?? 0;
      const prepared = item.prepared ?? 0;
      const newRevenue = prepared * newPrice;
      const newCogs = prepared * newCost;
      const newProfit = newRevenue - newCogs;

      await db.update(deliveryItems).set({
        unitPrice: newPrice,
        unitCost: newCost,
        revenue: newRevenue,
        cogs: newCogs,
        profit: newProfit,
      }).where(eq(deliveryItems.id, item.id));

      // Recalculate parent delivery totals
      if (item.deliveryId) {
        await recalculateDeliveryTotals(item.deliveryId);
      }
    }

    // Cascade: update all event_items linked to this rate
    const linkedEventItems = await db.select().from(eventItems).where(eq(eventItems.rateId, id));

    for (const item of linkedEventItems) {
      const newCost = updated.cost ?? 0;
      const sold = item.sold ?? 0;
      const newRevenue = sold * updated.price;
      const newCogs = sold * newCost;
      const newProfit = newRevenue - newCogs;

      await db.update(eventItems).set({
        unitCost: newCost,
        revenue: newRevenue,
        cogs: newCogs,
        profit: newProfit,
      }).where(eq(eventItems.id, item.id));

      // Recalculate parent event totals
      if (item.eventId) {
        await recalculateEventTotals(item.eventId);
      }
    }
  }

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  await ensureDbInitialized();

  const body: DeleteFlavorPriceBody = await request.json();
  const { id, hard } = body;

  const before = await db.select().from(flavorPrices).where(eq(flavorPrices.id, id)).get();
  if (!before) {
    return NextResponse.json({ error: 'Rate not found' }, { status: 404 });
  }

  const label = await buildFlavorPriceLabel(before.flavorId, before.tierName);

  if (hard) {
    // Permanent delete: unlink existing history before removing the rate.
    await db.update(deliveryItems).set({ rateId: null }).where(eq(deliveryItems.rateId, id));
    await db.update(eventItems).set({ rateId: null }).where(eq(eventItems.rateId, id));

    await db.delete(flavorPrices).where(eq(flavorPrices.id, id));

    await logAudit({
      action: 'delete',
      entityType: 'flavor_price',
      entityId: id,
      entityLabel: label,
      before: { ...before },
    });

    return NextResponse.json({ success: true });
  }

  await db.update(flavorPrices).set({ isActive: false }).where(eq(flavorPrices.id, id));
  const updated = await db.select().from(flavorPrices).where(eq(flavorPrices.id, id)).get();

  if (updated) {
    await logAudit({
      action: 'delete',
      entityType: 'flavor_price',
      entityId: id,
      entityLabel: label,
      changedFields: diffFields(before as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>),
      before: { ...before },
      after: { ...updated },
    });
  }

  return NextResponse.json({ success: true });
}

async function recalculateDeliveryTotals(deliveryId: number) {
  const items = await db.select().from(deliveryItems).where(eq(deliveryItems.deliveryId, deliveryId));
  const totalPrepared = items.reduce((sum: number, i) => sum + (i.prepared ?? 0), 0);
  const totalCogs = items.reduce((sum: number, i) => sum + (i.cogs ?? 0), 0);
  const totalRevenue = items.reduce((sum: number, i) => sum + (i.revenue ?? 0), 0);
  const grossProfit = totalRevenue - totalCogs;
  const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  await db.update(deliveries).set({
    totalPrepared,
    totalCogs,
    totalRevenue,
    grossProfit,
    profitMargin,
  }).where(eq(deliveries.id, deliveryId));
}

async function recalculateEventTotals(eventId: number) {
  const items = await db.select().from(eventItems).where(eq(eventItems.eventId, eventId));
  const totalPrepared = items.reduce((sum: number, i) => sum + (i.prepared ?? 0), 0);
  const totalSold = items.reduce((sum: number, i) => sum + (i.sold ?? 0), 0);
  const totalGiveaway = items.reduce((sum: number, i) => sum + (i.giveaway ?? 0), 0);
  const totalRevenue = items.reduce((sum: number, i) => sum + (i.revenue ?? 0), 0);
  const totalCost = items.reduce((sum: number, i) => sum + (i.cogs ?? 0), 0);
  const netProfit = totalRevenue - totalCost;

  await db.update(events).set({
    totalPrepared,
    totalSold,
    totalGiveaway,
    totalRevenue,
    totalCost,
    netProfit,
  }).where(eq(events.id, eventId));
}
