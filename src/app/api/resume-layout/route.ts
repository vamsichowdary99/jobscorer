import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/resume-layout?resume_id=X&job_id=Y
 * PUT /api/resume-layout  { resume_id, job_id?, section_order, hidden_sections?, page_target? }
 *
 * Phase 2 (plans/25) — job_id omitted/null reads or writes the master
 * resume's default layout. Phase 5 added job_id support: passing it scopes
 * the row to a per-job override on a tailored (optimized_resumes) copy,
 * never touching the master's row. RLS on resume_layouts enforces
 * ownership; no service-role client needed.
 */

export async function GET(req: NextRequest) {
    const resumeId = req.nextUrl.searchParams.get('resume_id')
    const jobId = req.nextUrl.searchParams.get('job_id') || null
    if (!resumeId) {
        return NextResponse.json({ error: 'resume_id is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // resume_layouts is keyed globally on (resume_id, job_id) — verify the
    // caller owns this resume_id before touching that table, so one user
    // can't reference another user's resume_id (RLS on resume_layouts only
    // scopes rows by the layout's own user_id, not by resume_id ownership).
    const { data: owned } = await supabase
        .from('resumes')
        .select('id')
        .eq('id', resumeId)
        .eq('user_id', user.id)
        .maybeSingle()
    if (!owned) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
        .from('resume_layouts')
        .select('id, section_order, hidden_sections, page_target, updated_at')
        .eq('resume_id', resumeId)
    query = jobId ? query.eq('job_id', jobId) : query.is('job_id', null)
    const { data, error } = await query.maybeSingle()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ layout: data ?? null })
}

export async function PUT(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: Record<string, unknown>
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const resumeId = typeof body.resume_id === 'string' ? body.resume_id : null
    const jobId = typeof body.job_id === 'string' ? body.job_id : null
    const sectionOrder = Array.isArray(body.section_order) ? body.section_order.filter(k => typeof k === 'string') : null
    if (!resumeId || !sectionOrder) {
        return NextResponse.json({ error: 'resume_id and section_order are required' }, { status: 400 })
    }
    const hiddenSections = Array.isArray(body.hidden_sections) ? body.hidden_sections.filter(k => typeof k === 'string') : []
    const pageTarget = typeof body.page_target === 'number' ? body.page_target : 1

    // See the GET handler above for why this check is needed even though
    // resume_layouts itself has RLS.
    const { data: owned } = await supabase
        .from('resumes')
        .select('id')
        .eq('id', resumeId)
        .eq('user_id', user.id)
        .maybeSingle()
    if (!owned) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let existingQuery = (supabase as any)
        .from('resume_layouts')
        .select('id')
        .eq('resume_id', resumeId)
    existingQuery = jobId ? existingQuery.eq('job_id', jobId) : existingQuery.is('job_id', null)
    const { data: existing } = await existingQuery.maybeSingle()

    const row = {
        user_id: user.id,
        resume_id: resumeId,
        job_id: jobId,
        section_order: sectionOrder,
        hidden_sections: hiddenSections,
        page_target: pageTarget,
        updated_at: new Date().toISOString(),
    }

    const { error } = existing
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? await (supabase as any).from('resume_layouts').update(row).eq('id', existing.id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : await (supabase as any).from('resume_layouts').insert(row)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
}
