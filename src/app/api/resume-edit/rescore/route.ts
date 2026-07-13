import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { requireUserLimit } from '@/lib/rate-limit'
import { checkQuota } from '@/lib/plan'
import { logUsage } from '@/lib/usage'
import { generateATSText } from '@/lib/resume-edit/atsText'
import { SYSTEM_PROMPT, buildPrompt, normalizeScore } from '@/lib/scoring/prompt'
import type { ResumeEditorState } from '@/lib/types'

function getOpenAI() {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

export const maxDuration = 30

/**
 * POST /api/resume-edit/rescore — architecture doc §5 Layer 2: a real,
 * user-triggered LLM re-score of the EDITED artifact, using the exact same
 * scoring prompt as the Trigger.dev score-jobs task (src/lib/scoring/prompt.ts).
 * Charged to the existing 'score' quota + limiter (not 'resume_edit') per the
 * plan. Writes ONLY optimized_resumes.live_score — user_job_matches (the
 * base-resume truth) is never touched, and this never goes through
 * Trigger.dev/Redis/the two-layer cache.
 */
export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limited = await requireUserLimit(user.id, 'score')
    if (limited) return limited

    let body: { optimizedResumeId?: string; editorState?: ResumeEditorState }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const { optimizedResumeId, editorState } = body
    if (!optimizedResumeId || !editorState) {
        return NextResponse.json({ error: 'optimizedResumeId and editorState are required' }, { status: 400 })
    }

    const overQuota = await checkQuota(user.id, 'score')
    if (overQuota) return overQuota

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    const { data: row, error: fetchErr } = await sb
        .from('optimized_resumes')
        .select('id, job_id')
        .eq('id', optimizedResumeId)
        .eq('user_id', user.id)
        .maybeSingle()

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: job, error: jobErr } = await sb
        .from('jobs')
        .select('id, title, company, location, experience_level, schedule_type, salary, required_skills, description')
        .eq('id', row.job_id)
        .maybeSingle()

    if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 })
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const resumeText = generateATSText(editorState)
    const prompt = buildPrompt(resumeText, job)

    let live_score: { score: number; matched_skills: unknown; missing_skills: unknown; reasoning: string; scored_at: string }
    let usage: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } = {}
    const t0 = Date.now()
    try {
        const response = await getOpenAI().chat.completions.create(
            {
                model: 'gpt-4.1-mini',
                temperature: 0.3,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: prompt },
                ],
            },
            { timeout: 60_000 },
        )
        usage = response.usage ?? {}
        const raw = JSON.parse(response.choices[0]?.message?.content || '{}')
        const rawScore = raw.scores?.[0]
        if (!rawScore) throw new Error('Empty scores array from OpenAI')
        const result = normalizeScore(rawScore as Record<string, unknown>)
        live_score = {
            score: result.relevance_score,
            matched_skills: result.matched_skills,
            missing_skills: result.missing_skills,
            reasoning: result.ai_reasoning,
            scored_at: new Date().toISOString(),
        }
    } catch (err) {
        console.error('[resume-edit/rescore] scoring failed:', err)
        return NextResponse.json({ error: 'Re-score failed. Please try again.' }, { status: 502 })
    }

    void logUsage({
        userId: user.id,
        feature: 'score',
        model: 'gpt-4.1-mini',
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
        latencyMs: Date.now() - t0,
    })

    const { error: updateErr } = await sb
        .from('optimized_resumes')
        .update({ live_score })
        .eq('id', optimizedResumeId)
        .eq('user_id', user.id)

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    return NextResponse.json(live_score)
}
