import { NextRequest, NextResponse } from 'next/server'
import { backfillApplicationStatus } from '@/lib/jobs/backfillApplicationStatus'
import { isValidAdminToken } from '@/lib/adminAuth'

export const maxDuration = 60

/**
 * POST /api/admin/backfill-application-status
 * Admin-token-gated (header `X-Admin-Token`). Mutates application_status across
 * the jobs table, so it must never be callable without the admin token.
 */
export async function POST(req: NextRequest) {
    if (!isValidAdminToken(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const result = await backfillApplicationStatus()
    return NextResponse.json({ ok: result.errors === 0, ...result })
}
