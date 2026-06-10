import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { deliveryItems } from "../db/schema.js";

export const deliveryItemSelectSchema = createSelectSchema(deliveryItems);
export const deliveryItemInsertSchema = createInsertSchema(deliveryItems);

// POST /delivery-items — create
// revenue, cogs, profit are server-computed when a rateId is linked.
// Clients may send them directly if no rate is linked (manual pricing).
export const createDeliveryItemSchema = z.object({
  deliveryId: z.number().int().positive(),
  flavorName: z.string().min(1).max(200),
  prepared: z.number().int().min(0).optional().default(0),
  unsold: z.number().int().min(0).optional().default(0),
  unitPrice: z.number().min(0).nullable().optional(),
  unitCost: z.number().min(0).nullable().optional(),
  rateId: z.number().int().positive().nullable().optional(),
  // Allow manual financials when no rateId is set
  revenue: z.number().min(0).optional().default(0),
  cogs: z.number().min(0).optional().default(0),
  profit: z.number().optional().default(0),
});

// PATCH /delivery-items/:id — update
export const updateDeliveryItemSchema = z.object({
  flavorName: z.string().min(1).max(200).optional(),
  prepared: z.number().int().min(0).optional(),
  unsold: z.number().int().min(0).optional(),
  unitPrice: z.number().min(0).nullable().optional(),
  unitCost: z.number().min(0).nullable().optional(),
  rateId: z.number().int().positive().nullable().optional(),
  revenue: z.number().min(0).optional(),
  cogs: z.number().min(0).optional(),
  profit: z.number().optional(),
});

export const listDeliveryItemsQuerySchema = z.object({
  deliveryId: z
    .string()
    .transform((v) => Number.parseInt(v, 10))
    .optional(),
});

export type CreateDeliveryItemInput = z.infer<typeof createDeliveryItemSchema>;
export type UpdateDeliveryItemInput = z.infer<typeof updateDeliveryItemSchema>;
