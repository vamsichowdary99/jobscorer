import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

function serviceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

// POST /api/build-plan/select-project
// Marks one build-plan-suggested project as selected — this is what actually
// puts it in the "Your Projects" library (fetchBuildPlanProjectSummaries only
// returns ids in this list). Fired when the user clicks "Learn it" on a
// project in BuildPlanModal; merely being AI-suggested is not enough.
export async function POST(request: NextRequest) {
    const userClient = await createServerClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const resume_id = body?.resume_id
    const job_id = body?.job_id
    const build_plan_project_id = body?.build_plan_project_id
    if (!resume_id || !job_id || !build_plan_project_id) {
        return NextResponse.json({ error: 'Missing resume_id, job_id, or build_plan_project_id' }, { status: 400 })
    }

    const supabase = serviceClient()
    const { data: row, error: fetchErr } = await supabase
        .from('resume_build_recommendations')
        .select('id, selected_project_ids')
        .eq('user_id', user.id)
        .eq('resume_id', resume_id)
        .eq('job_id', job_id)
        .maybeSingle()

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    if (!row) return NextResponse.json({ error: 'No build plan found for this resume/job' }, { status: 404 })

    const existing: string[] = (row as { selected_project_ids?: string[] }).selected_project_ids ?? []
    if (existing.includes(build_plan_project_id)) {
        return NextResponse.json({ success: true, already_selected: true })
    }

    const { error: updateErr } = await supabase
        .from('resume_build_recommendations')
        .update({ selected_project_ids: [...existing, build_plan_project_id] })
        .eq('id', (row as { id: string }).id)

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    return NextResponse.json({ success: true })
}
