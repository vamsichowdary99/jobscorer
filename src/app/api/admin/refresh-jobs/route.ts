import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { KEY } from '@/lib/redis-keys'
import { isValidAdminToken } from '@/lib/adminAuth'

/**
 * POST /api/admin/refresh-jobs
 * Service-role-token-gated. Deletes the cached jobs:* entry for a given
 * (role, location, level) tuple so the next /api/ingest-jobs call hits n8n
 * fresh. Optionally pass {all: true} to wipe every jobs:* key.
 *
 * Auth: header `X-Admin-Token: <SUPABASE_SERVICE_ROLE_KEY>`.
 */
export async function POST(req: NextRequest) {
    if (!isValidAdminToken(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!redis) {
        return NextResponse.json(
            { error: 'Redis not configured' },
            { status: 503 }
        )
    }

    let body: Record<string, unknown> = {}
    try {
        body = (await req.json()) as Record<string, unknown>
    } catch {
        // Allow empty body for {all:true} via query param fallback
    }

    if (body.all === true || req.nextUrl.searchParams.get('all') === '1') {
        let cursor = '0'
        let deleted = 0
        do {
            const res = await redis.scan(cursor, { match: 'jobs:*', count: 200 })
            cursor = String(res[0])
            const keys = res[1] as string[]
            if (keys.length > 0) {
                await redis.del(...keys)
                deleted += keys.length
            }
        } while (cursor !== '0')
        return NextResponse.json({ ok: true, deleted, scope: 'all' })
    }

    const role = String(body.role ?? '')
    const location = String(body.location ?? '')
    const level = String(body.experience_level ?? '')
    if (!role || !location) {
        return NextResponse.json(
            { error: 'role and location required (or pass all:true)' },
            { status: 400 }
        )
    }
    const key = KEY.jobs(role, location, level)
    const removed = await redis.del(key)
    return NextResponse.json({ ok: true, deleted: removed, key })
}