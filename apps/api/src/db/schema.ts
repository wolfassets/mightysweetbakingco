import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Core domain tables — must match mightysweetcookies (Next.js) schema exactly,
// since the underlying Turso DB is shared.
// ---------------------------------------------------------------------------

export const flavors = sqliteTable("flavors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  unitPrice: real("unit_price").notNull(),
  unitCost: real("unit_cost"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  eventDate: text("event_date").notNull(),
  location: text("location"),
  eventCost: real("event_cost").default(0),
  totalPrepared: integer("total_prepared").default(0),
  totalSold: integer("total_sold").default(0),
  totalGiveaway: integer("total_giveaway").default(0),
  totalRevenue: real("total_revenue").default(0),
  totalCost: real("total_cost").default(0),
  netProfit: real("net_profit").default(0),
  cashCollected: real("cash_collected").default(0),
  venmoCollected: real("venmo_collected").default(0),
  otherCollected: real("other_collected").default(0),
  notes: text("notes"),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});

export const eventItems = sqliteTable("event_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull(),
  flavorName: text("flavor_name").notNull(),
  prepared: integer("prepared").default(0),
  remaining: integer("remaining").default(0),
  giveaway: integer("giveaway").default(0),
  sold: integer("sold").default(0),
  revenue: real("revenue").default(0),
  unitCost: real("unit_cost"),
  cogs: real("cogs").default(0),
  profit: real("profit").default(0),
  rateId: integer("rate_id"),
});

export const deliveries = sqliteTable("deliveries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  storeName: text("store_name").notNull(),
  location: text("location"),
  datePrepared: text("date_prepared").notNull(),
  dropoffDate: text("dropoff_date"),
  expirationDate: text("expiration_date"),
  totalPrepared: integer("total_prepared").default(0),
  totalCogs: real("total_cogs").default(0),
  totalRevenue: real("total_revenue").default(0),
  grossProfit: real("gross_profit").default(0),
  profitMargin: real("profit_margin").default(0),
  notes: text("notes"),
  invoiceNotes: text("invoice_notes"),
  additionalFees: real("additional_fees").default(0),
  discount: real("discount").default(0),
  prepaidAmount: real("prepaid_amount").default(0),
  cashCollected: real("cash_collected").default(0),
  venmoCollected: real("venmo_collected").default(0),
  otherCollected: real("other_collected").default(0),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});

export const deliveryItems = sqliteTable("delivery_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deliveryId: integer("delivery_id").notNull(),
  flavorName: text("flavor_name").notNull(),
  prepared: integer("prepared").default(0),
  unsold: integer("unsold").default(0),
  unitPrice: real("unit_price"),
  unitCost: real("unit_cost"),
  revenue: real("revenue").default(0),
  cogs: real("cogs").default(0),
  profit: real("profit").default(0),
  rateId: integer("rate_id"),
});

export const flavorPrices = sqliteTable("flavor_prices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  flavorId: integer("flavor_id").notNull(),
  tierName: text("tier_name").notNull(),
  price: real("price").notNull(),
  cost: real("cost"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
});

// ---------------------------------------------------------------------------
// Audit log (append-only) — matches Next.js schema
// ---------------------------------------------------------------------------

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  entityLabel: text("entity_label"),
  changedFields: text("changed_fields"),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  ipAddress: text("ip_address"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Flavor = typeof flavors.$inferSelect;
export type NewFlavor = typeof flavors.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type EventItem = typeof eventItems.$inferSelect;
export type NewEventItem = typeof eventItems.$inferInsert;
export type Delivery = typeof deliveries.$inferSelect;
export type NewDelivery = typeof deliveries.$inferInsert;
export type DeliveryItem = typeof deliveryItems.$inferSelect;
export type NewDeliveryItem = typeof deliveryItems.$inferInsert;
export type FlavorPrice = typeof flavorPrices.$inferSelect;
export type NewFlavorPrice = typeof flavorPrices.$inferInsert;
export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
