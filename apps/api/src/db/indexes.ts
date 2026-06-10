/**
 * Ensure performance indexes exist on the shared Turso DB.
 *
 * Run once at boot. Uses `CREATE INDEX IF NOT EXISTS` so it's idempotent and
 * safe to call on every restart. Indexes target the foreign keys + columns
 * the frontend queries hot:
 *   - list endpoints filter / sort by these
 *   - join paths on item tables are by parent_id
 *   - audit-log feed sorts by created_at desc
 */

import { sql } from "drizzle-orm";
import { db } from "./index.js";

const INDEXES = [
  // Items by parent
  "CREATE INDEX IF NOT EXISTS idx_delivery_items_delivery_id ON delivery_items(delivery_id)",
  "CREATE INDEX IF NOT EXISTS idx_event_items_event_id ON event_items(event_id)",
  // Rate links (used when a flavor_price is updated → cascade)
  "CREATE INDEX IF NOT EXISTS idx_delivery_items_rate_id ON delivery_items(rate_id)",
  "CREATE INDEX IF NOT EXISTS idx_event_items_rate_id ON event_items(rate_id)",
  // Flavor prices by flavor
  "CREATE INDEX IF NOT EXISTS idx_flavor_prices_flavor_id ON flavor_prices(flavor_id)",
  // List sorting / filtering on parent tables
  "CREATE INDEX IF NOT EXISTS idx_deliveries_date_prepared ON deliveries(date_prepared)",
  "CREATE INDEX IF NOT EXISTS idx_deliveries_deleted_at ON deliveries(deleted_at)",
  "CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date)",
  "CREATE INDEX IF NOT EXISTS idx_events_deleted_at ON events(deleted_at)",
  // Audit log read patterns
  "CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id)",
];

// Idempotent column adds — SQLite ignores ADD COLUMN that already exists only
// via try/catch (no "IF NOT EXISTS" for ADD COLUMN until SQLite 3.35+; libSQL
// supports it but we wrap defensively).
const COLUMN_ADDS = ["ALTER TABLE audit_log ADD COLUMN ip_address TEXT"];

export async function ensureIndexes(): Promise<void> {
  for (const ddl of COLUMN_ADDS) {
    try {
      await db.run(sql.raw(ddl));
    } catch (err) {
      // "duplicate column name" → column already exists; that's the happy path
      const msg = (err as Error).message || "";
      if (!/duplicate column/i.test(msg)) {
        console.error(`[db] failed to add column: ${ddl}`, msg);
      }
    }
  }
  for (const ddl of INDEXES) {
    try {
      await db.run(sql.raw(ddl));
    } catch (err) {
      console.error(`[db] failed to create index: ${ddl}`, (err as Error).message);
    }
  }
  console.log(`[db] verified ${INDEXES.length} indexes + ${COLUMN_ADDS.length} columns`);
}
