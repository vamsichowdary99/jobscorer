import { NextRequest, NextResponse } from 'next/server';
import { getCached, redis } from '@/lib/redis';
import { requireUserLimit, type LimiterName } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not available in production' }, { status: 404 });
  }

  const limiterName = req.nextUrl.searchParams.get('limiter') as LimiterName | null;
  if (limiterName) {
    const userId = req.nextUrl.searchParams.get('uid') || `debug-uid-${Date.now()}`;
    const r = await requireUserLimit(userId, limiterName);
    if (r) {
      const body = await r.clone().json();
      return NextResponse.json({
        limiter: limiterName,
        userId,
        allowed: false,
        retry_after_sec: body.retry_after_sec,
        retry_after_header: r.headers.get('Retry-After'),
        remaining: body.remaining,
        limit: body.limit,
      });
    }
    return NextResponse.json({ limiter: limiterName, userId, allowed: true });
  }

  const envPresent = {
    UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN,
    clientInitialized: !!redis,
  };

  const t0 = Date.now();
  const result = await getCached(
    'debug:test',
    60,
    async () => ({ generatedAt: Date.now() })
  );
  const elapsedMs = Date.now() - t0;

  return NextResponse.json({
    envPresent,
    cached: result.cached,
    value: result.value,
    elapsedMs,
  });
}

export async function DELETE() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not available in production' }, { status: 404 });
  }
  if (!redis) {
    return NextResponse.json({ ok: false, reason: 'no redis client' }, { status: 500 });
  }
  await redis.del('debug:test');
  return NextResponse.json({ ok: true, deleted: 'debug:test' });
}