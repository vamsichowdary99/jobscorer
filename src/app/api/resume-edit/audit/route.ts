import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { requireUserLimit } from '@/lib/rate-limit'
import { checkQuota } from '@/lib/plan'
import { logUsage } from '@/lib/usage'
import { generateATSText } from '@/lib/resume-edit/atsText'
import type { ResumeEditorState } from '@/lib/types'

function getOpenAI() {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

// Cached audit regenerates once this many accepted edits have landed since
// it was last generated (architecture doc §3's "edits_since counter").
const REGEN_THRESHOLD = 5
const VALID_SECTIONS = ['summary', 'skills', 'experience', 'projects']

interface AuditSuggestionItem {
    title: string
    section: 'summary' | 'skills' | 'experience' | 'projects'
    prompt: string
    impact: number
}

interface CachedSuggestions {
    items: AuditSuggestionItem[]
    generated_at: string
    edits_since: number
}

/**
 * POST /api/resume-edit/audit — the real "AI found N improvements" panel
 * (Plan 21 Phase 3), replacing the mock's hardcoded seedAuditItems(). Cached
 * per artifact in optimized_resumes.suggestions; regeneration counts as one
 * resume_edit message (checkQuota), cache hits are free (architecture §3).
 */
export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limited = await requireUserLimit(user.id, 'resume-edit')
    if (limited) return limited

    let body: { optimizedResumeId?: string; editorState?: ResumeEditorState }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const { optimizedResumeId, editorState } = body
    if (!optimizedResumeId || !editorState) {
        return NextResponse.json({ error: 'optimizedResumeId and editorState are required' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    const { data: row, error: fetchErr } = await sb
        .from('optimized_resumes')
        .select('id, job_id, resume_id, suggestions')
        .eq('id', optimizedResumeId)
        .eq('user_id', user.id)
        .maybeSingle()

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const cached = row.suggestions as CachedSuggestions | null
    if (cached && (cached.edits_since ?? 0) < REGEN_THRESHOLD) {
        return NextResponse.json(cached)
    }

    const overQuota = await checkQuota(user.id, 'resume_edit')
    if (overQuota) return overQuota

    const { data: job } = await sb
        .from('jobs')
        .select('title, description, required_skills')
        .eq('id', row.job_id)
        .maybeSingle()

    const { data: match } = await sb
        .from('user_job_matches')
        .select('missing_skills, matched_skills')
        .eq('user_id', user.id)
        .eq('job_id', row.job_id)
        .eq('resume_id', row.resume_id)
        .maybeSingle()

    const resumeText = generateATSText(editorState)
    const missingSkills = Array.isArray(match?.missing_skills) ? (match.missing_skills as string[]).join(', ') : ''
    const jobTitle: string = job?.title ?? ''
    const jobDescription: string = job?.description ?? ''

    const prompt = `Resume (plain text):
${resumeText.slice(0, 6000)}

Target job: ${jobTitle}
Missing skills per prior AI scoring: ${missingSkills || 'none identified'}
Job description excerpt:
${jobDescription.slice(0, 2000)}

You are auditing this resume for a Resume Studio "AI found N improvements" panel. Generate 3-6 specific, actionable improvement suggestions grounded in THIS resume and job — not generic advice. Each suggestion must target exactly ONE of: the summary, one technical-skills field, or one bullet in one experience/project entry (this editor can only edit existing text, not add or remove whole entries). Return JSON: {"items":[{"title":"short imperative label for a checklist, e.g. 'Quantify your first experience bullet'","section":"summary|skills|experience|projects","prompt":"a natural-language instruction to send to the resume editor chat agent that would produce this fix, phrased as the user would type it, e.g. 'quantify my first experience bullet'","impact":1-6}]}. Order items by impact descending.`

    let items: AuditSuggestionItem[]
    let usage: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } = {}
    const t0 = Date.now()
    try {
        const response = await getOpenAI().chat.completions.create({
            model: 'gpt-4.1-mini',
            temperature: 0.4,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: 'You audit resumes for a job application tool. Always return valid JSON matching the requested shape exactly.' },
                { role: 'user', content: prompt },
            ],
        })
        usage = response.usage ?? {}
        const raw = JSON.parse(response.choices[0]?.message?.content || '{}')
        items = Array.isArray(raw.items)
            ? raw.items
                .filter((i: unknown) => i && typeof (i as { title?: unknown }).title === 'string' && typeof (i as { prompt?: unknown }).prompt === 'string')
                .map((i: { title: string; section?: unknown; prompt: string; impact?: unknown }) => ({
                    title: i.title.slice(0, 200),
                    section: VALID_SECTIONS.includes(i.section as string) ? (i.section as AuditSuggestionItem['section']) : 'summary',
                    prompt: i.prompt.slice(0, 300),
                    impact: Number.isInteger(i.impact) ? Math.min(6, Math.max(1, i.impact as number)) : 2,
                }))
                .slice(0, 6)
            : []
    } catch (err) {
        console.error('[resume-edit/audit] generation failed:', err)
        return NextResponse.json({ error: 'Audit generation failed' }, { status: 502 })
    }

    void logUsage({
        userId: user.id,
        feature: 'resume_edit',
        model: 'gpt-4.1-mini',
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
        latencyMs: Date.now() - t0,
    })

    const suggestions: CachedSuggestions = { items, generated_at: new Date().toISOString(), edits_since: 0 }
    const { error: updateErr } = await sb
        .from('optimized_resumes')
        .update({ suggestions })
        .eq('id', optimizedResumeId)
        .eq('user_id', user.id)

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    return NextResponse.json(suggestions)
}
