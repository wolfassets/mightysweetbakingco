import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { auditLog } from '@/db/schema';
import { desc, eq, and, gte, lte, type SQL } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entityType');
  const action = searchParams.get('action');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 1000);

  const conditions: SQL[] = [];
  if (entityType) conditions.push(eq(auditLog.entityType, entityType));
  if (action) conditions.push(eq(auditLog.action, action));
  if (from) conditions.push(gte(auditLog.createdAt, from));
  if (to) conditions.push(lte(auditLog.createdAt, to));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit);

  return NextResponse.json(rows);
}
