import { NextRequest, NextResponse } from 'next/server'
import { backfillUnknownLegitimacy } from '@/lib/jobs/backfillLegitimacy'
import { isValidAdminToken } from '@/lib/adminAuth'

// Pure-compute scorer, no external API calls. 200 rows usually finish under 5s.
export const maxDuration = 60

/**
 * POST /api/admin/score-legitimacy
 * Service-role-token-gated. Re-scores any `jobs` row whose legitimacy_tier is NULL
 * or 'unknown'. Useful after Phase 2C lands — earlier pool promotions stored 'unknown'.
 *
 * Auth: header `X-Admin-Token: <SUPABASE_SERVICE_ROLE_KEY>`
 *
 * Body (all optional):
 *   { limit?: number }   // default 200
 */
export async function POST(req: NextRequest) {
    if (!isValidAdminToken(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: Record<string, unknown> = {}
    try {
        body = (await req.json()) as Record<string, unknown>
    } catch { /* allow empty body */ }

    const limit = typeof body.limit === 'number' ? body.limit : 200

    try {
        const result = await backfillUnknownLegitimacy({ limit })
        return NextResponse.json({ ok: true, ...result })
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error('[/api/admin/score-legitimacy] failed:', err)
        return NextResponse.json({ ok: false, error: msg }, { status: 500 })
    }
}
