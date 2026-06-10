import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';

if (!process.env.TURSO_DATABASE_URL) {
  throw new Error('TURSO_DATABASE_URL environment variable is required');
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });

// Run migrations on first import, and let API routes wait for them before querying.
let _initialized = false;
let _initPromise: Promise<void> | null = null;

export async function ensureDbInitialized(): Promise<void> {
  if (_initialized) return;

  _initPromise ??= initializeDb()
    .then(() => {
      _initialized = true;
    })
    .catch((error) => {
      _initPromise = null;
      throw error;
    });

  await _initPromise;
}

void ensureDbInitialized();

// Type for count query result
interface CountResult {
  count: number;
}

// Type for sample flavor data
type SampleFlavor = [string, number, number | null];

// Type for sample event data
interface SampleEvent {
  name: string;
  date: string;
  prepared: number;
  sold: number;
  giveaway: number;
  revenue: number;
  cost: number;
  profit: number;
  notes: string | null;
}

// Type for sample event item data
interface SampleEventItem {
  flavor: string;
  prepared: number;
  remaining: number;
  giveaway: number;
  sold: number;
  revenue: number;
  unitCost: number;
  cogs: number;
  profit: number;
}

// Initialize database with sample data if empty
export async function initializeDb(): Promise<void> {
  // Create tables if they don't exist
  await client.execute(`
    CREATE TABLE IF NOT EXISTS flavors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      unit_price REAL NOT NULL,
      unit_cost REAL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add is_active column if it doesn't exist (migration for existing databases)
  try {
    await client.execute(`ALTER TABLE flavors ADD COLUMN is_active INTEGER DEFAULT 1`);
  } catch {
    // Column already exists, ignore
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      event_date TEXT NOT NULL,
      location TEXT,
      event_cost REAL DEFAULT 0,
      total_prepared INTEGER DEFAULT 0,
      total_sold INTEGER DEFAULT 0,
      total_giveaway INTEGER DEFAULT 0,
      total_revenue REAL DEFAULT 0,
      total_cost REAL DEFAULT 0,
      net_profit REAL DEFAULT 0,
      cash_collected REAL DEFAULT 0,
      venmo_collected REAL DEFAULT 0,
      other_collected REAL DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add event_cost column if it doesn't exist (migration for existing databases)
  try {
    await client.execute(`ALTER TABLE events ADD COLUMN event_cost REAL DEFAULT 0`);
  } catch {
    // Column already exists, ignore
  }

  // Add deleted_at column for soft delete
  try {
    await client.execute(`ALTER TABLE events ADD COLUMN deleted_at TEXT`);
  } catch {
    // Column already exists, ignore
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS event_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      flavor_name TEXT NOT NULL,
      prepared INTEGER DEFAULT 0,
      remaining INTEGER DEFAULT 0,
      giveaway INTEGER DEFAULT 0,
      sold INTEGER DEFAULT 0,
      revenue REAL DEFAULT 0,
      unit_cost REAL,
      cogs REAL DEFAULT 0,
      profit REAL DEFAULT 0,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);

  // Create index on event_id for faster lookups
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_event_items_event_id ON event_items(event_id)
  `);

  // Deliveries tables
  await client.execute(`
    CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_name TEXT NOT NULL,
      date_prepared TEXT NOT NULL,
      dropoff_date TEXT,
      expiration_date TEXT,
      total_prepared INTEGER DEFAULT 0,
      total_delivered INTEGER DEFAULT 0,
      variance INTEGER DEFAULT 0,
      total_cogs REAL DEFAULT 0,
      total_revenue REAL DEFAULT 0,
      gross_profit REAL DEFAULT 0,
      profit_margin REAL DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS delivery_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      delivery_id INTEGER NOT NULL,
      flavor_name TEXT NOT NULL,
      prepared INTEGER DEFAULT 0,
      delivered INTEGER DEFAULT 0,
      variance INTEGER DEFAULT 0,
      unit_price REAL,
      unit_cost REAL,
      revenue REAL DEFAULT 0,
      cogs REAL DEFAULT 0,
      profit REAL DEFAULT 0,
      FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE
    )
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_delivery_items_delivery_id ON delivery_items(delivery_id)
  `);

  // Add deleted_at column for soft delete
  try {
    await client.execute(`ALTER TABLE deliveries ADD COLUMN deleted_at TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Add invoice and payment columns to deliveries
  const deliveryMigrations = [
    `ALTER TABLE deliveries ADD COLUMN invoice_notes TEXT`,
    `ALTER TABLE deliveries ADD COLUMN additional_fees REAL DEFAULT 0`,
    `ALTER TABLE deliveries ADD COLUMN discount REAL DEFAULT 0`,
    `ALTER TABLE deliveries ADD COLUMN prepaid_amount REAL DEFAULT 0`,
    `ALTER TABLE deliveries ADD COLUMN cash_collected REAL DEFAULT 0`,
    `ALTER TABLE deliveries ADD COLUMN venmo_collected REAL DEFAULT 0`,
    `ALTER TABLE deliveries ADD COLUMN other_collected REAL DEFAULT 0`,
  ];
  for (const sql of deliveryMigrations) {
    try {
      await client.execute(sql);
    } catch {
      // Column already exists, ignore
    }
  }

  // Fix existing rows — reset new columns that got bad defaults (column name strings)
  try {
    const check = await client.execute(`SELECT additional_fees FROM deliveries LIMIT 1`);
    if (check.rows.length > 0 && typeof check.rows[0].additional_fees === 'string') {
      await client.execute(`UPDATE deliveries SET invoice_notes = NULL, additional_fees = 0, discount = 0, prepaid_amount = 0, cash_collected = 0, venmo_collected = 0, other_collected = 0`);
    }
  } catch {
    // ignore
  }

  // Flavor pricing tiers
  await client.execute(`
    CREATE TABLE IF NOT EXISTS flavor_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flavor_id INTEGER NOT NULL,
      tier_name TEXT NOT NULL,
      price REAL NOT NULL,
      cost REAL,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (flavor_id) REFERENCES flavors(id) ON DELETE CASCADE
    )
  `);

  try {
    await client.execute(`ALTER TABLE flavor_prices ADD COLUMN is_active INTEGER DEFAULT 1`);
  } catch {
    // Column already exists, ignore
  }

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_flavor_prices_flavor_id ON flavor_prices(flavor_id)
  `);

  // Add rate_id column to event_items and delivery_items
  try {
    await client.execute(`ALTER TABLE event_items ADD COLUMN rate_id INTEGER`);
  } catch {
    // Column already exists
  }
  try {
    await client.execute(`ALTER TABLE delivery_items ADD COLUMN rate_id INTEGER`);
  } catch {
    // Column already exists
  }

  // Check if we have flavors data
  const flavorCountResult = await client.execute('SELECT COUNT(*) as count FROM flavors');
  const flavorCount = (flavorCountResult.rows[0] as unknown as CountResult).count;

  if (flavorCount === 0) {
    const sampleFlavors: SampleFlavor[] = [
      ['Oreo Cake Batter', 5, 1.56],
      ["S'mores", 5, 1.64],
      ['Chocolate Chip Cookie Butter', 5, 1.16],
      ['Salted Caramel Pretzel', 5, 0.91],
      ['Oreo Cake Batter - GF', 5, 1.8],
      ['Cinnamon Brown Sugar', 5, 1.16],
      ['Birthday Cake', 5, null],
      ['Brownie Batter', 5, null],
      ['Holiday Boxes', 10, 3.05],
    ];

    for (const [name, price, cost] of sampleFlavors) {
      await client.execute({
        sql: 'INSERT INTO flavors (name, unit_price, unit_cost) VALUES (?, ?, ?)',
        args: [name, price, cost],
      });
    }
  }

  // Check if we have events data
  const eventCountResult = await client.execute('SELECT COUNT(*) as count FROM events');
  const eventCount = (eventCountResult.rows[0] as unknown as CountResult).count;

  if (eventCount === 0) {
    // Events data from Excel
    const eventsData: SampleEvent[] = [
      { name: 'Mall', date: '2026-01-10', prepared: 108, sold: 26, giveaway: 1, revenue: 130, cost: 35.75, profit: 94.25, notes: 'OK' },
      { name: 'WinterVillage', date: '2025-12-21', prepared: 83, sold: 53, giveaway: 0, revenue: 265, cost: 70.8, profit: 194.2, notes: 'OK' },
      { name: 'Winter Village', date: '2025-12-20', prepared: 83, sold: 53, giveaway: 0, revenue: 265, cost: 70.8, profit: 194.2, notes: 'OK' },
      { name: 'CPMall', date: '2025-12-13', prepared: 83, sold: 30, giveaway: 0, revenue: 150, cost: 40, profit: 110, notes: 'OK' },
      { name: 'AltamontFair', date: '2025-12-13', prepared: 0, sold: 0, giveaway: 0, revenue: 0, cost: 0, profit: 0, notes: 'OK' },
      { name: 'AltamontFair', date: '2025-12-12', prepared: 86, sold: 29, giveaway: 0, revenue: 155, cost: 39.17, profit: 115.83, notes: 'OK' },
      { name: 'WiltonMall', date: '2025-12-07', prepared: 91, sold: 0, giveaway: 0, revenue: 0, cost: 0, profit: 0, notes: 'OK' },
      { name: 'AltamontFair', date: '2025-12-05', prepared: 103, sold: 8, giveaway: 0, revenue: 40, cost: 10.62, profit: 29.38, notes: 'OK' },
      { name: 'ColonieCenter', date: '2025-11-22', prepared: 0, sold: 0, giveaway: 0, revenue: 0, cost: 0, profit: 0, notes: 'OK' },
      { name: 'Wynantskill PTA', date: '2025-11-16', prepared: 152, sold: 104, giveaway: 2, revenue: 520, cost: 130.05, profit: 389.95, notes: 'OK' },
      { name: 'Colonie Farmers Market', date: '2025-08-30', prepared: 216, sold: 43, giveaway: 2, revenue: 215, cost: 64.68, profit: 150.32, notes: 'OK' },
      { name: 'Colonie Farmers Market', date: '2025-09-27', prepared: 80, sold: 51, giveaway: 0, revenue: 255, cost: 76.76, profit: 178.24, notes: 'OK' },
      { name: 'Mall', date: '2025-11-01', prepared: 0, sold: 0, giveaway: 0, revenue: 0, cost: 0, profit: 0, notes: null },
    ];

    // Event items data (per-flavor breakdown)
    const eventItemsData: Record<string, SampleEventItem[]> = {
      'Wynantskill PTA|2025-11-16': [
        { flavor: 'Chocolate Chip Cookie Butter', prepared: 38, remaining: 11, giveaway: 0, sold: 27, revenue: 135, unitCost: 1.16, cogs: 31.32, profit: 103.68 },
        { flavor: "S'mores", prepared: 35, remaining: 18, giveaway: 0, sold: 17, revenue: 85, unitCost: 1.64, cogs: 27.88, profit: 57.12 },
        { flavor: 'Oreo Cake Batter - GF', prepared: 4, remaining: 2, giveaway: 2, sold: 0, revenue: 0, unitCost: 1.8, cogs: 0, profit: 0 },
        { flavor: 'Oreo Cake Batter', prepared: 37, remaining: 12, giveaway: 0, sold: 25, revenue: 125, unitCost: 1.56, cogs: 39, profit: 86 },
        { flavor: 'Salted Caramel Pretzel', prepared: 38, remaining: 3, giveaway: 0, sold: 35, revenue: 175, unitCost: 0.91, cogs: 31.85, profit: 143.15 },
      ],
      'Colonie Farmers Market|2025-09-27': [
        { flavor: 'Chocolate Chip Cookie Butter', prepared: 20, remaining: 5, giveaway: 0, sold: 15, revenue: 75, unitCost: 1.16, cogs: 17.4, profit: 57.6 },
        { flavor: "S'mores", prepared: 15, remaining: 3, giveaway: 0, sold: 12, revenue: 60, unitCost: 1.64, cogs: 19.68, profit: 40.32 },
        { flavor: 'Oreo Cake Batter', prepared: 20, remaining: 6, giveaway: 0, sold: 14, revenue: 70, unitCost: 1.56, cogs: 21.84, profit: 48.16 },
        { flavor: 'Salted Caramel Pretzel', prepared: 25, remaining: 15, giveaway: 0, sold: 10, revenue: 50, unitCost: 0.91, cogs: 9.1, profit: 40.9 },
      ],
      'Colonie Farmers Market|2025-08-30': [
        { flavor: 'Chocolate Chip Cookie Butter', prepared: 54, remaining: 42, giveaway: 1, sold: 11, revenue: 55, unitCost: 1.16, cogs: 12.76, profit: 42.24 },
        { flavor: "S'mores", prepared: 54, remaining: 45, giveaway: 1, sold: 8, revenue: 40, unitCost: 1.64, cogs: 13.12, profit: 26.88 },
        { flavor: 'Oreo Cake Batter', prepared: 54, remaining: 42, giveaway: 0, sold: 12, revenue: 60, unitCost: 1.56, cogs: 18.72, profit: 41.28 },
        { flavor: 'Salted Caramel Pretzel', prepared: 54, remaining: 42, giveaway: 0, sold: 12, revenue: 60, unitCost: 0.91, cogs: 10.92, profit: 49.08 },
      ],
    };

    for (const event of eventsData) {
      const result = await client.execute({
        sql: `INSERT INTO events (name, event_date, total_prepared, total_sold, total_giveaway, total_revenue, total_cost, net_profit, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [event.name, event.date, event.prepared, event.sold, event.giveaway, event.revenue, event.cost, event.profit, event.notes],
      });

      // Add items if we have them (lookup by "name|date" key)
      const itemsKey = `${event.name}|${event.date}`;
      const items = eventItemsData[itemsKey];
      const eventId = result.lastInsertRowid;
      if (items && eventId !== undefined) {
        for (const item of items) {
          await client.execute({
            sql: `INSERT INTO event_items (event_id, flavor_name, prepared, remaining, giveaway, sold, revenue, unit_cost, cogs, profit)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [eventId, item.flavor, item.prepared, item.remaining, item.giveaway, item.sold, item.revenue, item.unitCost, item.cogs, item.profit],
          });
        }
      }
    }
  }
}
