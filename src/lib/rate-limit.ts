/**
 * In-memory sliding-window rate limiter. Suitable for a single Railway
 * instance; replace the store with Redis/Postgres when scaling horizontally.
 */
interface Bucket {
  timestamps: number[];
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private lastSweep = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    this.sweep(now);
    const bucket = this.buckets.get(key) ?? { timestamps: [] };
    bucket.timestamps = bucket.timestamps.filter((t) => now - t < this.windowMs);
    if (bucket.timestamps.length >= this.limit) {
      const oldest = bucket.timestamps[0] ?? now;
      this.buckets.set(key, bucket);
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000)) };
    }
    bucket.timestamps.push(now);
    this.buckets.set(key, bucket);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private sweep(now: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.timestamps.every((t) => now - t >= this.windowMs)) this.buckets.delete(key);
    }
  }
}

const limiters = new Map<string, RateLimiter>();

export function getLimiter(name: string, limit: number, windowMs: number): RateLimiter {
  const id = `${name}:${limit}:${windowMs}`;
  let limiter = limiters.get(id);
  if (!limiter) {
    limiter = new RateLimiter(limit, windowMs);
    limiters.set(id, limiter);
  }
  return limiter;
}

/** Client key from proxy headers. The raw IP is only held in memory, never stored. */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}
