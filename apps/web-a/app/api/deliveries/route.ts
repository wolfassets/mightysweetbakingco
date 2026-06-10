import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { deliveries, deliveryItems } from '@/db/schema';
import { eq, desc, isNull, isNotNull } from 'drizzle-orm';
import { logAudit, diffFields } from '@/db/audit';

interface CreateDeliveryBody {
  storeName: string;
  datePrepared: string;
  dropoffDate?: string | null;
  totalPrepared?: number;
  totalCogs?: number;
  totalRevenue?: number;
  grossProfit?: number;
  profitMargin?: number;
  notes?: string | null;
  location?: string | null;
}

interface UpdateDeliveryBody {
  id: number;
  storeName?: string;
  location?: string | null;
  datePrepared?: string;
  dropoffDate?: string | null;
  expirationDate?: string | null;
  totalPrepared?: number;
  totalCogs?: number;
  totalRevenue?: number;
  grossProfit?: number;
  profitMargin?: number;
  notes?: string | null;
  deletedAt?: string | null;
}

interface DeleteDeliveryBody {
  id: number;
  hard?: boolean;
}

function calculateExpirationDate(datePrepared: string): string {
  const date = new Date(datePrepared + 'T00:00:00');
  date.setDate(date.getDate() + 7);
  return date.toISOString().split('T')[0];
}

function deliveryLabel(row: { storeName: string; datePrepared: string }): string {
  return `${row.storeName} (${row.datePrepared})`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (id) {
    const delivery = await db.select().from(deliveries).where(eq(deliveries.id, parseInt(id))).get();
    if (!delivery) {
      return NextResponse.json({ error: 'Delivery not found' }, { status: 404 });
    }
    const items = await db.select().from(deliveryItems).where(eq(deliveryItems.deliveryId, parseInt(id)));
    return NextResponse.json({ ...delivery, items });
  }

  // Get archived or active deliveries
  const archived = searchParams.get('archived');
  if (archived === 'true') {
    const archivedDeliveries = await db.select().from(deliveries).where(isNotNull(deliveries.deletedAt)).orderBy(desc(deliveries.datePrepared));
    return NextResponse.json(archivedDeliveries);
  }

  const allDeliveries = await db.select().from(deliveries).where(isNull(deliveries.deletedAt)).orderBy(desc(deliveries.datePrepared));
  return NextResponse.json(allDeliveries);
}

export async function POST(request: NextRequest) {
  const body: CreateDeliveryBody = await request.json();

  const expirationDate = body.datePrepared ? calculateExpirationDate(body.datePrepared) : null;

  const result = await db.insert(deliveries).values({
    storeName: body.storeName,
    datePrepared: body.datePrepared,
    dropoffDate: body.dropoffDate || null,
    expirationDate,
    totalPrepared: body.totalPrepared || 0,
    totalCogs: body.totalCogs || 0,
    totalRevenue: body.totalRevenue || 0,
    grossProfit: body.grossProfit || 0,
    profitMargin: body.profitMargin || 0,
    notes: body.notes || null,
    location: body.location || null,
  }).returning();

  const newRow = result[0];
  await logAudit({
    action: 'create',
    entityType: 'delivery',
    entityId: newRow.id,
    entityLabel: deliveryLabel(newRow),
    after: { ...newRow },
  });

  return NextResponse.json(newRow);
}

export async function PUT(request: NextRequest) {
  const body: UpdateDeliveryBody = await request.json();
  const { id, ...updates } = body;

  const before = await db.select().from(deliveries).where(eq(deliveries.id, id)).get();

  // Recalculate expiration date if datePrepared changed
  if (updates.datePrepared) {
    updates.expirationDate = calculateExpirationDate(updates.datePrepared);
  }

  await db.update(deliveries).set(updates).where(eq(deliveries.id, id));
  const updated = await db.select().from(deliveries).where(eq(deliveries.id, id)).get();

  if (before && updated) {
    let action: 'update' | 'delete' | 'restore' = 'update';
    if (updates.deletedAt !== undefined) {
      if (updates.deletedAt === null && before.deletedAt) {
        action = 'restore';
      } else if (updates.deletedAt !== null && !before.deletedAt) {
        action = 'delete';
      }
    }

    await logAudit({
      action,
      entityType: 'delivery',
      entityId: id,
      entityLabel: deliveryLabel(updated),
      changedFields: diffFields(before as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>),
      before: { ...before },
      after: { ...updated },
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const body: DeleteDeliveryBody = await request.json();
  const { id, hard } = body;

  const before = await db.select().from(deliveries).where(eq(deliveries.id, id)).get();

  if (hard) {
    // Hard delete — permanently remove from database
    await db.delete(deliveryItems).where(eq(deliveryItems.deliveryId, id));
    await db.delete(deliveries).where(eq(deliveries.id, id));

    if (before) {
      await logAudit({
        action: 'delete',
        entityType: 'delivery',
        entityId: id,
        entityLabel: deliveryLabel(before),
        before: { ...before },
      });
    }
  } else {
    // Soft delete — set deletedAt timestamp
    await db.update(deliveries).set({
      deletedAt: new Date().toISOString(),
    }).where(eq(deliveries.id, id));

    const updated = await db.select().from(deliveries).where(eq(deliveries.id, id)).get();
    if (before && updated) {
      await logAudit({
        action: 'delete',
        entityType: 'delivery',
        entityId: id,
        entityLabel: deliveryLabel(updated),
        changedFields: diffFields(before as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>),
        before: { ...before },
        after: { ...updated },
      });
    }
  }

  return NextResponse.json({ success: true });
}
