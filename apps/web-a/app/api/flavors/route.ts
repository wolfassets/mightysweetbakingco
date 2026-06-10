import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { flavors, flavorPrices } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logAudit, diffFields } from '@/db/audit';

interface CreateFlavorBody {
  name: string;
  unitPrice: number;
  unitCost?: number | null;
  isActive?: boolean;
}

interface UpdateFlavorBody {
  id: number;
  name?: string;
  unitPrice?: number;
  unitCost?: number | null;
  isActive?: boolean;
}

interface DeleteFlavorBody {
  id: number;
  hard?: boolean;
}

export async function GET(request: NextRequest) {
  await ensureDbInitialized();

  const { searchParams } = new URL(request.url);
  const archived = searchParams.get('archived') === 'true';
  const includeArchived = searchParams.get('includeArchived') === 'true';

  if (includeArchived) {
    const allFlavors = await db.select().from(flavors);
    return NextResponse.json(allFlavors);
  }

  const filteredFlavors = await db
    .select()
    .from(flavors)
    .where(eq(flavors.isActive, !archived));

  return NextResponse.json(filteredFlavors);
}

export async function POST(request: NextRequest) {
  await ensureDbInitialized();

  const body: CreateFlavorBody = await request.json();

  const result = await db.insert(flavors).values({
    name: body.name,
    unitPrice: body.unitPrice,
    unitCost: body.unitCost || null,
    isActive: body.isActive !== false,
  }).returning();

  const newRow = result[0];
  await logAudit({
    action: 'create',
    entityType: 'flavor',
    entityId: newRow.id,
    entityLabel: newRow.name,
    after: { ...newRow },
  });

  return NextResponse.json(newRow);
}

export async function PUT(request: NextRequest) {
  await ensureDbInitialized();

  const body: UpdateFlavorBody = await request.json();
  const { id, ...updates } = body;

  const before = await db.select().from(flavors).where(eq(flavors.id, id)).get();
  if (!before) {
    return NextResponse.json({ error: 'Flavor not found' }, { status: 404 });
  }

  await db.update(flavors).set(updates).where(eq(flavors.id, id));
  const updated = await db.select().from(flavors).where(eq(flavors.id, id)).get();

  if (before && updated) {
    let action: 'update' | 'delete' | 'restore' = 'update';
    if (updates.isActive !== undefined) {
      if (updates.isActive && !before.isActive) {
        action = 'restore';
      } else if (!updates.isActive && before.isActive) {
        action = 'delete';
      }
    }

    await logAudit({
      action,
      entityType: 'flavor',
      entityId: id,
      entityLabel: updated.name,
      changedFields: diffFields(before as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>),
      before: { ...before },
      after: { ...updated },
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  await ensureDbInitialized();

  const body: DeleteFlavorBody = await request.json();
  const { id, hard } = body;

  const before = await db.select().from(flavors).where(eq(flavors.id, id)).get();
  if (!before) {
    return NextResponse.json({ error: 'Flavor not found' }, { status: 404 });
  }

  if (hard) {
    await db.delete(flavorPrices).where(eq(flavorPrices.flavorId, id));
    await db.delete(flavors).where(eq(flavors.id, id));

    await logAudit({
      action: 'delete',
      entityType: 'flavor',
      entityId: id,
      entityLabel: before.name,
      before: { ...before },
    });

    return NextResponse.json({ success: true });
  }

  await db.update(flavors).set({ isActive: false }).where(eq(flavors.id, id));
  const updated = await db.select().from(flavors).where(eq(flavors.id, id)).get();

  if (updated) {
    await logAudit({
      action: 'delete',
      entityType: 'flavor',
      entityId: id,
      entityLabel: updated.name,
      changedFields: diffFields(before as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>),
      before: { ...before },
      after: { ...updated },
    });
  }

  return NextResponse.json({ success: true });
}
