import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

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

    if (!summary && !job_id) {
        return NextResponse.json({ error: 'Missing job_id (or pass summary=1)' }, { status: 400 })
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

        const byJob = new Map<string, {
            job_id: string
            resume_id: string | null
            skill_count: number
            top_skills: string[]
            critical_count: number
            standard_count: number
            optional_count: number
            latest_created_at: string
        }>()

        type LpRow = { id: string; job_id: string | null; resume_id: string | null; skill_name: string | null; importance: string | null; severity: string | null; priority_rank: number | null; created_at: string }
        for (const r of (data ?? []) as unknown as LpRow[]) {
            if (!r.job_id) continue
            const e = byJob.get(r.job_id) ?? {
                job_id: r.job_id,
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
            }
            e.skill_count++
            if (r.skill_name && e.top_skills.length < 3) e.top_skills.push(r.skill_name)
            // severity (Block B) takes precedence; importance is legacy fallback
            const sev = (r.severity ?? r.importance ?? '').toLowerCase()
            if (sev === 'hard_blocker' || sev === 'high') e.critical_count++
            else if (sev === 'low' || sev === 'nice_to_have') e.optional_count++
            else e.standard_count++
            if (r.created_at > e.latest_created_at) e.latest_created_at = r.created_at
            byJob.set(r.job_id, e)
        }

        const jobIds = [...byJob.keys()]
        if (jobIds.length === 0) {
            return NextResponse.json({ summaries: [] })
        }

        const { data: jobs } = await supabase
            .from('jobs')
            .select('id, title, company, location, source, source_url, experience_level')
            .in('id', jobIds)
        const jobMap = new Map((jobs ?? []).map(j => [j.id, j]))

        // Fetch resume names for all referenced resumes in one query.
        const resumeIds = [...new Set([...byJob.values()].map(e => e.resume_id).filter((v): v is string => !!v))]
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

        const summaries = [...byJob.values()]
            .map(e => ({
                ...e,
                job: jobMap.get(e.job_id) ?? null,
                resume: e.resume_id ? (resumeMap.get(e.resume_id) ?? null) : null,
            }))
            .sort((a, b) => b.latest_created_at.localeCompare(a.latest_created_at))

        return NextResponse.json({ summaries })
    }

    // ── Detail mode: existing per-skill rows for the given job ──────────────
    const { data, error } = await supabase
        .from('learning_paths')
        .select('id, skill_name, importance, why_it_matters, time_estimate, resources, prerequisites, key_takeaways, severity, priority_rank, provider, cost_inr, duration_weeks, india_specific, fresher_friendly, milestone_check, next_step_action, rationale, created_at')
        .eq('user_id', user_id)
        .eq('job_id', job_id!)

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

    const webhookUrl = process.env.N8N_LEARNING_PATH_WEBHOOK_URL
    if (!webhookUrl) {
        return NextResponse.json({ error: 'N8N_LEARNING_PATH_WEBHOOK_URL not configured' }, { status: 500 })
    }

    const body = await request.json()
    const { job_id, resume_id, missing_skills, gaps, job_title, company_name } = body

    // Block B: prefer rich gaps[] payload; fall back to flat missing_skills[] for backwards compat
    const hasGaps = Array.isArray(gaps) && gaps.length > 0
    const hasMissing = Array.isArray(missing_skills) && missing_skills.length > 0

    if (!job_id || (!hasGaps && !hasMissing)) {
        return NextResponse.json({ error: 'Missing required fields: job_id, and one of gaps[] or missing_skills[]' }, { status: 400 })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120000)

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id,
                job_id,
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
        return NextResponse.json(data)
    } catch (err) {
        clearTimeout(timeout)
        if (err instanceof Error && err.name === 'AbortError') {
            return NextResponse.json({ error: 'Request timed out after 120s' }, { status: 504 })
        }
        return NextResponse.json({ error: String(err) }, { status: 500 })
    }
}
