import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

// Per-IP sliding-window rate limiting via Upstash Redis. Protects the
// unauthenticated/expensive routes (USDA proxy, plan generation, support
// chat) from quota-drain and token-burn abuse, per the security audit.
//
// Fails OPEN by design: if the Upstash env vars are missing (local dev) or
// Redis errors at runtime, requests are allowed — rate limiting must never
// take the product down.

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

// One limiter per (route, limit) pair, cached at module level so the
// sliding-window state is shared across requests within a server instance.
const limiters = new Map<string, Ratelimit>();

function getLimiter(name: string, limitPerMinute: number): Ratelimit | null {
  if (!redis) return null;
  const key = `${name}:${limitPerMinute}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limitPerMinute, "60 s"),
      prefix: `rl:${name}`,
      analytics: false,
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

function clientIp(req: Request): string {
  // Vercel/proxies put the client IP first in x-forwarded-for.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets — used for the Retry-After header. */
  retryAfterSec: number;
}

export async function checkRateLimit(
  name: string,
  limitPerMinute: number,
  req: Request
): Promise<RateLimitResult> {
  const limiter = getLimiter(name, limitPerMinute);
  if (!limiter) return { ok: true, retryAfterSec: 0 }; // no Upstash configured — no-op

  try {
    const { success, reset } = await limiter.limit(clientIp(req));
    return {
      ok: success,
      retryAfterSec: success ? 0 : Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
    };
  } catch (e) {
    // Redis hiccup — fail open rather than blocking real users.
    console.error(`[rateLimit] ${name} check failed:`, e);
    return { ok: true, retryAfterSec: 0 };
  }
}

// Standard 429 for routes that hit their limit.
export function rateLimitResponse(retryAfterSec: number): NextResponse<{ error: string }> {
  return NextResponse.json(
    { error: "Too many requests — please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}
