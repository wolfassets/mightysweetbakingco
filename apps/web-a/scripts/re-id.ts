/* eslint-disable @typescript-eslint/no-require-imports */
// Run with: npx tsx --env-file=.env.local scripts/re-id.ts
import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:cookies.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const OFFSET = 100000;

async function reId(
  table: string,
  childTable: string,
  childFkColumn: string,
  dateColumn: string,
) {
  const result = await client.execute(`SELECT id FROM ${table} ORDER BY ${dateColumn} ASC, id ASC`);
  const ids = result.rows.map(r => r.id as number);

  if (ids.length === 0) {
    console.log(`  No rows in ${table}, skipping.`);
    return;
  }

  console.log(`  Found ${ids.length} rows in ${table}: [${ids.join(', ')}]`);

  // Pass 1: shift all IDs to temporary high values to avoid collisions
  for (const oldId of ids) {
    const tempId = oldId + OFFSET;
    await client.execute({ sql: `UPDATE ${childTable} SET ${childFkColumn} = ? WHERE ${childFkColumn} = ?`, args: [tempId, oldId] });
    await client.execute({ sql: `UPDATE ${table} SET id = ? WHERE id = ?`, args: [tempId, oldId] });
  }

  // Pass 2: assign sequential IDs 1, 2, 3, ...
  for (let i = 0; i < ids.length; i++) {
    const tempId = ids[i] + OFFSET;
    const newId = i + 1;
    await client.execute({ sql: `UPDATE ${childTable} SET ${childFkColumn} = ? WHERE ${childFkColumn} = ?`, args: [newId, tempId] });
    await client.execute({ sql: `UPDATE ${table} SET id = ? WHERE id = ?`, args: [newId, tempId] });
  }

  // Reset autoincrement counter
  await client.execute({ sql: `UPDATE sqlite_sequence SET seq = ? WHERE name = ?`, args: [ids.length, table] });

  console.log(`  Re-IDed ${table}: now 1..${ids.length}`);
}

async function main() {
  console.log('Starting re-ID migration...\n');

  await client.execute('PRAGMA foreign_keys = OFF');

  try {
    console.log('Re-IDing events...');
    await reId('events', 'event_items', 'event_id', 'event_date');

    console.log('\nRe-IDing deliveries...');
    await reId('deliveries', 'delivery_items', 'delivery_id', 'date_prepared');

    console.log('\nDone! Verifying...');

    const events = await client.execute('SELECT id, event_date FROM events ORDER BY id ASC');
    console.log(`  Events:`);
    events.rows.forEach(r => console.log(`    #${r.id} → ${r.event_date}`));

    const deliveries = await client.execute('SELECT id, date_prepared FROM deliveries ORDER BY id ASC');
    console.log(`  Deliveries:`);
    deliveries.rows.forEach(r => console.log(`    #${r.id} → ${r.date_prepared}`));

    console.log('\nMigration complete!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await client.execute('PRAGMA foreign_keys = ON');
  }
}

main().catch(console.error);
