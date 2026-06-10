import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { flavors } from "../db/schema.js";

// Base schemas generated from Drizzle table
export const flavorSelectSchema = createSelectSchema(flavors);
export const flavorInsertSchema = createInsertSchema(flavors);

// POST /flavors — create
export const createFlavorSchema = z.object({
  name: z.string().min(1).max(200),
  unitPrice: z.number().positive(),
  unitCost: z.number().positive().nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

// PATCH /flavors/:id — update (all fields optional)
export const updateFlavorSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  unitPrice: z.number().positive().optional(),
  unitCost: z.number().positive().nullable().optional(),
  isActive: z.boolean().optional(),
});

// Query params for GET /flavors
// Supports both `?active=true|false` (msc-api native) and `?includeArchived=true`
// (legacy frontend) which means "return all rows regardless of isActive".
export const listFlavorsQuerySchema = z.object({
  active: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  includeArchived: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export type CreateFlavorInput = z.infer<typeof createFlavorSchema>;
export type UpdateFlavorInput = z.infer<typeof updateFlavorSchema>;
