import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: { status?: string }
    try { body = (await req.json()) as { status?: string } }
    catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

    const status = body.status === 'closed' ? 'closed' : body.status === 'open' ? 'open' : null
    if (!status) return NextResponse.json({ error: 'status must be open|closed' }, { status: 400 })

    // report_job_status derives the reporter from auth.uid() internally (the
    // user's session JWT is forwarded by the server client), so no user id is
    // passed from the client. `as any`: RPC isn't declared in the Database type
    // (same convention as match_jobs in lib/rag/search.ts).
    const { data, error } = await supabase.rpc('report_job_status' as any, {
        p_job_id: id, p_status: status,
    } as any)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, application_status: data })
}
