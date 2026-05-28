import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST — save a gap form response for one section
export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = await req.json()
        const { resume_id, section_name, was_skipped, data } = body

        if (!resume_id || !section_name) {
            return NextResponse.json({ error: 'resume_id and section_name are required' }, { status: 400 })
        }

        // Upsert gap_form_responses
        const { error: gapError } = await (supabase as any)
            .from('gap_form_responses')
            .upsert({
                user_id: user.id,
                resume_id,
                section_name,
                was_skipped: !!was_skipped,
                data: was_skipped ? null : data,
            }, { onConflict: 'user_id,resume_id,section_name' })

        if (gapError) {
            console.error('gap_form_responses upsert error:', gapError)
            return NextResponse.json({ error: gapError.message }, { status: 500 })
        }

        // If data was provided (not skipped), also update user_profile_data
        if (!was_skipped && data) {
            const updateFields: Record<string, any> = {}
            if (section_name === 'certifications') updateFields.certifications = data
            if (section_name === 'achievements') updateFields.achievements = data
            if (section_name === 'projects') updateFields.projects = data
            if (section_name === 'links') updateFields.links = data

            if (Object.keys(updateFields).length > 0) {
                await (supabase as any)
                    .from('user_profile_data')
                    .upsert({ user_id: user.id, ...updateFields }, { onConflict: 'user_id' })
            }
        }

        return NextResponse.json({ success: true })
    } catch (err: any) {
        console.error('Gap form save error:', err)
        return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 })
    }
}

// GET — return all gap form responses for a resume
export async function GET(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const resumeId = searchParams.get('resume_id')
    if (!resumeId) {
        return NextResponse.json({ error: 'resume_id is required' }, { status: 400 })
    }

    const { data, error } = await supabase
        .from('gap_form_responses')
        .select('section_name, was_skipped, data')
        .eq('user_id', user.id)
        .eq('resume_id', resumeId)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ responses: data ?? [] })
}
