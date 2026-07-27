import type { NextFunction, Request, Response } from "express";

type Bucket = { count: number; resetAt: number };

/**
 * Lightweight in-memory fixed-window rate limiter (assignment polish).
 * Fine for a single API process; not shared across replicas.
 */
export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message: string;
}) {
  const buckets = new Map<string, Bucket>();

  function prune(now: number) {
    if (buckets.size < 500) return;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();
    prune(now);

    const auth = req.headers.authorization?.slice(0, 48) ?? "anon";
    const key = `${req.ip ?? "unknown"}:${auth}`;
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > options.max) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((bucket.resetAt - now) / 1000),
      );
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({ error: options.message });
      return;
    }

    next();
  };
}

/** Uploads / URL adds: 30 per minute per client. */
export const sourceWriteLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  message: "Too many source requests. Try again in a minute.",
});

/** Query pipeline is expensive: 10 per minute per client. */
export const queryLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 10,
  message: "Too many questions. Wait a moment and try again.",
});

/** Podcast generation is expensive (LLM + TTS): 5 per minute per client. */
export const podcastWriteLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 5,
  message: "Too many podcast requests. Try again in a minute.",
});
