import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { redis } from '@/lib/redis'

/**
 * GET /api/health — lightweight dependency check for uptime monitoring.
 * Pings Supabase, Redis, and n8n with a short timeout each; never throws.
 * 200 when all configured dependencies are up, 503 otherwise.
 */

async function withTimeout(check: () => Promise<boolean>, ms: number): Promise<boolean> {
    const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms))
    try {
        return await Promise.race([check(), timeout])
    } catch {
        return false
    }
}

async function checkSupabase(): Promise<boolean> {
    return withTimeout(async () => {
        const supabase = await createClient()
        const { error } = await supabase.from('jobs').select('id').limit(1)
        return !error
    }, 3000)
}

async function checkRedis(): Promise<boolean> {
    const client = redis
    if (!client) return false
    return withTimeout(async () => {
        await client.ping()
        return true
    }, 3000)
}

async function checkN8n(): Promise<boolean> {
    // n8n's own /healthz reports whether the app itself is up, not just the
    // host — a bare origin ping would return 200 for any web server.
    const url = process.env.N8N_SCORING_WEBHOOK_URL || process.env.N8N_RESUME_WEBHOOK_URL
    if (!url) return false
    return withTimeout(async () => {
        const origin = new URL(url).origin
        const res = await fetch(`${origin}/healthz`, { method: 'GET' })
        return res.ok
    }, 3000)
}

export async function GET() {
    const [supabase, redisOk, n8n] = await Promise.all([
        checkSupabase(),
        checkRedis(),
        checkN8n(),
    ])

    const ok = supabase && redisOk && n8n
    return NextResponse.json(
        {
            status: ok ? 'ok' : 'degraded',
            checks: { supabase, redis: redisOk, n8n },
            timestamp: new Date().toISOString(),
        },
        { status: ok ? 200 : 503 }
    )
}
