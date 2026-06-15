/**
 * Phase 2B: query-time pool match + promote.
 *
 * `pool_jobs` holds every normalized item the ingestion pipeline has ever seen,
 * including ones the user-specific Filter rejected. When a new search comes in,
 * we check the pool first: if any rows match this user's role/location/level,
 * promote them into `jobs` and short-circuit the expensive n8n/Apify path.
 *
 * Promotion is an upsert with onConflict: 'source,source_id' + ignoreDuplicates,
 * so duplicate calls and race conditions are safe.
 *
 * Server-only — uses the service role key. Never import from a client file.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { scoreJob } from './scoreLegitimacy'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export interface PoolMatchRow {
    id: string
    source: string
    source_id: string
    title: string
    company: string | null
    location: string | null
    description: string | null
    salary: string | null
    posted_date: string | null
    schedule_type: string | null
    source_url: string | null
    experience_level: string | null
    required_skills: unknown
    search_count: number
    match_score: number
}

export interface PoolMatchResult {
    matches: PoolMatchRow[]
    promoted: number
}

export async function matchAndPromote(args: {
    role: string
    location: string
    experience_level: string
    max_age_days?: number
    limit?: number
}): Promise<PoolMatchResult> {
    if (!SUPABASE_URL || !SERVICE_KEY) {
        // Misconfigured env — never break the ingestion path. Fall through to n8n.
        return { matches: [], promoted: 0 }
    }

    const supabase = createServiceClient(SUPABASE_URL, SERVICE_KEY)

    // `as any`: match_pool_jobs RPC isn't declared in the Database type
    // (same convention as match_jobs in lib/rag/search.ts).
    const { data, error } = await supabase.rpc('match_pool_jobs' as any, {
        p_role: args.role,
        p_location: args.location,
        p_experience_level: args.experience_level || 'entry_level',
        p_max_age_days: args.max_age_days ?? 7,
        p_limit: args.limit ?? 25,
        p_exclude_existing: true,
    })

    if (error) {
        console.warn('[poolMatch] RPC error:', error.message)
        return { matches: [], promoted: 0 }
    }
    const matches = (data ?? []) as PoolMatchRow[]
    if (matches.length === 0) {
        return { matches: [], promoted: 0 }
    }

    // Promote: upsert into jobs with onConflict ignore. The RPC already excluded
    // rows existing in `jobs`, but ignoreDuplicates makes this safe under races.
    // Phase 2C: score each row inline using the same 11-signal heuristic the n8n
    // workflow runs, so pool-promoted jobs land with real tiers (not 'unknown').
    // Pure compute — adds ~5ms per row, negligible vs the n8n trip we're skipping.
    const rows = matches.map(m => {
        const { legitimacy_tier, legitimacy_signals } = scoreJob({
            title: m.title,
            description: m.description,
            company: m.company,
            source_url: m.source_url,
            salary: m.salary,
            posted_date: m.posted_date,
        })
        return {
            source: m.source,
            source_id: m.source_id,
            title: m.title,
            company: m.company,
            location: m.location,
            description: m.description,
            salary: m.salary,
            posted_date: m.posted_date,
            schedule_type: m.schedule_type,
            source_url: m.source_url,
            experience_level: m.experience_level,
            required_skills: m.required_skills ?? {},
            legitimacy_tier,
            legitimacy_signals,
        }
    })

    const { error: upsertErr } = await supabase
        .from('jobs')
        .upsert(rows, { onConflict: 'source,source_id', ignoreDuplicates: true })

    if (upsertErr) {
        console.warn('[poolMatch] promote upsert failed:', upsertErr.message)
        return { matches, promoted: 0 }
    }

    return { matches, promoted: rows.length }
}
