import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { flavorPrices } from "../db/schema.js";

export const flavorPriceSelectSchema = createSelectSchema(flavorPrices);
export const flavorPriceInsertSchema = createInsertSchema(flavorPrices);

// POST /flavor-prices — create
export const createFlavorPriceSchema = z.object({
  flavorId: z.number().int().positive(),
  tierName: z.string().min(1).max(200),
  price: z.number().positive(),
  cost: z.number().min(0).nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

// PATCH /flavor-prices/:id — update (triggers cascade when price/cost changes)
export const updateFlavorPriceSchema = z.object({
  flavorId: z.number().int().positive().optional(),
  tierName: z.string().min(1).max(200).optional(),
  price: z.number().positive().optional(),
  cost: z.number().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
});

// Query params for GET /flavor-prices
export const listFlavorPricesQuerySchema = z.object({
  flavorId: z
    .string()
    .transform((v) => Number.parseInt(v, 10))
    .optional(),
  includeArchived: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export type CreateFlavorPriceInput = z.infer<typeof createFlavorPriceSchema>;
export type UpdateFlavorPriceInput = z.infer<typeof updateFlavorPriceSchema>;
