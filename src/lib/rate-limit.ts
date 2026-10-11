import type { NextRequest } from "next/server";

/** Header server.ts sets from the real socket address (any client-sent value is overwritten). */
export const CLIENT_IP_HEADER = "x-monitor-client-ip";

/**
 * The caller's IP. Behind a reverse proxy / Cloudflare Tunnel every request comes
 * from 127.0.0.1, so with TRUST_PROXY=true the proxy's header is used instead.
 * Without it those headers are ignored: anyone could forge them.
 */
export function clientIp(req: NextRequest): string {
  if (process.env.TRUST_PROXY === "true") {
    const forwarded =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-real-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0];
    if (forwarded?.trim()) return forwarded.trim();
  }
  return req.headers.get(CLIENT_IP_HEADER) ?? "unknown";
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

interface Bucket {
  failures: number;
  resetAt: number;
}

declare global {
  var __loginFailures: Map<string, Bucket> | undefined;
}

function buckets(): Map<string, Bucket> {
  if (!global.__loginFailures) global.__loginFailures = new Map();
  return global.__loginFailures;
}

/** Seconds until the next attempt is allowed, or 0 when not locked out. */
export function loginBlockedFor(ip: string): number {
  const b = buckets().get(ip);
  if (!b) return 0;
  if (Date.now() >= b.resetAt) {
    buckets().delete(ip);
    return 0;
  }
  return b.failures >= MAX_FAILURES ? Math.ceil((b.resetAt - Date.now()) / 1000) : 0;
}

export function recordLoginFailure(ip: string) {
  const map = buckets();
  const now = Date.now();
  const b = map.get(ip);
  if (!b || now >= b.resetAt) map.set(ip, { failures: 1, resetAt: now + WINDOW_MS });
  else b.failures++;
  // keep memory bounded under a spray of distinct addresses
  if (map.size > 10_000) {
    for (const [key, value] of map) if (now >= value.resetAt) map.delete(key);
  }
}

export function clearLoginFailures(ip: string) {
  buckets().delete(ip);
}
