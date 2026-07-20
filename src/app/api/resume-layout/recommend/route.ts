import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getResumeYearsOfExperience } from '@/lib/rag/resume-years'
import { LAYOUT_PRESETS } from '@/lib/resume-edit/layoutPresets'

/**
 * POST /api/resume-layout/recommend  { resume_id }
 *
 * Phase 3 (plans/25) — deterministic layout suggestion. Never applies
 * anything; the frontend shows a dismissible banner and only writes to
 * resume_layouts if the user clicks Apply.
 *
 * Classification is years-of-experience + target-role keyword matching only
 * — no LLM call. `getResumeYearsOfExperience` reads via the service-role
 * client (bypasses RLS), so ownership of `resume_id` is checked explicitly
 * below before it's used, rather than relying on a table RLS policy that
 * doesn't apply to that call.
 */

const ROLE_RULES: Array<{ re: RegExp; preset: string }> = [
    { re: /devops|site reliability|\bsre\b|infrastructure engineer/i, preset: 'devops' },
    { re: /security|cyber|soc analyst|pentest|penetration test/i, preset: 'cybersecurity' },
    { re: /cloud|solutions architect|\baws\b|\bazure\b|\bgcp\b/i, preset: 'cloud' },
    { re: /data analy|business analy|\bbi analyst\b/i, preset: 'data-analyst' },
    { re: /research|professor|academ|\bphd\b|postdoc/i, preset: 'academic' },
]

function yearsBucket(years: number): string {
    if (years <= 0) return 'fresher'
    if (years <= 3) return 'software-engineer'
    return 'experienced'
}

const REASONS: Record<string, (years: number) => string> = {
    fresher: () => "You're early in your career with strong project work — Projects First puts that up top.",
    'software-engineer': () => 'Solid hands-on experience — Experience First leads with your strongest signal.',
    devops: () => 'DevOps/SRE roles weigh infra experience and certifications heavily.',
    cybersecurity: () => 'Security roles lean on certifications as a hard filter — leading with them helps.',
    cloud: () => 'Cloud roles often screen on certifications (AWS/Azure/GCP) first.',
    'data-analyst': () => 'Highlights hands-on analysis experience and tooling for analyst roles.',
    experienced: (years) => `With ${years}+ years, Experience First leads with your track record.`,
    academic: () => 'Academic/research roles conventionally lead with Education.',
}

export async function POST(req: NextRequest) {
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
    if (!resumeId) {
        return NextResponse.json({ error: 'resume_id is required' }, { status: 400 })
    }

    // getResumeYearsOfExperience reads via the service-role client, which
    // bypasses RLS — verify ownership explicitly first (RLS on `resumes`
    // via this request-scoped client already restricts this to the caller's
    // own rows, but being explicit documents the intent and survives any
    // future change to that policy).
    const { data: owned } = await supabase
        .from('resumes')
        .select('id')
        .eq('id', resumeId)
        .eq('user_id', user.id)
        .maybeSingle()
    if (!owned) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const years = await getResumeYearsOfExperience(resumeId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('target_roles')
        .eq('id', user.id)
        .maybeSingle()
    const targetRole: string | null = Array.isArray(profile?.target_roles) ? (profile.target_roles[0] ?? null) : null

    const presetKey = (targetRole && ROLE_RULES.find(r => r.re.test(targetRole))?.preset) || yearsBucket(years)

    const preset = LAYOUT_PRESETS[presetKey]
    return NextResponse.json({
        recommended_preset: presetKey,
        label: preset.label,
        order: preset.order,
        reason: REASONS[presetKey](years),
    })
}
