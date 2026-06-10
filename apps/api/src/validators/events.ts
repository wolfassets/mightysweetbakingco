import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { events } from "../db/schema.js";

export const eventSelectSchema = createSelectSchema(events);
export const eventInsertSchema = createInsertSchema(events);

// POST /events — create
// Aggregate financial totals are intentionally excluded — server recomputes them.
export const createEventSchema = z.object({
  name: z.string().min(1).max(300),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "eventDate must be YYYY-MM-DD"),
  location: z.string().max(500).nullable().optional(),
  eventCost: z.number().min(0).optional().default(0),
  cashCollected: z.number().min(0).optional().default(0),
  venmoCollected: z.number().min(0).optional().default(0),
  otherCollected: z.number().min(0).optional().default(0),
  notes: z.string().nullable().optional(),
});

// PATCH /events/:id — update
export const updateEventSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "eventDate must be YYYY-MM-DD")
    .optional(),
  location: z.string().max(500).nullable().optional(),
  eventCost: z.number().min(0).optional(),
  cashCollected: z.number().min(0).optional(),
  venmoCollected: z.number().min(0).optional(),
  otherCollected: z.number().min(0).optional(),
  notes: z.string().nullable().optional(),
  // Allow manual soft-delete restore
  deletedAt: z.string().nullable().optional(),
});

// Query params for GET /events
export const listEventsQuerySchema = z.object({
  archived: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

// DELETE /events/:id — query params
export const hardDeleteQuerySchema = z.object({
  hard: z
    .string()
    .transform((v) => v === "true")
    .optional()
    .default("false"),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
