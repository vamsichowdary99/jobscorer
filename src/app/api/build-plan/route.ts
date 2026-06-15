import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireUserLimit } from '@/lib/rate-limit'
import { logEstimatedUsage } from '@/lib/usage'
import { checkQuota } from '@/lib/plan'
import type { BuildPlan } from '@/lib/types'

// Build Plan generation runs an AI call + GitHub search inside n8n.
export const maxDuration = 120

// Service-role client for cache reads. user_id always comes from the session
// (never the query/body) so a service-role read can't enumerate other users.
function serviceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

// GET /api/build-plan?resume_id=&job_id=
// Returns a cached BuildPlan for (user, resume, job) without triggering generation.
export async function GET(request: NextRequest) {
    const userClient = await createServerClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const resume_id = request.nextUrl.searchParams.get('resume_id')
    const job_id = request.nextUrl.searchParams.get('job_id')
    if (!resume_id || !job_id) {
        return NextResponse.json({ error: 'Missing resume_id or job_id' }, { status: 400 })
    }

    const supabase = serviceClient()
    const { data, error } = await supabase
        .from('resume_build_recommendations')
        .select('recommendations')
        .eq('user_id', user.id)
        .eq('resume_id', resume_id)
        .eq('job_id', job_id)
        .maybeSingle()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data) {
        return NextResponse.json({ success: true, build_plan: null })
    }
    return NextResponse.json({ success: true, cached: true, build_plan: (data as { recommendations: BuildPlan }).recommendations })
}

// POST /api/build-plan
// Triggers the "Build Plan Generator" n8n workflow. Returns a cached plan when
// one exists (unless force_refresh). user_id is derived from the session —
// body.user_id is ignored to prevent triggering paid LLM work for other users.
export async function POST(request: NextRequest) {
    const userClient = await createServerClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const user_id = user.id

    const rl = await requireUserLimit(user_id, 'build-plan')
    if (rl) return rl

    try {
        const body = await request.json()
        const { resume_id, job_id, force_refresh, gaps, matched_skills, missing_skills, job_title, company_name } = body

        if (!resume_id || !job_id) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: resume_id, job_id' },
                { status: 400 }
            )
        }

        // ── Check cache (unless force_refresh) ────────────────
        if (!force_refresh) {
            const supabase = serviceClient()
            const { data: cached } = await supabase
                .from('resume_build_recommendations')
                .select('recommendations')
                .eq('user_id', user_id)
                .eq('resume_id', resume_id)
                .eq('job_id', job_id)
                .maybeSingle()
            if (cached) {
                return NextResponse.json({ success: true, cached: true, build_plan: (cached as { recommendations: BuildPlan }).recommendations })
            }
        }

        // Past the cache → a real build plan will be generated. Count it.
        const overQuota = await checkQuota(user_id, 'build_plan')
        if (overQuota) return overQuota

        // ── Forward to n8n build-plan webhook ─────────────────
        const webhookUrl = process.env.N8N_BUILD_PLAN_WEBHOOK_URL
        if (!webhookUrl) {
            return NextResponse.json(
                { success: false, error: 'N8N_BUILD_PLAN_WEBHOOK_URL not configured' },
                { status: 500 }
            )
        }

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 120_000)

        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id,
                    resume_id,
                    job_id,
                    gaps: Array.isArray(gaps) ? gaps : undefined,
                    matched_skills: Array.isArray(matched_skills) ? matched_skills : undefined,
                    missing_skills: Array.isArray(missing_skills) ? missing_skills : undefined,
                    job_title,
                    company_name,
                }),
                signal: controller.signal,
            })

            clearTimeout(timeout)

            if (!response.ok) {
                const errorText = await response.text()
                return NextResponse.json(
                    { success: false, error: `n8n error: ${errorText}` },
                    { status: response.status }
                )
            }

            const rawText = await response.text()
            if (!rawText || !rawText.trim()) {
                return NextResponse.json(
                    { success: false, error: 'n8n workflow returned empty response — check n8n execution logs' },
                    { status: 502 }
                )
            }
            let data: Record<string, unknown>
            try {
                data = JSON.parse(rawText) as Record<string, unknown>
            } catch {
                return NextResponse.json(
                    { success: false, error: `n8n returned non-JSON response: ${rawText.slice(0, 200)}` },
                    { status: 502 }
                )
            }
            // Normalize: workflow may return the plan as `build_plan` or bare fields.
            if (!data.build_plan && (data.certifications || data.projects || data.learning_links)) {
                data = {
                    success: true,
                    build_plan: {
                        certifications: data.certifications ?? [],
                        projects: data.projects ?? [],
                        learning_links: data.learning_links ?? [],
                        generated_at: data.generated_at ?? new Date().toISOString(),
                    },
                }
            }
            // Fresh (non-cached) build plan ran the n8n AI + GitHub workflow — log its cost.
            void logEstimatedUsage({ userId: user_id, feature: 'build_plan' })
            return NextResponse.json(data)
        } catch (fetchError) {
            clearTimeout(timeout)
            if (fetchError instanceof Error && fetchError.name === 'AbortError') {
                return NextResponse.json(
                    { success: false, error: 'Build plan request timed out after 120 seconds' },
                    { status: 504 }
                )
            }
            throw fetchError
        }
    } catch (error) {
        console.error('Build plan proxy error:', error)
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' },
            { status: 500 }
        )
    }
}
