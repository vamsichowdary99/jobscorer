import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getCached } from '@/lib/redis'
import { KEY, TTL } from '@/lib/redis-keys'

/**
 * GET /api/dashboard-stats
 * Aggregates user-scoped counts for the dashboard. Cached per user for 15 min.
 */
export async function GET() {
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const cacheKey = KEY.stats(user.id)

    const { value, cached } = await getCached(cacheKey, TTL.STATS, async () => {
        const [resumesRes, matchesRes, optimizedRes, jobsRes] = await Promise.all([
            supabase
                .from('resumes')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id),
            supabase
                .from('user_job_matches')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id),
            supabase
                .from('optimized_resumes')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id),
            supabase
                .from('jobs')
                .select('id', { count: 'exact', head: true }),
        ])

        const lastMatchRes = await supabase
            .from('user_job_matches')
            .select('created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        return {
            resumes: resumesRes.count ?? 0,
            matches: matchesRes.count ?? 0,
            optimized_resumes: optimizedRes.count ?? 0,
            total_jobs_in_db: jobsRes.count ?? 0,
            last_match_at: lastMatchRes.data?.created_at ?? null,
        }
    })

    return NextResponse.json({ ...value, cached })
}