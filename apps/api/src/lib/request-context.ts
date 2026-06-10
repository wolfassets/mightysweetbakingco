/**
 * Request-scoped context using Node's AsyncLocalStorage.
 *
 * Lets `insertAudit` read the caller's IP without every route handler having
 * to pass it through. A Hono middleware (mounted in index.ts) wraps each
 * incoming request in `als.run(...)` so the IP is available throughout the
 * async chain for that request.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { networkInterfaces } from "node:os";

export interface RequestContext {
  ip: string | null;
  userId: string | null;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/** Read the current request's context. Returns null fields outside a request. */
export function getRequestContext(): RequestContext {
  return requestContext.getStore() ?? { ip: null, userId: null };
}

/**
 * Extract the client IP from a Hono context. Honors common proxy headers
 * (X-Forwarded-For, X-Real-IP, CF-Connecting-IP) for prod where a reverse
 * proxy / CDN sits in front; falls back to the socket's remote address.
 */
export function extractIp(
  headerGetter: (name: string) => string | undefined,
  remoteAddress: string | null | undefined,
): string | null {
  const xff = headerGetter("x-forwarded-for");
  if (xff) {
    // X-Forwarded-For can be a comma-separated chain; the client is the first entry.
    const first = xff.split(",")[0]?.trim();
    if (first) return normalizeIp(first);
  }
  const cf = headerGetter("cf-connecting-ip");
  if (cf) return normalizeIp(cf);
  const real = headerGetter("x-real-ip");
  if (real) return normalizeIp(real);
  if (remoteAddress) return normalizeIp(remoteAddress);
  return null;
}

function normalizeIp(ip: string): string {
  // ::ffff:127.0.0.1 → 127.0.0.1 (v4-mapped IPv6 → v4)
  const m = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const v4 = m?.[1] ?? ip;
  // For localhost connections, substitute the machine's primary LAN IP so the
  // activity feed shows something like "192.168.1.42" instead of "::1".
  if (v4 === "::1" || v4 === "127.0.0.1") {
    const lan = getLocalLanIp();
    if (lan) return lan;
  }
  return v4;
}

let cachedLanIp: string | null | undefined;
function getLocalLanIp(): string | null {
  if (cachedLanIp !== undefined) return cachedLanIp;
  try {
    const ifaces = networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const addr of ifaces[name] ?? []) {
        if (
          addr.family === "IPv4" &&
          !addr.internal &&
          !addr.address.startsWith("169.254.") &&
          addr.address !== "0.0.0.0"
        ) {
          cachedLanIp = addr.address;
          return cachedLanIp;
        }
      }
    }
  } catch {
    /* fall through */
  }
  cachedLanIp = null;
  return null;
}
