/**
 * Auth middleware — LOCAL DEV NO-OP.
 *
 * Clerk auth removed for local development. Every request is treated as a
 * trusted local user with userId "local-dev".
 */

import type { MiddlewareHandler } from "hono";

declare module "hono" {
  interface ContextVariableMap {
    userId: string;
  }
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  c.set("userId", "local-dev");
  await next();
};
