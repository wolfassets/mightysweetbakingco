import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { deliveryItems, deliveries } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logAudit, diffFields } from '@/db/audit';

interface CreateDeliveryItemBody {
  deliveryId: number;
  flavorName: string;
  prepared?: number;
  unsold?: number;
  unitPrice?: number | null;
  unitCost?: number | null;
  revenue?: number;
  cogs?: number;
  profit?: number;
  rateId?: number | null;
}

interface UpdateDeliveryItemBody {
  id: number;
  deliveryId?: number;
  flavorName?: string;
  prepared?: number;
  unsold?: number;
  unitPrice?: number | null;
  unitCost?: number | null;
  revenue?: number;
  cogs?: number;
  profit?: number;
  rateId?: number | null;
}

interface DeleteDeliveryItemBody {
  id: number;
  deliveryId?: number;
}

async function buildDeliveryItemLabel(deliveryId: number | null | undefined, flavorName: string): Promise<string> {
  if (deliveryId) {
    try {
      const d = await db.select().from(deliveries).where(eq(deliveries.id, deliveryId)).get();
      if (d?.storeName) return `${d.storeName} — ${flavorName}`;
    } catch {
      // ignore
    }
  }
  return flavorName;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const deliveryId = searchParams.get('deliveryId');

  if (deliveryId) {
    const items = await db.select().from(deliveryItems).where(eq(deliveryItems.deliveryId, parseInt(deliveryId)));
    return NextResponse.json(items);
  }

  const allItems = await db.select().from(deliveryItems);
  return NextResponse.json(allItems);
}

export async function POST(request: NextRequest) {
  const body: CreateDeliveryItemBody = await request.json();

  const result = await db.insert(deliveryItems).values({
    deliveryId: body.deliveryId,
    flavorName: body.flavorName,
    prepared: body.prepared || 0,
    unsold: body.unsold || 0,
    unitPrice: body.unitPrice || null,
    unitCost: body.unitCost || null,
    revenue: body.revenue || 0,
    cogs: body.cogs || 0,
    profit: body.profit || 0,
    rateId: body.rateId ?? null,
  }).returning();

  const newRow = result[0];
  const label = await buildDeliveryItemLabel(newRow.deliveryId, newRow.flavorName);
  await logAudit({
    action: 'create',
    entityType: 'delivery_item',
    entityId: newRow.id,
    entityLabel: label,
    after: { ...newRow },
  });

  await recalculateDeliveryTotals(body.deliveryId);

  return NextResponse.json(newRow);
}

export async function PUT(request: NextRequest) {
  const body: UpdateDeliveryItemBody = await request.json();
  const { id, deliveryId, ...updates } = body;

  const before = await db.select().from(deliveryItems).where(eq(deliveryItems.id, id)).get();

  await db.update(deliveryItems).set(updates).where(eq(deliveryItems.id, id));

  if (deliveryId) {
    await recalculateDeliveryTotals(deliveryId);
  }

  const updated = await db.select().from(deliveryItems).where(eq(deliveryItems.id, id)).get();

  if (before && updated) {
    const label = await buildDeliveryItemLabel(updated.deliveryId, updated.flavorName);
    await logAudit({
      action: 'update',
      entityType: 'delivery_item',
      entityId: id,
      entityLabel: label,
      changedFields: diffFields(before as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>),
      before: { ...before },
      after: { ...updated },
    });
  }

  return NextResponse.json(JSON.parse(JSON.stringify(updated, (_key: string, v: unknown) => typeof v === 'bigint' ? Number(v) : v)));
}

export async function DELETE(request: NextRequest) {
  const body: DeleteDeliveryItemBody = await request.json();
  const { id, deliveryId } = body;

  const before = await db.select().from(deliveryItems).where(eq(deliveryItems.id, id)).get();

  await db.delete(deliveryItems).where(eq(deliveryItems.id, id));

  if (before) {
    const label = await buildDeliveryItemLabel(before.deliveryId, before.flavorName);
    await logAudit({
      action: 'delete',
      entityType: 'delivery_item',
      entityId: id,
      entityLabel: label,
      before: { ...before },
    });
  }

  if (deliveryId) {
    await recalculateDeliveryTotals(deliveryId);
  }

  return NextResponse.json({ success: true });
}

async function recalculateDeliveryTotals(deliveryId: number) {
  const items = await db.select().from(deliveryItems).where(eq(deliveryItems.deliveryId, deliveryId));

  const totalPrepared = items.reduce((sum: number, i) => sum + (i.prepared || 0), 0);
  const totalCogs = items.reduce((sum: number, i) => sum + (i.cogs || 0), 0);
  const totalRevenue = items.reduce((sum: number, i) => sum + (i.revenue || 0), 0);
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
