import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { deliveries } from "../db/schema.js";

export const deliverySelectSchema = createSelectSchema(deliveries);
export const deliveryInsertSchema = createInsertSchema(deliveries);

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

// POST /deliveries — create
// Aggregate financial totals (totalRevenue, grossProfit, profitMargin, totalCogs)
// are server-computed from line items; ignore client values.
export const createDeliverySchema = z.object({
  storeName: z.string().min(1).max(300),
  location: z.string().max(500).nullable().optional(),
  datePrepared: z.string().regex(dateRegex, "datePrepared must be YYYY-MM-DD"),
  dropoffDate: z.string().regex(dateRegex).nullable().optional(),
  notes: z.string().max(50_000).nullable().optional(),
  invoiceNotes: z.string().max(50_000).nullable().optional(),
  additionalFees: z.number().min(0).optional().default(0),
  discount: z.number().min(0).optional().default(0),
  prepaidAmount: z.number().min(0).optional().default(0),
  cashCollected: z.number().min(0).optional().default(0),
  venmoCollected: z.number().min(0).optional().default(0),
  otherCollected: z.number().min(0).optional().default(0),
});

// PATCH /deliveries/:id — update
export const updateDeliverySchema = z.object({
  storeName: z.string().min(1).max(300).optional(),
  location: z.string().max(500).nullable().optional(),
  datePrepared: z.string().regex(dateRegex).optional(),
  dropoffDate: z.string().regex(dateRegex).nullable().optional(),
  expirationDate: z.string().regex(dateRegex).nullable().optional(),
  notes: z.string().max(50_000).nullable().optional(),
  invoiceNotes: z.string().max(50_000).nullable().optional(),
  additionalFees: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  prepaidAmount: z.number().min(0).optional(),
  cashCollected: z.number().min(0).optional(),
  venmoCollected: z.number().min(0).optional(),
  otherCollected: z.number().min(0).optional(),
  deletedAt: z.string().nullable().optional(),
});

// Query params for GET /deliveries
export const listDeliveriesQuerySchema = z.object({
  archived: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export const hardDeleteQuerySchema = z.object({
  hard: z
    .string()
    .transform((v) => v === "true")
    .optional()
    .default("false"),
});

export type CreateDeliveryInput = z.infer<typeof createDeliverySchema>;
export type UpdateDeliveryInput = z.infer<typeof updateDeliverySchema>;
