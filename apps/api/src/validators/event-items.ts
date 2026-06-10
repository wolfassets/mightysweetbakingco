import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { eventItems } from "../db/schema.js";

export const eventItemSelectSchema = createSelectSchema(eventItems);
export const eventItemInsertSchema = createInsertSchema(eventItems);

// POST /event-items — create
export const createEventItemSchema = z.object({
  eventId: z.number().int().positive(),
  flavorName: z.string().min(1).max(200),
  prepared: z.number().int().min(0).optional().default(0),
  remaining: z.number().int().min(0).optional().default(0),
  giveaway: z.number().int().min(0).optional().default(0),
  sold: z.number().int().min(0).optional().default(0),
  unitCost: z.number().min(0).nullable().optional(),
  rateId: z.number().int().positive().nullable().optional(),
  // revenue, cogs, profit are server-computed; ignored if sent
});

// PATCH /event-items/:id — update
export const updateEventItemSchema = z.object({
  flavorName: z.string().min(1).max(200).optional(),
  prepared: z.number().int().min(0).optional(),
  remaining: z.number().int().min(0).optional(),
  giveaway: z.number().int().min(0).optional(),
  sold: z.number().int().min(0).optional(),
  unitCost: z.number().min(0).nullable().optional(),
  rateId: z.number().int().positive().nullable().optional(),
});

export const listEventItemsQuerySchema = z.object({
  eventId: z
    .string()
    .transform((v) => Number.parseInt(v, 10))
    .optional(),
});

export type CreateEventItemInput = z.infer<typeof createEventItemSchema>;
export type UpdateEventItemInput = z.infer<typeof updateEventItemSchema>;
