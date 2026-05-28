/**
 * One-shot backfill for `jobs` rows where legitimacy_tier IS NULL or = 'unknown'.
 * Useful after Phase 2C lands — earlier pool promotions stored 'unknown'.
 *
 * Idempotent. Re-runs are safe (the WHERE clause excludes already-scored rows).
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { scoreJob } from '@/lib/scoreLegitimacy'

let _sb: ReturnType<typeof createServiceClient> | null = null
function sb() {
    if (_sb) return _sb
    _sb = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    return _sb
}

export interface BackfillLegitimacyResult {
    selected: number
    scored: number
    errors: number
    tier_distribution: Record<string, number>
    elapsed_ms: number
}

export async function backfillUnknownLegitimacy(opts: { limit?: number } = {}): Promise<BackfillLegitimacyResult> {
    const t0 = Date.now()
    const limit = opts.limit ?? 200

    const { data, error } = await sb()
        .from('jobs')
        .select('id, title, description, company, source_url, salary, posted_date')
        .or('legitimacy_tier.is.null,legitimacy_tier.eq.unknown')
        .limit(limit)

    if (error) {
        console.warn('[backfillLegitimacy] select failed:', error.message)
        return { selected: 0, scored: 0, errors: 1, tier_distribution: {}, elapsed_ms: Date.now() - t0 }
    }

    const rows = (data ?? []) as Array<{
        id: string
        title: string | null
        description: string | null
        company: string | null
        source_url: string | null
        salary: string | null
        posted_date: string | null
    }>

    let scored = 0
    let errors = 0
    const tierDist: Record<string, number> = {}

    for (const row of rows) {
        const { legitimacy_tier, legitimacy_signals } = scoreJob(row)
        tierDist[legitimacy_tier] = (tierDist[legitimacy_tier] ?? 0) + 1

        const { error: updateErr } = await sb()
            .from('jobs')
            .update({ legitimacy_tier, legitimacy_signals } as never)
            .eq('id', row.id)

        if (updateErr) {
            errors++
            console.warn('[backfillLegitimacy] update failed for', row.id, updateErr.message)
        } else {
            scored++
        }
    }

    return {
        selected: rows.length,
        scored,
        errors,
        tier_distribution: tierDist,
        elapsed_ms: Date.now() - t0,
    }
}
