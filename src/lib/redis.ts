import { Redis } from '@upstash/redis';

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

export const redis = getRedis();

export async function safeRedis<T>(op: (r: Redis) => Promise<T>): Promise<T | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    return await op(r);
  } catch (err) {
    console.warn('[redis] op failed, degrading to no-cache:', err);
    return null;
  }
}

function jitter(ttlSec: number): number {
  return ttlSec + Math.floor(Math.random() * 300);
}

export async function getCached<T>(
  key: string,
  ttlSec: number,
  fetcher: () => Promise<T>
): Promise<{ value: T; cached: boolean }> {
  const hit = await safeRedis<T>(async (r) => {
    const v = await r.get<T>(key);
    return v as T;
  });
  if (hit !== null && hit !== undefined) {
    return { value: hit as T, cached: true };
  }
  const value = await fetcher();
  await safeRedis(async (r) => {
    await r.set(key, value, { ex: jitter(ttlSec) });
    return true;
  });
  return { value, cached: false };
}

export async function delPattern(pattern: string): Promise<number> {
  const r = getRedis();
  if (!r) return 0;
  let cursor = '0';
  let deleted = 0;
  do {
    const res = await r.scan(cursor, { match: pattern, count: 200 });
    cursor = String(res[0]);
    const keys = res[1] as string[];
    if (keys.length > 0) {
      await r.del(...keys);
      deleted += keys.length;
    }
  } while (cursor !== '0');
  return deleted;
}