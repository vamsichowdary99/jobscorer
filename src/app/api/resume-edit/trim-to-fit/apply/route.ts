import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { TrimCacheByTemplate } from '@/lib/resume-edit/trimFingerprint'

interface ApplyRequestBody {
    optimizedResumeId?: string
    templateId?: string
    applied?: boolean
}

/**
 * POST /api/resume-edit/trim-to-fit/apply — flips whether a template's
 * already-generated (and cached) trim is actually used when rendering that
 * template. No OpenAI call, no fingerprint recompute: the generation was
 * cached as soon as it came back in the main route, applied:false; clicking
 * "Apply" in TrimReviewPanel calls this with applied:true, "Cancel" never
 * calls this at all (the cache just stays applied:false, cheap to re-review
 * later without paying for another generation). See
 * docs/superpowers/specs/2026-07-28-template-scoped-trim-design.md.
 */
export async function POST(request: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    let body: ApplyRequestBody
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
    }

    const { optimizedResumeId, templateId, applied } = body
    if (!optimizedResumeId || !templateId || typeof applied !== 'boolean') {
        return NextResponse.json({ success: false, error: 'optimizedResumeId, templateId, and applied are required' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    const { data: row } = await sb
        .from('optimized_resumes')
        .select('trim_cache')
        .eq('id', optimizedResumeId)
        .eq('user_id', user.id)
        .maybeSingle()
    const trimCacheByTemplate = (row?.trim_cache ?? null) as TrimCacheByTemplate | null
    const entry = trimCacheByTemplate?.[templateId]
    if (!entry) {
        return NextResponse.json({ success: false, error: 'No cached trim found for this template — generate one first' }, { status: 404 })
    }

    const nextTrimCacheByTemplate: TrimCacheByTemplate = { ...trimCacheByTemplate, [templateId]: { ...entry, applied } }
    const { error } = await sb.from('optimized_resumes').update({ trim_cache: nextTrimCacheByTemplate }).eq('id', optimizedResumeId).eq('user_id', user.id)
    if (error) {
        return NextResponse.json({ success: false, error: 'Failed to save' }, { status: 500 })
    }

    return NextResponse.json({ success: true, trim_cache: nextTrimCacheByTemplate })
}
