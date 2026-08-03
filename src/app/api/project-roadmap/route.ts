import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUserLimit } from '@/lib/rate-limit'
import { checkQuota } from '@/lib/plan'
import { logEstimatedUsage } from '@/lib/usage'

// Roadmap generation runs n8n's Roadmap Generator webhook (Supabase fetches + one GPT-4.1 call)
export const maxDuration = 120

/**
 * GET /api/project-roadmap
 * All roadmaps for the authenticated user (Roadmap Library cards).
 */
export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
        .from('project_roadmaps')
        .select('id, resume_id, job_id, build_plan_project_id, project_name, project_description, tech_stack, difficulty, estimated_weeks, expected_score_impact, milestone_score_curve, skill_progressions, status, current_milestone, started_at, completed_at, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('[project-roadmap] list error:', error.message)
        return NextResponse.json({ success: false, error: 'Failed to load roadmaps' }, { status: 500 })
    }

    return NextResponse.json({ success: true, roadmaps: data ?? [] })
}

// Mirrors the slugify() in the n8n "Validate & Extract" node — must stay identical so the
// cache check below finds the same row n8n will upsert for a profile-mode (job-less) project.
function slugifyProjectTitle(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60)
}

/**
 * POST /api/project-roadmap
 * Job-scoped:    { resume_id, job_id, build_plan_project_id }
 * Profile mode (no job_id — a "Level Up Your Profile" project from the resume upload page):
 *                { resume_id, project_title, project_why?, skills_gained[], estimated_days?, unlocks_roles? }
 * Cache: a project_roadmaps row for this (user, resume, job|null, project) is the cache —
 * if it already exists, return it without calling n8n or consuming quota.
 */
export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: Record<string, unknown>
    try {
        body = (await req.json()) as Record<string, unknown>
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
    }

    const resume_id = typeof body.resume_id === 'string' ? body.resume_id : ''
    const job_id = typeof body.job_id === 'string' ? body.job_id : ''
    const build_plan_project_id_in = typeof body.build_plan_project_id === 'string' ? body.build_plan_project_id : ''
    const project_title = typeof body.project_title === 'string' ? body.project_title : ''
    const project_why = typeof body.project_why === 'string' ? body.project_why : ''
    const skills_gained = Array.isArray(body.skills_gained) ? body.skills_gained.filter((s): s is string => typeof s === 'string') : []
    const estimated_days = typeof body.estimated_days === 'number' ? body.estimated_days : undefined
    const unlocks_roles = Array.isArray(body.unlocks_roles) ? body.unlocks_roles.filter((s): s is string => typeof s === 'string') : []

    const isProfileMode = !job_id

    if (!resume_id) {
        return NextResponse.json({ success: false, error: 'Missing required field: resume_id' }, { status: 400 })
    }
    if (!isProfileMode && !build_plan_project_id_in) {
        return NextResponse.json({ success: false, error: 'job_id requires build_plan_project_id' }, { status: 400 })
    }
    if (isProfileMode && (!project_title || skills_gained.length === 0)) {
        return NextResponse.json({ success: false, error: 'Profile mode (no job_id) requires project_title and skills_gained[]' }, { status: 400 })
    }

    const build_plan_project_id = isProfileMode ? `profile-${slugifyProjectTitle(project_title)}` : build_plan_project_id_in

    // Cache check — a roadmap already generated for this exact project is returned as-is.
    // Re-generation is a deliberate future action, not exposed in v1 UI.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let existingQuery = (supabase as any)
        .from('project_roadmaps')
        .select('id')
        .eq('user_id', user.id)
        .eq('resume_id', resume_id)
        .eq('build_plan_project_id', build_plan_project_id)
    existingQuery = isProfileMode ? existingQuery.is('job_id', null) : existingQuery.eq('job_id', job_id)
    const { data: existing } = await existingQuery.maybeSingle()

    if (existing) {
        return NextResponse.json({ success: true, cached: true, roadmap_id: existing.id })
    }

    const rl = await requireUserLimit(user.id, 'roadmap')
    if (rl) return rl

    const overQuota = await checkQuota(user.id, 'project_roadmap')
    if (overQuota) return overQuota

    const webhookUrl = process.env.N8N_ROADMAP_WEBHOOK_URL
    if (!webhookUrl) {
        return NextResponse.json(
            { success: false, error: 'N8N_ROADMAP_WEBHOOK_URL not configured' },
            { status: 500 }
        )
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 100_000)

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
                isProfileMode
                    ? { user_id: user.id, resume_id, project_title, project_why, skills_gained, estimated_days, unlocks_roles }
                    : { user_id: user.id, resume_id, job_id, build_plan_project_id }
            ),
            signal: controller.signal,
        })
        clearTimeout(timeout)

        if (!response.ok) {
            const errorText = await response.text()
            console.error('[project-roadmap] n8n error:', response.status, errorText)
            return NextResponse.json({ success: false, error: 'Roadmap generation failed' }, { status: response.status })
        }

        const rawText = await response.text()
        if (!rawText || !rawText.trim()) {
            return NextResponse.json(
                { success: false, error: 'n8n workflow returned empty response — check n8n execution logs' },
                { status: 502 }
            )
        }

        let data: { success?: boolean; roadmap_id?: string; error?: string }
        try {
            data = JSON.parse(rawText)
        } catch {
            return NextResponse.json(
                { success: false, error: `n8n returned non-JSON response: ${rawText.slice(0, 200)}` },
                { status: 502 }
            )
        }

        if (!data.success || !data.roadmap_id) {
            return NextResponse.json({ success: false, error: data.error || 'Roadmap generation failed' }, { status: 502 })
        }

        void logEstimatedUsage({ userId: user.id, feature: 'project_roadmap' })
        return NextResponse.json({ success: true, cached: false, roadmap_id: data.roadmap_id })
    } catch (err) {
        clearTimeout(timeout)
        if (err instanceof Error && err.name === 'AbortError') {
            return NextResponse.json({ success: false, error: 'Roadmap generation timed out after 100 seconds' }, { status: 504 })
        }
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error('[project-roadmap] proxy error:', err)
        return NextResponse.json({ success: false, error: msg }, { status: 502 })
    }
}
