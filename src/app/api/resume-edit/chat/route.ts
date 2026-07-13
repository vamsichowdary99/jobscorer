import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { editorTools } from '@/lib/resume-edit/tool-definitions'
import { executeEditorTool } from '@/lib/resume-edit/tools'
import { createClient } from '@/lib/supabase/server'
import { requireUserLimit } from '@/lib/rate-limit'
import { logUsage } from '@/lib/usage'
import { checkQuota } from '@/lib/plan'
import type { AtsKeyword } from '@/lib/resume-edit/coverage'
import type { ResumeEditorState } from '@/lib/types'

const CHAT_MODEL = 'gpt-4.1-mini'

function getOpenAI() {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

// Kept as the ENTIRE system message — never mixed with the mutable resume
// state — so it's a byte-identical prefix on every call. Combined with the
// tools array (also static) and conversationHistory (only ever appended to,
// never rewritten), this maximizes what OpenAI's automatic prompt-cache can
// discount (75% off gpt-4.1-mini's cached-token rate). The resume state
// lives on the FINAL user message instead (see `messages` below) — it's the
// only thing that changes every turn, so it's the only part that must stay
// uncached. (Post-Phase-3 cost pass: this used to be concatenated onto the
// resume state in one system message, which meant every accepted edit
// changed the system message and broke caching for the whole prefix,
// including conversation history that hadn't changed at all.)
const SYSTEM_PROMPT = `You are the Resume Studio editing assistant for JobScorer. You propose small, targeted edits to ONE resume section at a time — you never invent facts, and you never write anything yourself. Every change goes through the propose_edit tool and the user must click Accept in the UI.

THE ONE HARD RULE — NEVER INVENT A NUMBER, PERCENTAGE, DOLLAR AMOUNT, OR DURATION. A number is only allowed in new_value if it already appears somewhere in the resume state you were given, or the user typed it in this conversation. If you want to add a number that isn't already verifiable, you MUST ask the user for it conversationally instead of guessing — offer concrete options (e.g. "keep it as your estimate", "remove the number", "rewrite it without a number").

Example — no metric available:
User: "make my first bullet stronger"
You: "Roughly how big was that impact — a ballpark is fine, I won't invent a number. Or I can strengthen the verbs without adding a figure."

Example — strengthen without inventing a number:
User: "tighten this bullet, I don't have a number for it"
You: propose_edit with stronger action verbs and no new numeric claim, metric_sources omitted.

propose_edit targets exactly one of: the whole summary, one technical-skills field (skills_field required), or one bullet in one experience/project entry (index + bullet_index required — call get_job_context/get_match_details first if you need to know which entry to target and aren't sure). It cannot add or remove whole entries yet — if asked to add a new project or experience entry, say that's not supported yet and offer to strengthen the wording of what's already there instead.

For every number in new_value, include a metric_sources entry: source:"original_resume" with a verbatim quote from the resume state below, or source:"user_message" with a verbatim quote from something the user typed. If propose_edit rejects your proposal with an "unverified_metrics" error, do NOT retry with the same number — ask the user conversationally per the rule above.

ANOTHER HARD RULE — ALWAYS CHECK BEFORE CLAIMING A SKILL, BUT NEVER REFUSE THE USER. If the user asks you to add a skill or technology that is not already visible in the resume state below, you MUST call get_user_evidence (optionally with that skill) BEFORE proposing anything. If it returns a matching completed project, propose the edit and cite it: metric_sources source:"project_evidence" with a verbatim quote from that tool's result. If it returns NO matching evidence, still propose the edit exactly as the user asked — call propose_edit with unverified_skill:true. This puts a clear warning badge on the card in the UI; the user decides whether to Accept or Reject it themselves. Do NOT silently add an unverified skill without unverified_skill:true, and do NOT refuse to propose it outright — that decision belongs to the user, not you. You may briefly mention in your reply that you couldn't verify it in their completed JobScorer work, but still call propose_edit in the same turn.

Tool routing: call get_job_context and get_match_details before tailoring content to the target job or making ATS-friendliness claims. Call get_ats_keywords before claiming a keyword is missing. Keep responses short — 1-3 sentences — since the UI shows the actual proposed change in a diff card, not in your text.

BATCH REQUESTS: if the user's message lists multiple improvements to apply at once (e.g. a numbered list), call propose_edit once for EACH one, in the same turn — you can make several tool calls before your final reply. Do not stop after the first one and wait to be asked again.`

export const maxDuration = 60

interface ResumeEditChatRequest {
    message: string
    conversationHistory: { role: 'user' | 'assistant'; content: string }[]
    optimizedResumeId: string | null
    editorState: ResumeEditorState
}

export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limited = await requireUserLimit(user.id, 'resume-edit')
    if (limited) return limited

    const overQuota = await checkQuota(user.id, 'resume_edit')
    if (overQuota) return overQuota

    let body: ResumeEditChatRequest
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
    }

    const { message, conversationHistory, optimizedResumeId, editorState } = body
    if (!message || !editorState) {
        return NextResponse.json({ error: 'message and editorState are required.' }, { status: 400 })
    }

    const userId = user.id
    const openai = getOpenAI()

    const userMessages = [
        ...(conversationHistory ?? []).filter(m => m.role === 'user').map(m => m.content),
        message,
    ]

    // For propose_edit's real coverage-delta "est." — cheap read, no-op if
    // /api/resume-edit/keywords hasn't run for this artifact yet.
    let atsKeywords: AtsKeyword[] = []
    if (optimizedResumeId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabase as any
        const { data: row } = await sb
            .from('optimized_resumes')
            .select('ats_keywords')
            .eq('id', optimizedResumeId)
            .eq('user_id', userId)
            .maybeSingle()
        atsKeywords = row?.ats_keywords?.keywords ?? []
    }

    // Resume state goes on the newest user turn, not the system message — see
    // the comment on SYSTEM_PROMPT above for why (prompt-cache preservation).
    const messages: OpenAI.ChatCompletionMessageParam[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...(conversationHistory ?? []).map((msg) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
        })),
        {
            role: 'user',
            content: `## Current resume state (JSON) — always reflects the latest edits, including ones the user just made manually\n${JSON.stringify(editorState)}\n\n## User message\n${message}`,
        },
    ]

    const abortSignal = req.signal

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const encoder = new TextEncoder()
            const emit = (event: Record<string, unknown>) => {
                try {
                    controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
                } catch {
                    // controller may already be closed if the client aborted
                }
            }

            const t0 = Date.now()
            try {
                let iterations = 0
                let assistantMessage: OpenAI.ChatCompletionMessage | null = null
                let promptTokens = 0
                let completionTokens = 0
                let cachedTokens = 0

                while (iterations < 5) {
                    if (abortSignal.aborted) throw new Error('aborted')

                    const response = await openai.chat.completions.create(
                        {
                            model: CHAT_MODEL,
                            messages,
                            tools: editorTools,
                            tool_choice: 'auto',
                            max_tokens: 1024,
                        },
                        { signal: abortSignal },
                    )
                    promptTokens += response.usage?.prompt_tokens ?? 0
                    completionTokens += response.usage?.completion_tokens ?? 0
                    cachedTokens += response.usage?.prompt_tokens_details?.cached_tokens ?? 0
                    const choice = response.choices[0]
                    if (!choice) throw new Error('No completion choice returned from model')
                    assistantMessage = choice.message

                    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
                        break
                    }

                    iterations++
                    messages.push(assistantMessage)

                    for (const toolCall of assistantMessage.tool_calls as OpenAI.ChatCompletionMessageFunctionToolCall[]) {
                        if (abortSignal.aborted) throw new Error('aborted')
                        emit({ type: 'tool_start', name: toolCall.function.name })

                        let args: Record<string, unknown>
                        try {
                            args = JSON.parse(toolCall.function.arguments)
                        } catch {
                            args = {}
                        }
                        const t0 = Date.now()
                        const result = await executeEditorTool(toolCall.function.name, args, userId, {
                            optimizedResumeId,
                            editorState,
                            userMessages,
                            atsKeywords,
                        })
                        const durationMs = Date.now() - t0
                        emit({ type: 'tool_end', name: toolCall.function.name, durationMs, result })

                        messages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: result,
                        })
                    }
                }

                void logUsage({
                    userId,
                    feature: 'resume_edit',
                    model: CHAT_MODEL,
                    promptTokens,
                    completionTokens,
                    cachedTokens,
                    latencyMs: Date.now() - t0,
                })

                const finalText =
                    (assistantMessage && assistantMessage.content) ||
                    'Sorry, I could not generate a response.'

                const CHUNK_SIZE = 4
                const DELAY_MS = 12
                for (let i = 0; i < finalText.length; i += CHUNK_SIZE) {
                    if (abortSignal.aborted) throw new Error('aborted')
                    emit({ type: 'text_delta', delta: finalText.slice(i, i + CHUNK_SIZE) })
                    if (DELAY_MS > 0) await new Promise(r => setTimeout(r, DELAY_MS))
                }

                emit({ type: 'done' })
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'An unexpected error occurred.'
                if (message === 'aborted' || (err as { name?: string })?.name === 'AbortError') {
                    emit({ type: 'stopped' })
                } else {
                    console.error('Resume-edit chat API error:', err)
                    emit({ type: 'error', error: message })
                }
            } finally {
                try { controller.close() } catch { /* already closed */ }
            }
        },
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no',
        },
    })
}
