import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUserLimit } from '@/lib/rate-limit'
import { checkQuota } from '@/lib/plan'
import { logUsage } from '@/lib/usage'
import {
    PROJECT_COACH_MODEL,
    getOpenAI,
    resolveMilestoneContext,
    logInteraction,
} from '@/lib/projectCoach'

export const maxDuration = 60

const SYSTEM_PROMPT = `The candidate is stuck on a specific task. Be direct and specific.
If an error is provided, explain what caused it and give the exact fix.
If only context (no error) is provided, give the most likely issue for this task and the fix.
No padding. No encouragement. Just the fix.

This is a ONE-SHOT response: there is no chat, no follow-up turn, and the user cannot reply.
NEVER ask a question, NEVER offer to do something later ("let me know if...", "I can do that now
if you'd like"). Give your best diagnosis and fix directly — do not ask for more information.

CRITICAL — code fences are ONLY for literal runnable/copyable text (a command, a file's contents,
config, exact output). Every explanation — what went wrong, why, what to do — MUST be written as
real prose (sentences, bullet points), never as "#" or "//" comment-lines standing in for
sentences. Do NOT wrap your whole answer in one code block. A short diagnosis paragraph followed
by a small, separate code block with just the fix command(s) is correct; one giant commented-out
narrative inside a single fence is wrong.

Format your response as markdown (fenced code blocks with a language tag for any commands/config).`

/**
 * POST /api/project-coach/stuck
 * Body: { roadmap_id, milestone_id, task_index, error_text?, context? }
 * Never cached — always consumes a credit (error text/context vary per call).
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
    const error_text = typeof body.error_text === 'string' ? body.error_text.slice(0, 4000) : ''
    const context = typeof body.context === 'string' ? body.context.slice(0, 2000) : ''

    if (!roadmap_id || !milestone_id || task_index < 0) {
        return NextResponse.json(
            { success: false, error: 'Missing required fields: roadmap_id, milestone_id, task_index' },
            { status: 400 }
        )
    }
    if (!error_text && !context) {
        return NextResponse.json(
            { success: false, error: 'Provide an error message or describe what you tried' },
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

    const rl = await requireUserLimit(user.id, 'project-coach')
    if (rl) return rl

    const overQuota = await checkQuota(user.id, 'project_coach')
    if (overQuota) return overQuota

    const userMessage = `PROJECT: ${roadmap.project_name} (${roadmap.tech_stack.join(', ')})
TASK: ${task.title} — ${task.description}
ERROR (if any): ${error_text || 'none provided'}
CONTEXT: ${context || 'none provided'}`

    const openai = getOpenAI()
    let completion
    try {
        completion = await openai.chat.completions.create({
            model: PROJECT_COACH_MODEL,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMessage },
            ],
            temperature: 0.3,
        })
    } catch (err) {
        console.error('[project-coach:stuck] OpenAI error:', err)
        return NextResponse.json({ success: false, error: "I'm Stuck is temporarily unavailable" }, { status: 502 })
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
        actionType: 'stuck',
        cacheKey: null,
        userInput: JSON.stringify({ error_text, context }),
        aiResponse: content,
        tokensUsed: completion.usage?.total_tokens ?? null,
    })

    if (completion.usage) {
        void logUsage({
            userId: user.id,
            feature: 'project_coach_stuck',
            model: PROJECT_COACH_MODEL,
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
        })
    }

    return NextResponse.json({ success: true, content })
}
