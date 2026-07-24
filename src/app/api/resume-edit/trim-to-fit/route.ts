import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { requireUserLimit } from '@/lib/rate-limit'
import { checkQuota } from '@/lib/plan'
import { logUsage } from '@/lib/usage'
import { buildTrimPrompt, parseTrimResponse, isTrimEmpty, TRIM_SYSTEM_PROMPT, type TrimChanges } from '@/lib/resume-edit/trimToFit'
import type { ResumeEditorState } from '@/lib/types'

function getOpenAI() {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

interface TrimRequestBody {
    optimizedResumeId?: string
    editorState?: ResumeEditorState
    pageTarget?: number
    currentPages?: number
}

/**
 * POST /api/resume-edit/trim-to-fit — the "Trim with AI" action in the
 * One-Page Optimizer (see docs/superpowers/specs/2026-07-24-trim-with-ai-design.md).
 * One non-streaming gpt-4.1-mini JSON-mode call, no tool-calling loop —
 * deliberately NOT routed through the chat assistant's propose_edit tool
 * (apply.ts can't resize a bullets array; this is a one-shot structural
 * rewrite reviewed as a single batch, not a conversation).
 *
 * Job title/description are looked up server-side from optimizedResumeId
 * (same two-query pattern as /api/resume-edit/audit) rather than trusted
 * from the client — SavedResumeEntry.job on the frontend only carries
 * {id, title, company, location}, no description field, so the frontend
 * genuinely doesn't have this data to send even if we wanted it to.
 */
export async function POST(request: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const limited = await requireUserLimit(user.id, 'resume-edit')
    if (limited) return limited

    let body: TrimRequestBody
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
    }

    const { optimizedResumeId, editorState, pageTarget, currentPages } = body
    if (!optimizedResumeId || !editorState || !pageTarget || !currentPages) {
        return NextResponse.json({ success: false, error: 'optimizedResumeId, editorState, pageTarget, and currentPages are required' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    const { data: row } = await sb
        .from('optimized_resumes')
        .select('job_id')
        .eq('id', optimizedResumeId)
        .eq('user_id', user.id)
        .maybeSingle()
    if (!row?.job_id) {
        return NextResponse.json({ success: false, error: 'No job found for this resume' }, { status: 404 })
    }
    const { data: job } = await sb
        .from('jobs')
        .select('title, description')
        .eq('id', row.job_id)
        .maybeSingle()

    const overQuota = await checkQuota(user.id, 'resume_edit')
    if (overQuota) return overQuota

    const prompt = buildTrimPrompt(editorState, job?.title ?? '', job?.description ?? '', currentPages, pageTarget)

    const t0 = Date.now()
    try {
        const response = await getOpenAI().chat.completions.create({
            model: 'gpt-4.1-mini',
            temperature: 0.4,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: TRIM_SYSTEM_PROMPT },
                { role: 'user', content: prompt },
            ],
        })

        const raw = JSON.parse(response.choices[0]?.message?.content || '{}')
        const changes: TrimChanges = parseTrimResponse(raw, editorState, [], [])

        void logUsage({
            userId: user.id,
            feature: 'resume_edit',
            model: 'gpt-4.1-mini',
            promptTokens: response.usage?.prompt_tokens ?? 0,
            completionTokens: response.usage?.completion_tokens ?? 0,
            cachedTokens: response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
            latencyMs: Date.now() - t0,
        })

        if (isTrimEmpty(changes)) {
            return NextResponse.json({ success: true, changes, empty: true })
        }
        return NextResponse.json({ success: true, changes })
    } catch (err) {
        console.error('[resume-edit/trim-to-fit] generation failed:', err)
        return NextResponse.json({ success: false, error: 'Trim generation failed' }, { status: 502 })
    }
}
