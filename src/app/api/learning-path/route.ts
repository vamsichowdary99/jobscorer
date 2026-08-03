import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { logEstimatedUsage } from '@/lib/usage'
import { checkQuota } from '@/lib/plan'
import { requireUserLimit } from '@/lib/rate-limit'

// GET /api/learning-path?job_id=yyy   → detail view (per-skill rows for one job)
// GET /api/learning-path?summary=1    → history index (one entry per job)
// user_id is derived from the authenticated session; query-string user_id is ignored
// to prevent cross-user enumeration via service-role read.
export async function GET(request: NextRequest) {
    const userClient = await createServerClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const user_id = user.id

    const job_id = request.nextUrl.searchParams.get('job_id')
    const summary = request.nextUrl.searchParams.get('summary') === '1'
    // General mode: profile-upskilling paths, scoped by resume instead of job (job_id IS NULL).
    const general = request.nextUrl.searchParams.get('general') === '1'
    const resume_id_param = request.nextUrl.searchParams.get('resume_id')

    if (!summary && !job_id && !(general && resume_id_param)) {
        return NextResponse.json({ error: 'Missing job_id, or general=1&resume_id=..., or pass summary=1' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // ── Summary mode: one entry per (user, job) with aggregated skill metadata ─
    if (summary) {
        const { data, error } = await supabase
            .from('learning_paths')
            .select('id, job_id, resume_id, skill_name, importance, severity, priority_rank, created_at')
            .eq('user_id', user_id)
            .order('created_at', { ascending: false })

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        type SummaryEntry = {
            job_id: string
            resume_id: string | null
            skill_count: number
            top_skills: string[]
            critical_count: number
            standard_count: number
            optional_count: number
            latest_created_at: string
            is_general?: boolean
        }
        const byJob = new Map<string, SummaryEntry>()
        // Profile-upskilling rows (job_id IS NULL) have no job to group by — group by
        // resume instead, so "Learn Skills" clicks from the upload page's profile
        // projects still show up as their own card in the library.
        const byResume = new Map<string, SummaryEntry>()

        type LpRow = { id: string; job_id: string | null; resume_id: string | null; skill_name: string | null; importance: string | null; severity: string | null; priority_rank: number | null; created_at: string }
        for (const r of (data ?? []) as unknown as LpRow[]) {
            const isGeneral = !r.job_id
            const groupKey = isGeneral ? (r.resume_id ?? '') : r.job_id!
            if (isGeneral && !groupKey) continue // no job and no resume to key by — can't group, skip
            const map = isGeneral ? byResume : byJob
            const e = map.get(groupKey) ?? {
                job_id: isGeneral ? `general:${groupKey}` : groupKey,
                // resume_id captured from the FIRST row in the iteration (which is the most recent
                // due to the ORDER BY created_at DESC). Subsequent rows for the same job in the
                // same generation share the same resume_id; older generations may differ but the
                // card represents the latest snapshot so we keep that one.
                resume_id: r.resume_id,
                skill_count: 0,
                top_skills: [] as string[],
                critical_count: 0,
                standard_count: 0,
                optional_count: 0,
                latest_created_at: r.created_at,
                is_general: isGeneral,
            }
            e.skill_count++
            if (r.skill_name && e.top_skills.length < 3) e.top_skills.push(r.skill_name)
            // severity (Block B) takes precedence; importance is legacy fallback
            const sev = (r.severity ?? r.importance ?? '').toLowerCase()
            if (sev === 'hard_blocker' || sev === 'high') e.critical_count++
            else if (sev === 'low' || sev === 'nice_to_have') e.optional_count++
            else e.standard_count++
            if (r.created_at > e.latest_created_at) e.latest_created_at = r.created_at
            map.set(groupKey, e)
        }

        const jobIds = [...byJob.keys()]
        const { data: jobs } = jobIds.length > 0
            ? await supabase
                .from('jobs')
                .select('id, title, company, location, source, source_url, experience_level')
                .in('id', jobIds)
            : { data: [] }
        const jobMap = new Map((jobs ?? []).map(j => [j.id, j]))

        // Fetch resume names for all referenced resumes in one query (both job-based and general entries).
        const resumeIds = [...new Set([...byJob.values(), ...byResume.values()].map(e => e.resume_id).filter((v): v is string => !!v))]
        const resumeMap = new Map<string, { id: string; original_filename: string | null; is_primary: boolean | null }>()
        if (resumeIds.length > 0) {
            const { data: resumes } = await supabase
                .from('resumes')
                .select('id, original_filename, is_primary')
                .in('id', resumeIds)
            for (const r of (resumes ?? []) as Array<{ id: string; original_filename: string | null; is_primary: boolean | null }>) {
                resumeMap.set(r.id, r)
            }
        }

        const summaries = [...byJob.values(), ...byResume.values()]
            .map(e => ({
                ...e,
                job: e.is_general ? null : (jobMap.get(e.job_id) ?? null),
                resume: e.resume_id ? (resumeMap.get(e.resume_id) ?? null) : null,
            }))
            .sort((a, b) => b.latest_created_at.localeCompare(a.latest_created_at))

        return NextResponse.json({ summaries })
    }

    // ── Detail mode: per-skill rows for the given job, or (general mode) for a resume's profile-upskilling projects ──
    let detailQuery = supabase
        .from('learning_paths')
        .select('id, skill_name, importance, why_it_matters, time_estimate, resources, prerequisites, key_takeaways, severity, priority_rank, provider, cost_inr, duration_weeks, india_specific, fresher_friendly, milestone_check, next_step_action, rationale, created_at')
        .eq('user_id', user_id)
    detailQuery = general
        ? detailQuery.is('job_id', null).eq('resume_id', resume_id_param!)
        : detailQuery.eq('job_id', job_id!)
    const { data, error } = await detailQuery

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Sort by priority_rank if present (Block B), else by importance high→low (legacy)
    const importanceOrder = { high: 0, medium: 1, low: 2 }
    const sorted = (data ?? []).sort((a, b) => {
        if (a.priority_rank != null && b.priority_rank != null) {
            return a.priority_rank - b.priority_rank
        }
        const aOrder = importanceOrder[a.importance as keyof typeof importanceOrder] ?? 1
        const bOrder = importanceOrder[b.importance as keyof typeof importanceOrder] ?? 1
        return aOrder - bOrder
    })

    return NextResponse.json({ paths: sorted })
}

// POST /api/learning-path
// Triggers n8n workflow to generate learning paths for missing skills.
// user_id is derived from the authenticated session — body.user_id is ignored
// to prevent attackers from triggering paid LLM work on behalf of other users.
export async function POST(request: NextRequest) {
    const userClient = await createServerClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const user_id = user.id

    // Paid n8n + OpenAI work per call — throttle per user. (M3)
    const limited = await requireUserLimit(user_id, 'learning')
    if (limited) return limited

    const webhookUrl = process.env.N8N_LEARNING_PATH_WEBHOOK_URL
    if (!webhookUrl) {
        return NextResponse.json({ error: 'N8N_LEARNING_PATH_WEBHOOK_URL not configured' }, { status: 500 })
    }

    const body = await request.json()
    const { job_id, resume_id, missing_skills, gaps, job_title, company_name } = body

    // Block B: prefer rich gaps[] payload; fall back to flat missing_skills[] for backwards compat
    const hasGaps = Array.isArray(gaps) && gaps.length > 0
    const hasMissing = Array.isArray(missing_skills) && missing_skills.length > 0

    // job_id is required for a job-scoped path; a profile-upskilling project (no job)
    // must instead supply resume_id, since job_id is a NOT NULL-in-spirit FK to `jobs`
    // and general-mode rows are looked up by resume_id instead.
    if ((!job_id && !resume_id) || (!hasGaps && !hasMissing)) {
        return NextResponse.json({ error: 'Missing required fields: job_id or resume_id, and one of gaps[] or missing_skills[]' }, { status: 400 })
    }

    if (typeof resume_id === 'string' && resume_id) {
        const { data: ownedResume } = await userClient
            .from('resumes')
            .select('id')
            .eq('id', resume_id)
            .eq('user_id', user_id)
            .maybeSingle()
        if (!ownedResume) {
            return NextResponse.json({ error: 'Resume not found' }, { status: 404 })
        }
    }

    const overQuota = await checkQuota(user_id, 'learning_path')
    if (overQuota) return overQuota

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120000)

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id,
                job_id: typeof job_id === 'string' && job_id ? job_id : null,
                resume_id: typeof resume_id === 'string' ? resume_id : undefined,
                gaps: hasGaps ? gaps : undefined,
                missing_skills: hasMissing ? missing_skills : undefined,
                job_title,
                company_name,
            }),
            signal: controller.signal,
        })

        clearTimeout(timeout)

        if (!response.ok) {
            const text = await response.text()
            return NextResponse.json({ error: `n8n error: ${text}` }, { status: response.status })
        }

        const data = await response.json()
        // Learning-path generation ran the n8n AI workflow — log its cost.
        void logEstimatedUsage({ userId: user_id, feature: 'learning_path' })
        return NextResponse.json(data)
    } catch (err) {
        clearTimeout(timeout)
        if (err instanceof Error && err.name === 'AbortError') {
            return NextResponse.json({ error: 'Request timed out after 120s' }, { status: 504 })
        }
        return NextResponse.json({ error: String(err) }, { status: 500 })
    }
}
