import { Redis } from "ioredis";

// TODO: Set REDIS_URL in environment. Defaults to unix socket for production.
// For local TCP: redis://127.0.0.1:6379
const REDIS_URL = process.env.REDIS_URL ?? "/var/run/redis/redis.sock";

function createRedisClient(name: string): Redis {
  const client = new Redis(REDIS_URL, {
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => Math.min(times * 50, 2000),
    connectionName: name,
  });

  client.on("error", (err: Error) => {
    console.error(`[redis:${name}] error:`, err.message);
  });

  client.on("connect", () => {
    console.log(`[redis:${name}] connected`);
  });

  return client;
}

// Separate client for pub/sub (cannot share with command client once subscribed)
export const redis = createRedisClient("cmd");
export const redisSub = createRedisClient("sub");
