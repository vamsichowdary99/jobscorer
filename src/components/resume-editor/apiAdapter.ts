// resuscore/src/components/resume-editor/apiAdapter.ts
'use client'
import type { AssistantAdapter, AssistantEvent, Proposal } from './types'

interface StreamLine {
    type: 'tool_start' | 'tool_end' | 'text_delta' | 'done' | 'stopped' | 'error'
    name?: string
    result?: string
    delta?: string
    error?: string
}

/**
 * Real backend adapter — implements the FROZEN AssistantAdapter interface.
 * Consumes the NDJSON stream from /api/resume-edit/chat and maps it onto the
 * same AssistantEvent union the mock adapter already produces, so useAssistant.ts
 * and every UI component below it need zero changes.
 *
 * Deliberately does NOT emit `proposal_pending` on the propose_edit tool_start:
 * AssistantEvent has no "cancel pending" event, so if the validator rejects the
 * proposal (asking the user a question instead), a pending skeleton card would
 * be stuck forever with no way to clear it. `isTyping` already covers the wait
 * (cleared on the first text_delta or on `done`), so this only costs the
 * mock's ~850ms skeleton animation, not correctness.
 */
export function createApiAssistantAdapter(
    getOptimizedResumeId: () => string | null,
    getHistory: () => { role: 'user' | 'assistant'; content: string }[],
): AssistantAdapter {
    return {
        async *send(text, state): AsyncGenerator<AssistantEvent> {
            let res: Response
            try {
                res = await fetch('/api/resume-edit/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: text,
                        conversationHistory: getHistory(),
                        optimizedResumeId: getOptimizedResumeId(),
                        editorState: state,
                    }),
                })
            } catch {
                yield { type: 'text_delta', delta: 'Could not reach the assistant — check your connection and try again.' }
                yield { type: 'done' }
                return
            }

            if (!res.ok || !res.body) {
                let msg = 'Something went wrong reaching the assistant. Please try again.'
                try {
                    const data = await res.json()
                    if (typeof data?.error === 'string') msg = data.error
                } catch { /* non-JSON error body */ }
                yield { type: 'text_delta', delta: msg }
                yield { type: 'done' }
                return
            }

            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
                const { done: streamDone, value } = await reader.read()
                if (streamDone) break
                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() ?? ''

                for (const line of lines) {
                    if (!line.trim()) continue
                    let event: StreamLine
                    try {
                        event = JSON.parse(line)
                    } catch {
                        continue
                    }

                    if (event.type === 'text_delta' && event.delta) {
                        yield { type: 'text_delta', delta: event.delta }
                    } else if (event.type === 'error') {
                        yield { type: 'text_delta', delta: event.error || 'Something went wrong.' }
                    } else if (event.type === 'tool_end' && event.name === 'propose_edit' && event.result) {
                        try {
                            const parsed = JSON.parse(event.result) as { type?: string; proposal?: Proposal }
                            if (parsed?.type === 'edit_proposal' && parsed.proposal) {
                                yield { type: 'proposal', proposal: parsed.proposal }
                            }
                            // Any other shape (invalid_shape / unverified_metrics) is a
                            // rejection the model already sees via the tool result — it
                            // responds conversationally in the next text_delta, nothing
                            // to surface here.
                        } catch { /* malformed tool result — skip */ }
                    }
                }
            }

            yield { type: 'done' }
        },
    }
}
