import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUserLimit } from '@/lib/rate-limit'
import { checkQuota } from '@/lib/plan'
import { logUsage } from '@/lib/usage'
import {
    PROJECT_COACH_MODEL,
    getOpenAI,
    makeCacheKey,
    resolveMilestoneContext,
    getMatchedSkills,
    logInteraction,
} from '@/lib/projectCoach'

export const maxDuration = 60

const SYSTEM_PROMPT = `You are a technical mentor. You know ONLY the current task.
Do NOT reference other tasks or future milestones.
Be concrete. Give exact terminal commands. If the task has a deliverable file, generate its
COMPLETE content with inline comments explaining each line — do not show only a partial example.
Write like a senior engineer pair-programming remotely.

This is a ONE-SHOT response: there is no chat, no follow-up turn, and the user cannot reply.
NEVER ask a question, NEVER offer to do something later ("let me know if you want me to generate
that", "I can do that now if you'd like", "would you like me to..."). If something is worth doing,
just do it directly in this response — do not ask permission first.

CRITICAL — code fences are ONLY for literal runnable/copyable text: a command to run, a file's
complete contents, config, or exact expected output. Every explanation of WHY or WHAT — the
surrounding reasoning, what a step does, what to expect — MUST be written as real prose (sentences,
bullet points) outside the fence, never as "#" or "//" comment-lines standing in for sentences.
Keep each code block scoped to one thing (one command, or one file's contents) — do not merge
prose and multiple unrelated commands into a single giant fence.

Format your response as markdown (headings, bullet lists, fenced code blocks with a language tag).`

/**
 * POST /api/project-coach/teach-me
 * Body: { roadmap_id, milestone_id, task_index }
 * Cached permanently per (user_id, milestone_id, task_index) — cache hit costs 0 credits.
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
    const task_index = typeof body.task_index === 'number' ? body.task_index : -1

    if (!roadmap_id || !milestone_id || task_index < 0) {
        return NextResponse.json(
            { success: false, error: 'Missing required fields: roadmap_id, milestone_id, task_index' },
            { status: 400 }
        )
    }

    const ctx = await resolveMilestoneContext(supabase, user.id, roadmap_id, milestone_id)
    if (ctx instanceof NextResponse) return ctx
    const { roadmap, milestone } = ctx

    const task = milestone.tasks[task_index]
    if (!task) {
        return NextResponse.json({ success: false, error: 'Task not found at that index' }, { status: 404 })
    }

    // Cache check BEFORE rate limit / credit — a hit is free and instant.
    const cacheKey = makeCacheKey(user.id, milestone_id, task_index, 'teach_me')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cached } = await (supabase as any)
        .from('assistant_interactions')
        .select('ai_response')
        .eq('cache_key', cacheKey)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (cached) {
        return NextResponse.json({ success: true, cached: true, content: cached.ai_response })
    }

    const rl = await requireUserLimit(user.id, 'project-coach')
    if (rl) return rl

    // Monthly credit limit — only reached on a cache miss (cached hits already returned above).
    const overQuota = await checkQuota(user.id, 'project_coach')
    if (overQuota) return overQuota

    const matchedSkills = await getMatchedSkills(supabase, user.id, roadmap)

    const userMessage = `PROJECT: ${roadmap.project_name} (${roadmap.tech_stack.join(', ')})
MILESTONE ${milestone.milestone_number}: ${milestone.title}
CURRENT TASK: ${task.title} — ${task.description}
DELIVERABLE: ${task.deliverable?.name || 'none'}
CANDIDATE HAS: ${matchedSkills.join(', ') || 'no matched skills on file'}
EXAMPLE REPO: ${task.github_example?.url || 'none'}

Teach this specific task. Include exact commands.
If there is a deliverable, generate the file with inline comments after the explanation.`

    const openai = getOpenAI()
    let completion
    try {
        completion = await openai.chat.completions.create({
            model: PROJECT_COACH_MODEL,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMessage },
            ],
            temperature: 0.4,
        })
    } catch (err) {
        console.error('[project-coach:teach-me] OpenAI error:', err)
        return NextResponse.json({ success: false, error: 'Teach Me is temporarily unavailable' }, { status: 502 })
    }

    const content = completion.choices[0]?.message?.content?.trim()
    if (!content) {
        return NextResponse.json({ success: false, error: 'Empty response from AI' }, { status: 502 })
    }

    void logInteraction({
        supabase,
        userId: user.id,
        roadmapId: roadmap_id,
        milestoneId: milestone_id,
        actionType: 'teach_me',
        cacheKey,
        userInput: null,
        aiResponse: content,
        tokensUsed: completion.usage?.total_tokens ?? null,
    })

    if (completion.usage) {
        void logUsage({
            userId: user.id,
            feature: 'project_coach_teach_me',
            model: PROJECT_COACH_MODEL,
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
        })
    }

    return NextResponse.json({ success: true, cached: false, content })
}
