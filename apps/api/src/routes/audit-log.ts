import { OpenAPIHono } from "@hono/zod-openapi";
import { type SQL, and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import { auditLog } from "../db/schema.js";
import { authMiddleware } from "../middleware/auth.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";

const app = new OpenAPIHono();
app.use("*", authMiddleware);
app.use("*", rateLimitMiddleware());

// GET /audit-log?entityType=&action=&from=&to=&limit=
app.get("/", async (c) => {
  const entityType = c.req.query("entityType");
  const action = c.req.query("action");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const limitParam = Number.parseInt(c.req.query("limit") ?? "200", 10);
  const limit = Math.min(Number.isFinite(limitParam) ? limitParam : 200, 1000);

  const conditions: SQL[] = [];
  if (entityType) conditions.push(eq(auditLog.entityType, entityType));
  if (action) conditions.push(eq(auditLog.action, action));
  if (from) conditions.push(gte(auditLog.createdAt, from));
  if (to) conditions.push(lte(auditLog.createdAt, to));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.id))
    .limit(limit);

  return c.json({ data: rows });
});

export default app;
