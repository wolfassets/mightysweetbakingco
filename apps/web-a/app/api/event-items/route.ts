import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { eventItems, events } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logAudit, diffFields } from '@/db/audit';

interface CreateEventItemBody {
  eventId: number;
  flavorName: string;
  prepared?: number;
  remaining?: number;
  giveaway?: number;
  sold?: number;
  revenue?: number;
  unitCost?: number | null;
  cogs?: number;
  profit?: number;
}

interface UpdateEventItemBody {
  id: number;
  eventId?: number;
  flavorName?: string;
  prepared?: number;
  remaining?: number;
  giveaway?: number;
  sold?: number;
  revenue?: number;
  unitCost?: number | null;
  cogs?: number;
  profit?: number;
}

interface DeleteEventItemBody {
  id: number;
  eventId?: number;
}

async function buildEventItemLabel(eventId: number | null | undefined, flavorName: string): Promise<string> {
  if (eventId) {
    try {
      const ev = await db.select().from(events).where(eq(events.id, eventId)).get();
      if (ev?.name) return `${ev.name} — ${flavorName}`;
    } catch {
      // ignore
    }
  }
  return flavorName;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('eventId');

  if (eventId) {
    const items = await db.select().from(eventItems).where(eq(eventItems.eventId, parseInt(eventId)));
    return NextResponse.json(items);
  }

  const allItems = await db.select().from(eventItems);
  return NextResponse.json(allItems);
}

export async function POST(request: NextRequest) {
  const body: CreateEventItemBody = await request.json();

  const result = await db.insert(eventItems).values({
    eventId: body.eventId,
    flavorName: body.flavorName,
    prepared: body.prepared || 0,
    remaining: body.remaining || 0,
    giveaway: body.giveaway || 0,
    sold: body.sold || 0,
    revenue: body.revenue || 0,
    unitCost: body.unitCost || null,
    cogs: body.cogs || 0,
    profit: body.profit || 0,
  }).returning();

  const newRow = result[0];
  const label = await buildEventItemLabel(newRow.eventId, newRow.flavorName);
  await logAudit({
    action: 'create',
    entityType: 'event_item',
    entityId: newRow.id,
    entityLabel: label,
    after: { ...newRow },
  });

  // Recalculate event totals
  await recalculateEventTotals(body.eventId);

  return NextResponse.json(newRow);
}

export async function PUT(request: NextRequest) {
  const body: UpdateEventItemBody = await request.json();
  const { id, eventId, ...updates } = body;

  const before = await db.select().from(eventItems).where(eq(eventItems.id, id)).get();

  await db.update(eventItems).set(updates).where(eq(eventItems.id, id));

  // Recalculate event totals
  if (eventId) {
    await recalculateEventTotals(eventId);
  }

  const updated = await db.select().from(eventItems).where(eq(eventItems.id, id)).get();

  if (before && updated) {
    const label = await buildEventItemLabel(updated.eventId, updated.flavorName);
    await logAudit({
      action: 'update',
      entityType: 'event_item',
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
  const body: DeleteEventItemBody = await request.json();
  const { id, eventId } = body;

  const before = await db.select().from(eventItems).where(eq(eventItems.id, id)).get();

  await db.delete(eventItems).where(eq(eventItems.id, id));

  if (before) {
    const label = await buildEventItemLabel(before.eventId, before.flavorName);
    await logAudit({
      action: 'delete',
      entityType: 'event_item',
      entityId: id,
      entityLabel: label,
      before: { ...before },
    });
  }

  // Recalculate event totals
  if (eventId) {
    await recalculateEventTotals(eventId);
  }

  return NextResponse.json({ success: true });
}

async function recalculateEventTotals(eventId: number) {
  const items = await db.select().from(eventItems).where(eq(eventItems.eventId, eventId));

  const totalPrepared = items.reduce((sum: number, i) => sum + (i.prepared || 0), 0);
  const totalSold = items.reduce((sum: number, i) => sum + (i.sold || 0), 0);
  const totalGiveaway = items.reduce((sum: number, i) => sum + (i.giveaway || 0), 0);
  const totalRevenue = items.reduce((sum: number, i) => sum + (i.revenue || 0), 0);
  const totalCost = items.reduce((sum: number, i) => sum + (i.cogs || 0), 0);

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
