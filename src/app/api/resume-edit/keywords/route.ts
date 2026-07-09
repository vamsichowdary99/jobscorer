import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { requireUserLimit } from '@/lib/rate-limit'
import { logUsage } from '@/lib/usage'
import type { AtsKeyword, AtsKeywordsData } from '@/lib/resume-edit/coverage'

function getOpenAI() {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

/**
 * POST /api/resume-edit/keywords — architecture doc §5 Layer 1 setup call.
 * Cache-before-everything: once optimized_resumes.ats_keywords is set for an
 * artifact, every subsequent call is a free read. Not quota-gated (only
 * rate-limited) — it only ever does one real LLM call per artifact lifetime,
 * matching the "cache-before-quota, hits cost 0" framing (architecture §3).
 */
export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limited = await requireUserLimit(user.id, 'resume-edit')
    if (limited) return limited

    let body: { optimizedResumeId?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const { optimizedResumeId } = body
    if (!optimizedResumeId) {
        return NextResponse.json({ error: 'optimizedResumeId is required' }, { status: 400 })
    }

    // Cast to any: hand-written Database type collapses this table's query
    // builder to `never` otherwise (same workaround as optimized-resumes/[id]/route.ts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any

    const { data: row, error: fetchErr } = await sb
        .from('optimized_resumes')
        .select('id, job_id, resume_id, ats_keywords')
        .eq('id', optimizedResumeId)
        .eq('user_id', user.id)
        .maybeSingle()

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (row.ats_keywords) {
        return NextResponse.json(row.ats_keywords as AtsKeywordsData)
    }

    const { data: job } = await sb
        .from('jobs')
        .select('title, description, required_skills')
        .eq('id', row.job_id)
        .maybeSingle()

    const { data: match } = await sb
        .from('user_job_matches')
        .select('matched_skills, missing_skills')
        .eq('user_id', user.id)
        .eq('job_id', row.job_id)
        .eq('resume_id', row.resume_id)
        .maybeSingle()

    const jobTitle = job?.title ?? ''
    const jobDescription: string = job?.description ?? ''
    const requiredSkills = Array.isArray(job?.required_skills) ? job.required_skills.join(', ') : ''
    const matchedSkills = Array.isArray(match?.matched_skills)
        ? match.matched_skills.map((s: unknown) => (typeof s === 'string' ? s : (s as { skill?: string })?.skill ?? '')).filter(Boolean).join(', ')
        : ''
    const missingSkills = Array.isArray(match?.missing_skills) ? (match.missing_skills as string[]).join(', ') : ''

    const prompt = `Job title: ${jobTitle}
Required skills: ${requiredSkills}
Matched skills (candidate already has, per prior AI scoring): ${matchedSkills}
Missing skills (candidate lacks, per prior AI scoring): ${missingSkills}
Job description:
${jobDescription.slice(0, 4000)}

Extract 20-30 ATS keywords a recruiter's applicant-tracking system would scan a resume for, given this job. Return JSON: {"keywords":[{"term":"...", "weight":1|2|3, "variants":["...","..."]}]}. weight 3 = explicitly required/critical, 2 = mentioned/important, 1 = nice-to-have/implied. variants = common alternate spellings/abbreviations (e.g. "JavaScript" -> ["JS"], "Amazon Web Services" -> ["AWS"]). Include both missing skills (so the candidate can see what to add) and matched skills (so coverage reflects what's already there).`

    let keywords: AtsKeyword[]
    let usage: { prompt_tokens?: number; completion_tokens?: number } = {}
    try {
        const response = await getOpenAI().chat.completions.create({
            model: 'gpt-4.1-mini',
            temperature: 0.2,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: 'You extract ATS resume keywords. Always return valid JSON matching the requested shape exactly.' },
                { role: 'user', content: prompt },
            ],
        })
        usage = response.usage ?? {}
        const raw = JSON.parse(response.choices[0]?.message?.content || '{}')
        keywords = Array.isArray(raw.keywords)
            ? raw.keywords
                .filter((k: unknown) => k && typeof (k as { term?: unknown }).term === 'string' && (k as { term: string }).term.trim())
                .map((k: { term: string; weight?: unknown; variants?: unknown }) => ({
                    term: k.term.trim(),
                    weight: [1, 2, 3].includes(k.weight as number) ? (k.weight as 1 | 2 | 3) : 2,
                    variants: Array.isArray(k.variants) ? k.variants.filter((v: unknown) => typeof v === 'string') : [],
                }))
                .slice(0, 30)
            : []
    } catch (err) {
        console.error('[resume-edit/keywords] extraction failed:', err)
        return NextResponse.json({ error: 'Keyword extraction failed' }, { status: 502 })
    }

    void logUsage({
        userId: user.id,
        feature: 'resume_edit',
        model: 'gpt-4.1-mini',
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
    })

    const ats_keywords: AtsKeywordsData = { keywords, extracted_at: new Date().toISOString() }
    const { error: updateErr } = await sb
        .from('optimized_resumes')
        .update({ ats_keywords })
        .eq('id', optimizedResumeId)
        .eq('user_id', user.id)

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    return NextResponse.json(ats_keywords)
}
