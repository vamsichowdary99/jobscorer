import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

let _redis: Redis | null = null;
function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

function makeLimiter(limit: number, windowSec: number, prefix: string): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  return new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
    analytics: false,
    prefix,
  });
}

let _limiters: Record<string, Ratelimit | null> | null = null;

function limiters() {
  if (_limiters) return _limiters;
  _limiters = {
    ingest: makeLimiter(30, 30, 'rl:ingest'),
    score: makeLimiter(30, 60, 'rl:score'),
    company: makeLimiter(20, 60, 'rl:company'),
    optimize: makeLimiter(20, 300, 'rl:optimize'),
    // Resume upload triggers n8n + Claude PDF parse (~10s, paid). Tighter
    // window than 'ingest' since a single user has no legitimate reason to
    // upload >10 resumes in 5 minutes.
    resume: makeLimiter(10, 300, 'rl:resume'),
  };
  return _limiters;
}

export type LimiterName = 'ingest' | 'score' | 'company' | 'optimize' | 'resume';

/**
 * Check the limiter for a user. Returns null if the request is allowed
 * (or Redis is unavailable — degraded behavior). Returns a 429 NextResponse
 * with Retry-After header if the user is over the limit.
 */
export async function requireUserLimit(
  userId: string,
  name: LimiterName
): Promise<NextResponse | null> {
  const limiter = limiters()[name];
  if (!limiter) return null; // Redis missing → degrade open

  let result;
  try {
    result = await limiter.limit(userId);
  } catch (err) {
    console.warn(`[rate-limit:${name}] check failed, allowing request:`, err);
    return null;
  }

  if (result.success) return null;

  const retryAfterSec = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return NextResponse.json(
    {
      success: false,
      rate_limited: true,
      error: `Too many requests. Try again in ${retryAfterSec}s.`,
      retry_after_sec: retryAfterSec,
      limit: result.limit,
      remaining: result.remaining,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSec),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.reset),
      },
    }
  );
}