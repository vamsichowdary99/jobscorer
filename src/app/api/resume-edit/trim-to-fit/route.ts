import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { requireUserLimit } from '@/lib/rate-limit'
import { checkQuota } from '@/lib/plan'
import { logUsage } from '@/lib/usage'
import { buildTrimPrompt, parseTrimResponse, isTrimEmpty, TRIM_SYSTEM_PROMPT, type TrimChanges } from '@/lib/resume-edit/trimToFit'
import { computeTrimFingerprint, type TrimCache, type TrimCacheByTemplate } from '@/lib/resume-edit/trimFingerprint'
import type { ResumeEditorState } from '@/lib/types'

function getOpenAI() {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

interface TrimRequestBody {
    optimizedResumeId?: string
    templateId?: string
    editorState?: ResumeEditorState
    pageTarget?: number
    currentPages?: number
}

/**
 * POST /api/resume-edit/trim-to-fit — the "Trim with AI" action in the
 * One-Page Optimizer (see docs/superpowers/specs/2026-07-24-trim-with-ai-design.md
 * and docs/superpowers/specs/2026-07-28-template-scoped-trim-design.md).
 * One non-streaming gpt-4.1-mini JSON-mode call, no tool-calling loop.
 *
 * Cached PER TEMPLATE (plans/27) — trim_cache is keyed by templateId, since
 * page count depends on which template is rendering the resume, not just its
 * content. A fresh generation is cached immediately with applied:false; the
 * frontend only starts rendering it once the user hits Apply (see the
 * sibling apply/route.ts), which just flips that flag — no regeneration.
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

    const { optimizedResumeId, templateId, editorState, pageTarget, currentPages } = body
    if (!optimizedResumeId || !templateId || !editorState || !pageTarget || !currentPages) {
        return NextResponse.json({ success: false, error: 'optimizedResumeId, templateId, editorState, pageTarget, and currentPages are required' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    const { data: row } = await sb
        .from('optimized_resumes')
        .select('job_id, trim_cache')
        .eq('id', optimizedResumeId)
        .eq('user_id', user.id)
        .maybeSingle()
    if (!row?.job_id) {
        return NextResponse.json({ success: false, error: 'No job found for this resume' }, { status: 404 })
    }

    // Identical repeat of a prior trim request FOR THIS TEMPLATE (same resume
    // content, same page counts) — return the cached result for free instead
    // of paying for another generation. Self-invalidating: any real edit
    // changes the fingerprint, so there's no separate cache-busting to
    // maintain.
    const fingerprint = computeTrimFingerprint(editorState, currentPages, pageTarget)
    const trimCacheByTemplate = (row.trim_cache ?? null) as TrimCacheByTemplate | null
    const cached = trimCacheByTemplate?.[templateId]
    if (cached?.fingerprint === fingerprint) {
        // fingerprint is echoed back on every success response (cache hit or
        // fresh generation) — the frontend (Task 5) has no client-side way to
        // compute it itself (this module is server-only, see the node:crypto
        // comment above), so it stores whatever fingerprint the server used
        // to decide whether ITS cached overlay is still fresh to render.
        return NextResponse.json({ success: true, changes: cached.changes, applied: cached.applied, cached: true, empty: isTrimEmpty(cached.changes), fingerprint })
    }

    // Cross-template reuse: the fingerprint already encodes content +
    // currentPages + pageTarget, and the OpenAI prompt (buildTrimPrompt)
    // carries no template-specific info at all — it only ever sees "this
    // resume is N pages, target M, condense it." So if ANOTHER template's
    // cache slot shows the same fingerprint (i.e. this template happens to
    // paginate the same content to the same page count), that template's
    // trim result is equally valid here. Reusing it skips a functionally
    // duplicate OpenAI call. `applied` is intentionally NOT carried over —
    // that flag tracks whether THIS template has had the trim applied, and
    // a fresh templateId slot has not, even if the underlying decision is
    // identical to one already applied elsewhere.
    if (trimCacheByTemplate) {
        const crossTemplateHit = Object.values(trimCacheByTemplate).find(entry => entry.fingerprint === fingerprint)
        if (crossTemplateHit) {
            const reusedEntry: TrimCache = { fingerprint, changes: crossTemplateHit.changes, cachedAt: new Date().toISOString(), applied: false }
            const nextTrimCacheByTemplate: TrimCacheByTemplate = { ...trimCacheByTemplate, [templateId]: reusedEntry }
            const { error: cacheWriteError } = await sb.from('optimized_resumes').update({ trim_cache: nextTrimCacheByTemplate }).eq('id', optimizedResumeId).eq('user_id', user.id)
            if (cacheWriteError) {
                console.error('[resume-edit/trim-to-fit] cross-template cache write failed:', cacheWriteError)
            }
            return NextResponse.json({ success: true, changes: crossTemplateHit.changes, applied: false, cached: true, reusedFromOtherTemplate: true, empty: isTrimEmpty(crossTemplateHit.changes), fingerprint })
        }
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

        const newEntry: TrimCache = { fingerprint, changes, cachedAt: new Date().toISOString(), applied: false }
        const nextTrimCacheByTemplate: TrimCacheByTemplate = { ...trimCacheByTemplate, [templateId]: newEntry }
        const { error: cacheWriteError } = await sb.from('optimized_resumes').update({ trim_cache: nextTrimCacheByTemplate }).eq('id', optimizedResumeId).eq('user_id', user.id)
        if (cacheWriteError) {
            console.error('[resume-edit/trim-to-fit] trim_cache write failed:', cacheWriteError)
        }

        if (isTrimEmpty(changes)) {
            return NextResponse.json({ success: true, changes, applied: false, empty: true, fingerprint })
        }
        return NextResponse.json({ success: true, changes, applied: false, fingerprint })
    } catch (err) {
        console.error('[resume-edit/trim-to-fit] generation failed:', err)
        return NextResponse.json({ success: false, error: 'Trim generation failed' }, { status: 502 })
    }
}
