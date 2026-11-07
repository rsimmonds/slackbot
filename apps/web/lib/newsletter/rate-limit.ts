import { createHash } from 'node:crypto';

/**
 * Fixed-window rate limiter keyed by a salted hash of the client IP (the IP itself is never
 * stored). In-memory: each server instance counts separately, so on serverless this limits per
 * instance only. Phase 1 trade-off; move to a shared store (Postgres or Upstash) before launch.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  static keyFor(ip: string | null | undefined, scope: string): string {
    const salt = process.env.RATE_LIMIT_SALT ?? 'cmobeat-rate-limit';
    return createHash('sha256')
      .update(`${salt}:${scope}:${ip ?? 'unknown'}`)
      .digest('hex')
      .slice(0, 32);
  }

  /** Returns true when the request is allowed. */
  take(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (this.hits.size >= this.maxKeys) {
        // Drop the oldest entry (Map preserves insertion order).
        const oldest = this.hits.keys().next().value;
        if (oldest !== undefined) this.hits.delete(oldest);
      }
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }

  reset() {
    this.hits.clear();
  }
}

/** Five signups per IP per hour. */
export const signupLimiter = new RateLimiter(5, 60 * 60 * 1000);

/** First address in X-Forwarded-For (set by Vercel), else X-Real-IP. */
export function clientIp(headers: Headers): string | null {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim() || null;
  return headers.get('x-real-ip');
}
