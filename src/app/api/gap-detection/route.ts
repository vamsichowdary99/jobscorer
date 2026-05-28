import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectGaps } from '@/lib/gapDetection'
import type { ParsedResume } from '@/lib/types'

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

    try {
        // Fetch the resume's parsed data
        const { data: resume, error } = await supabase
            .from('resumes')
            .select('structured_data')
            .eq('id', resumeId)
            .eq('user_id', user.id)
            .single()

        if (error || !resume) {
            return NextResponse.json({ error: 'Resume not found' }, { status: 404 })
        }

        const parsedResume = (resume as any).structured_data as ParsedResume | null
        const gapAnalysis = await detectGaps(resumeId, user.id, parsedResume, supabase)

        return NextResponse.json(gapAnalysis)
    } catch (err: any) {
        console.error('Gap detection error:', err)
        return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 })
    }
}
