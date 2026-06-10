import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.js";

// TODO: Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in your environment / EnvironmentFile
if (!process.env.TURSO_DATABASE_URL) {
  throw new Error("TURSO_DATABASE_URL environment variable is required");
}

const clientConfig = {
  url: process.env.TURSO_DATABASE_URL as string,
  ...(process.env.TURSO_AUTH_TOKEN ? { authToken: process.env.TURSO_AUTH_TOKEN } : {}),
};

const client = createClient(clientConfig);

export const db = drizzle(client, { schema });

export type DB = typeof db;
