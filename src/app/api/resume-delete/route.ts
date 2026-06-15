import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Uses service role key to bypass RLS and cascade-delete all dependent records.
// Ownership is verified against the authenticated session BEFORE any delete runs.
const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    // AuthN + ownership: only the resume's owner may delete it.
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: owned, error: ownErr } = await adminSupabase
        .from('resumes')
        .select('user_id')
        .eq('id', id)
        .maybeSingle()
    if (ownErr) {
        return NextResponse.json({ error: ownErr.message }, { status: 500 })
    }
    if (!owned) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (owned.user_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete dependents first (order matters for FK constraints)
    await adminSupabase.from('user_job_matches').delete().eq('resume_id', id)
    await adminSupabase.from('gap_form_responses').delete().eq('resume_id', id)
    await adminSupabase.from('optimized_resumes').delete().eq('resume_id', id)

    // Try these — they may not exist yet, ignore errors
    try { await adminSupabase.from('resume_sections_audit').delete().eq('resume_id', id) } catch { }

    const { error } = await adminSupabase.from('resumes').delete().eq('id', id)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
