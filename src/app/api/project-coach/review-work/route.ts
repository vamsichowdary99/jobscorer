import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUserLimit } from '@/lib/rate-limit'
import { checkQuota } from '@/lib/plan'
import { logUsage } from '@/lib/usage'
import type { CheckpointResult } from '@/lib/types'
import {
    PROJECT_COACH_MODEL,
    getOpenAI,
    resolveMilestoneContext,
    logInteraction,
} from '@/lib/projectCoach'
import { checkMissingGithubFiles } from '@/lib/githubCheck'

export const maxDuration = 60

const SYSTEM_PROMPT = `You are a technical reviewer. Check if the candidate's milestone work is complete and correct.
Be direct. Be accurate, not encouraging.
Respond ONLY with a JSON object of the exact shape: {"passed": boolean, "feedback": string, "issues": string[]}.
"issues" lists specific, numbered-in-spirit problems (one string per issue). If passed is true, issues should be an empty array.`

/**
 * POST /api/project-coach/review-work
 * Body: { roadmap_id, milestone_id, github_url? }
 * Never cached — always consumes a credit. Shares the underlying AI call with
 * Checkpoint Review (Phase 5 wires this into milestone advancement).
 */
export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: Record<string, unknown>
    try {
        body = (await req.json()) as Record<string, unknown>
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
    }

    const roadmap_id = typeof body.roadmap_id === 'string' ? body.roadmap_id : ''
    const milestone_id = typeof body.milestone_id === 'string' ? body.milestone_id : ''
    const submitted_github_url = typeof body.github_url === 'string' ? body.github_url : ''

    if (!roadmap_id || !milestone_id) {
        return NextResponse.json(
            { success: false, error: 'Missing required fields: roadmap_id, milestone_id' },
            { status: 400 }
        )
    }

    const ctx = await resolveMilestoneContext(supabase, user.id, roadmap_id, milestone_id)
    if (ctx instanceof NextResponse) return ctx
    const { milestone } = ctx

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: progress } = await (supabase as any)
        .from('milestone_progress')
        .select('checklist_state, github_url')
        .eq('user_id', user.id)
        .eq('milestone_id', milestone_id)
        .maybeSingle()

    const checklistState: boolean[] = Array.isArray(progress?.checklist_state) ? progress.checklist_state : []
    const githubUrl = submitted_github_url || progress?.github_url || ''

    // Flatten in the same task-then-item order the frontend writes checklist_state in.
    let offset = 0
    const missingRequired: string[] = []
    const taskLines: string[] = milestone.tasks.map((task, taskIdx) => {
        const items = (task.checklist || []).map((item, itemIdx) => {
            const checked = checklistState[offset + itemIdx] === true
            if (item.required && !checked) missingRequired.push(`Task ${taskIdx + 1} (${task.title}): ${item.item}`)
            return `  - [${checked ? 'x' : ' '}] ${item.item}${item.required ? ' (required)' : ''}`
        })
        offset += (task.checklist || []).length
        return `Task ${taskIdx + 1}: ${task.title}\n${items.join('\n')}`
    })

    // Cheap guard — don't spend a credit/AI call reviewing obviously incomplete work.
    if (missingRequired.length > 0) {
        const result: CheckpointResult = {
            passed: false,
            feedback: 'Complete all required checklist items before requesting a review.',
            issues: missingRequired,
        }
        return NextResponse.json({ success: true, ...result })
    }

    const rl = await requireUserLimit(user.id, 'project-coach')
    if (rl) return rl

    const overQuota = await checkQuota(user.id, 'project_coach')
    if (overQuota) return overQuota

    const userMessage = `MILESTONE: ${milestone.title} — ${milestone.goal}
TASKS AND CHECKLISTS:
${taskLines.join('\n\n')}
GITHUB URL: ${githubUrl || 'not provided'}`

    const openai = getOpenAI()
    let completion
    try {
        completion = await openai.chat.completions.create({
            model: PROJECT_COACH_MODEL,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMessage },
            ],
            temperature: 0.2,
            response_format: { type: 'json_object' },
        })
    } catch (err) {
        console.error('[project-coach:review-work] OpenAI error:', err)
        return NextResponse.json({ success: false, error: 'Review My Work is temporarily unavailable' }, { status: 502 })
    }

    const raw = completion.choices[0]?.message?.content?.trim()
    if (!raw) {
        return NextResponse.json({ success: false, error: 'Empty response from AI' }, { status: 502 })
    }

    let result: CheckpointResult
    try {
        const parsed = JSON.parse(raw)
        result = {
            passed: parsed.passed === true,
            feedback: typeof parsed.feedback === 'string' ? parsed.feedback : '',
            issues: Array.isArray(parsed.issues) ? parsed.issues.filter((i: unknown) => typeof i === 'string') : [],
        }
    } catch {
        console.error('[project-coach:review-work] non-JSON AI response:', raw.slice(0, 300))
        return NextResponse.json({ success: false, error: 'Review returned an unreadable result — try again' }, { status: 502 })
    }

    // v2 GitHub validation: one Contents-API presence check per deliverable file this
    // milestone requires. A missing file is a hard, deterministic signal — it overrides
    // an AI "passed" verdict, since text-only review can't see the actual repo contents.
    if (githubUrl) {
        const deliverableNames = Array.from(
            new Set(milestone.tasks.map((t) => t.deliverable?.name).filter((n): n is string => !!n)),
        )
        const missingFiles = await checkMissingGithubFiles(githubUrl, deliverableNames)
        if (missingFiles.length > 0) {
            result.passed = false
            result.issues = [
                ...result.issues,
                ...missingFiles.map((f) => `${f} not found in the submitted GitHub repository`),
            ]
        }
    }

    void logInteraction({
        supabase,
        userId: user.id,
        roadmapId: roadmap_id,
        milestoneId: milestone_id,
        actionType: 'review_work',
        cacheKey: null,
        userInput: JSON.stringify({ github_url: githubUrl }),
        aiResponse: JSON.stringify(result),
        tokensUsed: completion.usage?.total_tokens ?? null,
    })

    if (completion.usage) {
        void logUsage({
            userId: user.id,
            feature: 'project_coach_review_work',
            model: PROJECT_COACH_MODEL,
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
        })
    }

    return NextResponse.json({ success: true, ...result })
}
