// resuscore/src/components/resume-editor/useAssistant.ts
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ResumeEditorState } from '@/lib/types'
import type { Proposal, ProposalTarget, AuditItem, AssistantEvent, AssistantAdapter, AssistantButton } from './types'
import type { DecorationsMap } from './types'
import { applyProposal, readProposalTarget } from '@/lib/resume-edit/apply'
import { decorationKey } from './PreviewDecorations'
import { persistEditorState } from '@/lib/resume-edit/persist'
import { createApiAssistantAdapter } from './apiAdapter'
import { computeKeywordCoverage, type AtsKeyword, type AtsKeywordsData } from '@/lib/resume-edit/coverage'
import { generateATSText } from '@/lib/resume-edit/atsText'

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
let seq = 0
const uid = () => `ra-${Date.now()}-${++seq}`

export interface ChatMessage {
    id: string
    kind: 'user' | 'assistant' | 'applied' | 'rejected' | 'buttons'
    text?: string
    streaming?: boolean
    pts?: number
    buttons?: { label: string; onClick: () => void }[]
    onUndo?: () => void
}

export interface ActiveCard {
    proposal: Proposal
    state: 'pending' | 'active' | 'editing' | 'applied' | 'rejected'
}

export interface Toast { id: string; text: string; onUndo: () => void }

export interface AssistantController {
    messages: ChatMessage[]
    isTyping: boolean
    coverage: number
    coverageStart: number
    coverageMax: number
    // Exposed so callers outside this hook (page.tsx's manual section-modal
    // save) can compute a coverage snapshot for their own edit_history entries
    // using the same computeKeywordCoverage(atsKeywords, generateATSText(state))
    // pure functions, without racing this hook's own async state updates.
    atsKeywords: AtsKeyword[]
    floatDelta: { value: string; key: number } | null
    rescoring: boolean
    rescoredCaption: string
    auditItems: AuditItem[]
    allDone: boolean
    // Audit generation is manual (button-triggered), not auto-fetched on
    // resume load — see onFindImprovements. auditGenerated distinguishes
    // "never asked" from "asked, everything already fixed" (both look like
    // an empty/all-done items array otherwise).
    auditGenerated: boolean
    auditLoading: boolean
    activeCard: ActiveCard | null
    decorations: DecorationsMap
    toasts: Toast[]
    inputValue: string
    setInputValue: (v: string) => void
    sendMessage: (text: string) => void
    sendChip: (chip: string) => void
    onAuditItemClick: (id: string) => void
    onFindImprovements: () => void
    onApplyAll: () => void
    onRescore: () => void
    applyActiveCard: (text?: string) => void
    rejectActiveCard: () => void
    editActiveCard: () => void
    dismissToast: (id: string) => void
}

function longestBulletTarget(state: ResumeEditorState): (ProposalTarget & { entryLabel: string; text: string }) | null {
    type Best = { index: number; bulletIndex: number; text: string; company: string }
    let best: Best | undefined
    for (let i = 0; i < state.experience.length; i++) {
        const exp = state.experience[i]
        for (let j = 0; j < exp.bullets.length; j++) {
            const b = exp.bullets[j]
            if (!best || b.length > best.text.length) best = { index: i, bulletIndex: j, text: b, company: exp.company }
        }
    }
    if (!best) return null
    return { section: 'experience', index: best.index, bulletIndex: best.bulletIndex, entryLabel: best.company || 'Experience', text: best.text }
}

function firstBulletTarget(state: ResumeEditorState): (ProposalTarget & { entryLabel: string; text: string }) | null {
    const exp = state.experience[0]
    if (!exp || exp.bullets.length === 0) return null
    return { section: 'experience', index: 0, bulletIndex: 0, entryLabel: exp.company || 'Experience', text: exp.bullets[0] }
}

function sameTarget(a: ProposalTarget | null, b: ProposalTarget): boolean {
    return !!a && a.section === b.section && a.index === b.index && a.bulletIndex === b.bulletIndex && a.skillsField === b.skillsField
}

function summaryKeyword(jobTitle: string | null): string {
    const first = (jobTitle ?? '').split(/\s+/).find(w => w.length > 3 && !/engineer|developer|intern/i.test(w))
    return first || 'Bitbucket Pipelines'
}

function existingSkills(state: ResumeEditorState): { field: 'languages' | 'tools' | 'frameworks'; value: string; list: string[] }[] {
    return (['languages', 'tools', 'frameworks'] as const)
        .map(field => ({ field, value: state.skills[field], list: state.skills[field].split(',').map(s => s.trim()).filter(Boolean) }))
        .filter(x => x.list.length > 0)
}

/**
 * The ONLY place that produces Proposals. Holds a tiny bit of internal
 * conversational state (waiting for a number) between `send()` calls —
 * this is what a real backend session would track server-side.
 */
export function createMockAssistantAdapter(jobTitle: string | null): AssistantAdapter {
    let waitingForNumber: { target: ReturnType<typeof firstBulletTarget> } | null = null

    async function* stream(text: string): AsyncGenerator<AssistantEvent> {
        const words = text.split(' ')
        for (let i = 0; i < words.length; i++) {
            await sleep(55)
            yield { type: 'text_delta', delta: (i === 0 ? '' : ' ') + words[i] }
        }
    }

    async function* proposalWithSkeleton(proposal: Proposal): AsyncGenerator<AssistantEvent> {
        yield { type: 'proposal_pending' }
        await sleep(850)
        yield { type: 'proposal', proposal }
    }

    return {
        async *send(rawText, state) {
            const text = rawText.toLowerCase()

            if (waitingForNumber) {
                const match = text.match(/\d+/)
                const num = match ? parseInt(match[0], 10) : 20
                const t = waitingForNumber.target
                waitingForNumber = null
                if (!t) { yield* stream("I couldn't find an experience bullet to strengthen — add one first."); yield { type: 'done' }; return }
                yield* stream("Here's a stronger version using your figure:")
                const rewritten = `Configured and validated ${num}+ ${t.text.replace(/^\W*(Set up and configured|Performed|Worked on|Helped)\s*/i, '').trim()}`
                yield* proposalWithSkeleton({
                    id: uid(), target: { section: 'experience', index: t.index, bulletIndex: t.bulletIndex },
                    sectionLabel: `Experience → ${t.entryLabel} · Bullet ${(t.bulletIndex ?? 0) + 1}`,
                    badge: 'message', before: t.text, after: rewritten,
                    why: 'Action verb + your real figure strengthens impact.', est: 4, auditId: 'quantify',
                })
                yield { type: 'done' }
                return
            }

            if (/kubernetes|k8s/.test(text)) {
                const skills = existingSkills(state)
                const names = skills.flatMap(s => s.list).slice(0, 3)
                const namesText = names.length ? names.map(n => `${n} ✓`).join(', ') : 'no verified skills yet'
                yield* stream(`I couldn't verify Kubernetes in your resume. I found: ${namesText}. Want me to surface one of those instead, or start the Kubernetes learning path so you can back it up with real work?`)
                const buttons: AssistantButton[] = []
                if (skills.length > 0) buttons.push({ label: `Add ${skills[0].list[0]} skill`, sendText: `__add_skill__:${skills[0].field}:${skills[0].list[0]}` })
                buttons.push({ label: 'Start Kubernetes roadmap', sendText: '__k8s_roadmap__' })
                yield { type: 'buttons', buttons }
                yield { type: 'done' }
                return
            }

            if (text.startsWith('__add_skill__:')) {
                const [, field, skill] = rawText.split(':') as [string, 'languages' | 'tools' | 'frameworks', string]
                const list = state.skills[field].split(',').map(s => s.trim()).filter(Boolean)
                const reordered = [skill, ...list.filter(s => s !== skill)].join(', ')
                yield* stream("Here's how I'd surface it for this role:")
                yield* proposalWithSkeleton({
                    id: uid(), target: { section: 'skills', skillsField: field },
                    sectionLabel: 'Technical Skills', badge: 'project',
                    before: state.skills[field], after: reordered,
                    why: `${skill} is already on your resume — moving it first improves ATS scanning priority.`, est: 1, auditId: null,
                })
                yield { type: 'done' }
                return
            }

            if (text === '__k8s_roadmap__') {
                yield* stream('Opening the Kubernetes learning path — it covers hands-on material over several weeks. I\'ll flag when you have enough to add it honestly to your resume.')
                yield { type: 'done' }
                return
            }

            if (/internship|quantify|stronger|first bullet/.test(text)) {
                const t = firstBulletTarget(state)
                if (!t) { yield* stream('Add an experience entry first and I can help strengthen it.'); yield { type: 'done' }; return }
                yield* stream("Roughly how big was that? A ballpark is fine — I won't invent a number.")
                waitingForNumber = { target: t }
                yield { type: 'done' }
                return
            }

            if (text.includes('fix summary keyword') || text.includes('summary')) {
                const kw = summaryKeyword(jobTitle)
                const after = state.summary
                    ? `${state.summary.replace(/\.$/, '')}, with a focus on ${kw}.`
                    : `Seeking roles leveraging ${kw}.`
                yield* stream(`Your summary doesn't mention "${kw}". Here's a natural way to add it:`)
                yield* proposalWithSkeleton({
                    id: uid(), target: { section: 'summary' }, sectionLabel: 'Summary', badge: 'ai',
                    before: state.summary || '(empty summary)', after,
                    why: `"${kw}" strengthens keyword alignment for this role.`, est: 2, auditId: 'bitbucket',
                })
                yield { type: 'done' }
                return
            }

            if (text.includes('shorten') || text.includes('tighten')) {
                const t = longestBulletTarget(state)
                if (!t) { yield* stream('Add an experience bullet first and I can help tighten it.'); yield { type: 'done' }; return }
                const tightened = t.text.length > 60 ? `${t.text.slice(0, 55).trim()}, improving efficiency.` : t.text
                yield* stream("Here's a tighter version of your longest bullet:")
                yield* proposalWithSkeleton({
                    id: uid(), target: { section: 'experience', index: t.index, bulletIndex: t.bulletIndex },
                    sectionLabel: `Experience → ${t.entryLabel} · Bullet ${(t.bulletIndex ?? 0) + 1}`,
                    badge: 'ai', before: t.text, after: tightened,
                    why: 'Tighter sentence, same impact.', est: 1, auditId: 'verbs',
                })
                yield { type: 'done' }
                return
            }

            yield* stream("I can help with that. Try one of the quick actions below, or ask me to strengthen a specific bullet.")
            yield { type: 'done' }
        },
    }
}

interface AuditApiItem {
    title: string
    prompt: string
    impact: number
}

interface AuditApiResponse {
    items: AuditApiItem[]
}

function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useAssistant(
    editorState: ResumeEditorState,
    setEditorState: (updater: ResumeEditorState | ((s: ResumeEditorState) => ResumeEditorState)) => void,
    jobTitle: string | null,
    // Persistence (Plan 21 Phase 1) — null when the loaded resume isn't a saved
    // optimized_resumes row (raw-resume / localStorage-draft mode), in which case
    // PATCH is skipped entirely (no write target exists).
    optimizedResumeId: string | null,
    updatedAt: string | null,
): AssistantController {
    const editorStateRef = useRef(editorState)
    editorStateRef.current = editorState

    const optimizedResumeIdRef = useRef(optimizedResumeId)
    optimizedResumeIdRef.current = optimizedResumeId
    // Tracks the server's updated_at for the optimistic-lock `expected_updated_at`
    // check. Reset to the fresh prop only when switching to a different resume —
    // not on every render, since a successful PATCH advances this ahead of the
    // (now-stale) prop until the parent re-fetches.
    const updatedAtRef = useRef(updatedAt)
    useEffect(() => {
        updatedAtRef.current = updatedAt
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [optimizedResumeId])

    const [messages, setMessages] = useState<ChatMessage[]>([])
    const messagesRef = useRef(messages)
    messagesRef.current = messages

    // Adapter selection (Plan 21 Phase 2) — env-flagged, default mock until
    // NEXT_PUBLIC_ASSISTANT_MODE=live is set. Real adapter reads
    // optimizedResumeId/history through getters (not closed-over values) so it
    // never goes stale across renders/resume switches.
    const adapterRef = useRef<AssistantAdapter>(
        process.env.NEXT_PUBLIC_ASSISTANT_MODE === 'live'
            ? createApiAssistantAdapter(
                () => optimizedResumeIdRef.current,
                () => messagesRef.current
                    .filter((m): m is ChatMessage & { text: string } => (m.kind === 'user' || m.kind === 'assistant') && typeof m.text === 'string')
                    .map(m => ({ role: m.kind as 'user' | 'assistant', content: m.text })),
            )
            : createMockAssistantAdapter(jobTitle)
    )

    const [isTyping, setIsTyping] = useState(false)

    // Real keyword coverage (Plan 21 Phase 3 / architecture doc §5 Layer 1) —
    // replaces the mock UI's hardcoded 68/74/82. Keywords are fetched (and
    // generated + cached server-side, once ever per artifact) on mount / resume
    // switch; coverage recomputes reactively off editorState so it stays correct
    // whether the edit came from AI apply/undo or a manual section-modal save.
    const [atsKeywords, setAtsKeywords] = useState<AtsKeyword[]>([])
    const atsKeywordsRef = useRef<AtsKeyword[]>([])
    atsKeywordsRef.current = atsKeywords

    const [coverage, setCoverage] = useState(0)
    // Fixed session-start baseline for the "Keyword coverage 68 →" header line —
    // captured once (the first time real keywords are available) and never
    // updated again, so the arrow always shows "where this session began".
    const coverageStartRef = useRef(0)
    const coverageStartSetRef = useRef(false)
    const coverageRef = useRef(0)
    coverageRef.current = coverage

    useEffect(() => {
        coverageStartSetRef.current = false
        if (!optimizedResumeId) { setAtsKeywords([]); return }
        let cancelled = false
        fetch('/api/resume-edit/keywords', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ optimizedResumeId }),
        })
            .then(res => (res.ok ? res.json() : null))
            .then((data: AtsKeywordsData | null) => {
                if (cancelled || !data) return
                setAtsKeywords(data.keywords ?? [])
            })
            .catch(err => console.error('[resume-edit] keyword fetch failed:', err))
        return () => { cancelled = true }
    }, [optimizedResumeId])

    useEffect(() => {
        const next = computeKeywordCoverage(atsKeywords, generateATSText(editorState))
        setCoverage(next)
        if (!coverageStartSetRef.current && atsKeywords.length > 0) {
            coverageStartRef.current = next
            coverageStartSetRef.current = true
        }
    }, [editorState, atsKeywords])

    const [floatDelta, setFloatDelta] = useState<{ value: string; key: number } | null>(null)
    const [rescoring, setRescoring] = useState(false)
    const [rescoredCaption, setRescoredCaption] = useState('Not re-scored yet')

    // Real AI audit (Plan 21 Phase 3) — replaces the mock UI's hardcoded
    // seedAuditItems(). Regardless of NEXT_PUBLIC_ASSISTANT_MODE: audit/coverage
    // are real data-fetching features, not part of the chat-adapter mock/live
    // split. Generation is user-triggered (onFindImprovements below), not
    // auto-fetched on load — see the reset-on-switch effect further down for
    // why: eager-loading fired on every resume click regardless of which tab
    // was open, spending a real LLM call on resumes the user only previewed.
    const [auditItems, setAuditItems] = useState<AuditItem[]>([])
    const auditItemsRef = useRef(auditItems)
    auditItemsRef.current = auditItems
    const [auditGenerated, setAuditGenerated] = useState(false)
    const auditGeneratedRef = useRef(auditGenerated)
    auditGeneratedRef.current = auditGenerated
    const [auditLoading, setAuditLoading] = useState(false)

    const [activeCard, setActiveCard] = useState<ActiveCard | null>(null)
    const activeCardRef = useRef(activeCard)
    activeCardRef.current = activeCard
    // Tracks the target of whichever ghost decoration is currently "live",
    // updated manually at every setGhost/clearGhost call site rather than
    // mirrored from activeCard via the render body. activeCardRef only
    // updates once React actually commits a render; when a batch request
    // yields several 'proposal' events back-to-back with no await between
    // them (the adapter can parse multiple complete events out of one
    // network chunk), activeCardRef.current is still stale at the second
    // event, so the "clear the superseded ghost" check silently no-ops and
    // both ghosts stay stuck. This ref is synchronous with the code that
    // sets it, so it can't go stale within a single batch.
    const currentGhostTargetRef = useRef<ProposalTarget | null>(null)
    const [decorations, setDecorations] = useState<DecorationsMap>(new Map())
    const decorationsRef = useRef(decorations)
    decorationsRef.current = decorations
    const [toasts, setToasts] = useState<Toast[]>([])
    const [inputValue, setInputValue] = useState('')

    // Session-local memory of each resume's Assistant state, keyed by
    // optimizedResumeId — so switching away and back restores exactly where
    // you left off (chat history, a still-pending suggestion card, its
    // highlight, and the audit results) instead of everything reverting to
    // empty. Not persisted beyond this page load; a fresh reload starts
    // clean, same as it always has.
    const resumeSessionCacheRef = useRef<Map<string, {
        messages: ChatMessage[]
        activeCard: ActiveCard | null
        decorations: DecorationsMap
        auditItems: AuditItem[]
        auditGenerated: boolean
    }>>(new Map())

    const addMessage = useCallback((m: Omit<ChatMessage, 'id'>) => {
        setMessages(prev => [...prev, { id: uid(), ...m }])
    }, [])

    const showFloat = useCallback((v: string) => {
        if (prefersReducedMotion()) return
        const key = Date.now()
        setFloatDelta({ value: v, key })
        setTimeout(() => setFloatDelta(cur => (cur?.key === key ? null : cur)), 1500)
    }, [])

    const setGhost = useCallback((target: ProposalTarget, text: string) => {
        setDecorations(prev => {
            const next = new Map(prev)
            next.set(decorationKey(target.section, target.index, target.bulletIndex, target.skillsField), { kind: 'ghost', text })
            return next
        })
    }, [])

    const clearGhost = useCallback((target: ProposalTarget) => {
        setDecorations(prev => {
            const next = new Map(prev)
            next.delete(decorationKey(target.section, target.index, target.bulletIndex, target.skillsField))
            return next
        })
    }, [])

    const flash = useCallback((target: ProposalTarget) => {
        if (prefersReducedMotion()) return
        const key = decorationKey(target.section, target.index, target.bulletIndex, target.skillsField)
        setDecorations(prev => { const next = new Map(prev); next.set(key, { kind: 'flash' }); return next })
        setTimeout(() => setDecorations(prev => { const next = new Map(prev); next.delete(key); return next }), 600)
    }, [])

    const sendMessageRef = useRef<(text: string, displayText?: string) => void>(() => {})

    // Guards against overlapping send() calls: if the user fires a new message/chip/audit-click
    // while a previous adapter call is still streaming or awaiting its skeleton delay, the older
    // call's late-arriving events would otherwise overwrite activeCard with stale data (e.g.
    // resetting a card the user is about to click Apply on back to 'pending'). Each runAdapter
    // call claims a generation id and stops applying state updates the moment a newer call starts.
    const requestGenerationRef = useRef(0)

    // Resume-switch handling. On entry, restore this resume's remembered
    // session state from resumeSessionCacheRef if we've visited it before
    // this page load (chat history, a still-pending suggestion card + its
    // highlight, and audit results) — otherwise start empty, same as opening
    // it for the very first time. The cleanup function (runs right before the
    // NEXT switch) saves the OUTGOING resume's current state into that cache
    // first, reading via refs rather than the closed-over state — the
    // closure would otherwise capture whatever these were when this effect
    // instance was created, not their latest values at the moment you
    // actually switch away.
    //
    // This also prevents the original bug this effect was added for: without
    // it, chat history from a DIFFERENT resume leaked into the new one's
    // conversation context, and a still-pending diff card — whose target
    // coordinates (section/index/bulletIndex) refer to the OLD resume's
    // structure — could get applied against the wrong location once
    // editorState pointed at the NEW resume. Bumping requestGenerationRef
    // also stops any in-flight runAdapter loop from the old resume from
    // applying further updates after the switch.
    useEffect(() => {
        requestGenerationRef.current++
        const remembered = optimizedResumeId ? resumeSessionCacheRef.current.get(optimizedResumeId) : undefined
        setMessages(remembered?.messages ?? [])
        setActiveCard(remembered?.activeCard ?? null)
        setDecorations(remembered?.decorations ?? new Map())
        setAuditItems(remembered?.auditItems ?? [])
        setAuditGenerated(remembered?.auditGenerated ?? false)
        setToasts([])
        setIsTyping(false)
        setInputValue('')
        setAuditLoading(false)

        return () => {
            if (optimizedResumeId) {
                // A 'pending' card is a skeleton awaiting a response that will
                // never arrive once requestGenerationRef invalidates it above —
                // don't cache it, or returning to this resume would show a
                // permanently stuck skeleton.
                const outgoingCard = activeCardRef.current?.state === 'pending' ? null : activeCardRef.current
                // resumeSessionCacheRef.current is a plain Map, never
                // reassigned after init (unlike a DOM ref), so it can't go
                // stale/null by cleanup time — exhaustive-deps can't tell
                // the difference.
                // eslint-disable-next-line react-hooks/exhaustive-deps
                resumeSessionCacheRef.current.set(optimizedResumeId, {
                    messages: messagesRef.current,
                    activeCard: outgoingCard,
                    decorations: decorationsRef.current,
                    auditItems: auditItemsRef.current,
                    auditGenerated: auditGeneratedRef.current,
                })
            }
        }
    }, [optimizedResumeId])

    // auditId (when this call originated from onAuditItemClick) gets stamped
    // onto the resulting proposal below. The real backend's propose_edit
    // always returns auditId: null (it has no notion of the client's audit
    // item ids) — without this, applying a "Fix this" suggestion in live
    // mode never marked that item done in the "Found N improvements" list,
    // because applyActiveCard's done-toggling only keys off proposal.auditId.
    const runAdapter = useCallback(async (text: string, auditId?: string) => {
        const myGeneration = ++requestGenerationRef.current
        const isCurrent = () => requestGenerationRef.current === myGeneration

        setIsTyping(true)
        let sawText = false
        for await (const event of adapterRef.current.send(text, editorStateRef.current)) {
            if (!isCurrent()) return
            if (event.type === 'text_delta') {
                if (!sawText) {
                    sawText = true
                    setIsTyping(false)
                    addMessage({ kind: 'assistant', text: '', streaming: true })
                }
                setMessages(prev => {
                    const next = [...prev]
                    const last = next[next.length - 1]
                    if (last?.kind === 'assistant' && last.streaming) next[next.length - 1] = { ...last, text: (last.text ?? '') + event.delta }
                    return next
                })
            } else if (event.type === 'proposal_pending') {
                setIsTyping(false)
                setMessages(prev => prev.map(m => (m.streaming ? { ...m, streaming: false } : m)))
                // Batch requests ("add X to both my skills fields") make the
                // model call propose_edit more than once in a turn — each
                // 'proposal' event below overwrites activeCard, so an earlier
                // proposal's ghost highlight would otherwise never get
                // cleared (nothing left references it to resolve it). Clear
                // whatever card is being superseded before replacing it.
                if (currentGhostTargetRef.current) {
                    clearGhost(currentGhostTargetRef.current)
                    currentGhostTargetRef.current = null
                }
                setActiveCard({ proposal: { id: 'pending', target: { section: 'summary' }, sectionLabel: '', badge: 'ai', before: '', after: '', why: '', est: 0, auditId: null }, state: 'pending' })
            } else if (event.type === 'proposal') {
                if (currentGhostTargetRef.current) {
                    clearGhost(currentGhostTargetRef.current)
                }
                const proposal = auditId ? { ...event.proposal, auditId } : event.proposal
                setGhost(proposal.target, proposal.after)
                currentGhostTargetRef.current = proposal.target
                setActiveCard({ proposal, state: 'active' })
            } else if (event.type === 'buttons') {
                setMessages(prev => prev.map(m => (m.streaming ? { ...m, streaming: false } : m)))
                addMessage({ kind: 'buttons', buttons: event.buttons.map(b => ({ label: b.label, onClick: () => sendMessageRef.current(b.sendText, b.label) })) })
            } else if (event.type === 'done') {
                setIsTyping(false)
                setMessages(prev => prev.map(m => (m.streaming ? { ...m, streaming: false } : m)))
            }
        }
    }, [addMessage, setGhost, clearGhost])

    const sendMessage = useCallback((text: string, displayText?: string, auditId?: string) => {
        if (!text.trim() || isTyping) return
        if (!text.startsWith('__')) addMessage({ kind: 'user', text: displayText ?? text })
        setInputValue('')
        void runAdapter(text, auditId)
    }, [isTyping, addMessage, runAdapter])
    sendMessageRef.current = sendMessage

    const sendChip = useCallback((chip: string) => sendMessage(chip), [sendMessage])

    const onAuditItemClick = useCallback((id: string) => {
        const item = auditItems.find(a => a.id === id)
        const trigger = item?.prompt
        if (trigger) sendMessage(trigger, undefined, id)
    }, [sendMessage, auditItems])

    // One PATCH per explicit user action (apply/undo), no debounce. No-ops when
    // the loaded resume isn't a saved optimized_resumes row. Returns the promise
    // (existing call sites don't await it, same as the old fire-and-forget
    // `void`) so onApplyAll's batch loop CAN await it — firing several PATCHes
    // back-to-back without awaiting would race the optimistic-lock check, since
    // updatedAtRef only advances once each one's response comes back.
    const persist = useCallback((state: ResumeEditorState, entry: Parameters<typeof persistEditorState>[2]) => {
        const id = optimizedResumeIdRef.current
        if (!id) return Promise.resolve()
        return persistEditorState(id, state, entry, updatedAtRef.current).then(result => {
            if (result.ok) updatedAtRef.current = result.updated_at
            else if (result.stale) updatedAtRef.current = result.updated_at
        })
    }, [])

    const applyActiveCard = useCallback((text?: string) => {
        if (!activeCard || activeCard.state === 'pending') return
        const { proposal } = activeCard
        const finalText = text ?? proposal.after
        const previousValue = readProposalTarget(editorStateRef.current, proposal.target)

        const nextState = applyProposal(editorStateRef.current, proposal, finalText)
        setEditorState(nextState)
        clearGhost(proposal.target)
        if (sameTarget(currentGhostTargetRef.current, proposal.target)) currentGhostTargetRef.current = null
        flash(proposal.target)

        const cur = coverageRef.current
        const next = computeKeywordCoverage(atsKeywordsRef.current, generateATSText(nextState))
        const delta = next - cur
        setCoverage(next)
        showFloat(delta === 0 ? '±0' : delta > 0 ? `+${delta}` : `${delta}`)

        if (proposal.auditId) setAuditItems(prev => prev.map(a => (a.id === proposal.auditId ? { ...a, done: true } : a)))

        persist(nextState, {
            section: proposal.target.section, operation: 'replace', index: proposal.target.index,
            before: previousValue, after: finalText, rationale: proposal.why, source: 'ai', coverage: next,
        })

        const toastId = uid()
        const undo = () => {
            const reverted = applyProposal(editorStateRef.current, proposal, previousValue)
            setEditorState(reverted)
            const coverageAfterUndo = computeKeywordCoverage(atsKeywordsRef.current, generateATSText(reverted))
            setCoverage(coverageAfterUndo)
            if (proposal.auditId) setAuditItems(prev => prev.map(a => (a.id === proposal.auditId ? { ...a, done: false } : a)))
            setToasts(prev => prev.filter(t => t.id !== toastId))

            persist(reverted, {
                section: proposal.target.section, operation: 'replace', index: proposal.target.index,
                before: finalText, after: previousValue, rationale: proposal.why, source: 'undo', coverage: coverageAfterUndo,
            })
        }

        addMessage({ kind: 'applied', text: proposal.sectionLabel, pts: delta, onUndo: undo })
        setToasts(prev => [...prev, { id: toastId, text: `Applied — ${proposal.sectionLabel}`, onUndo: undo }])
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toastId)), 6000)

        setActiveCard(null)
    }, [activeCard, setEditorState, clearGhost, flash, showFloat, addMessage, persist])

    const rejectActiveCard = useCallback(() => {
        if (!activeCard || activeCard.state === 'pending') return
        clearGhost(activeCard.proposal.target)
        if (sameTarget(currentGhostTargetRef.current, activeCard.proposal.target)) currentGhostTargetRef.current = null
        addMessage({ kind: 'rejected', text: activeCard.proposal.sectionLabel })
        setActiveCard(null)
    }, [activeCard, clearGhost, addMessage])

    const editActiveCard = useCallback(() => {
        setActiveCard(prev => (prev ? { ...prev, state: 'editing' } : prev))
    }, [])

    // Manual trigger (post-Phase-3 cost pass) for the "Found N improvements"
    // panel — see the comment on auditItems above for why this isn't
    // auto-fetched anymore. Guards against a resume switch happening while
    // the request is in flight: captures the target id up front and checks
    // it's still the active resume before applying the response.
    const onFindImprovements = useCallback(() => {
        const targetId = optimizedResumeId
        if (!targetId || auditLoading) return
        setAuditLoading(true)
        fetch('/api/resume-edit/audit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ optimizedResumeId: targetId, editorState: editorStateRef.current }),
        })
            .then(res => (res.ok ? res.json() : null))
            .then((data: AuditApiResponse | null) => {
                if (optimizedResumeIdRef.current !== targetId) return
                setAuditLoading(false)
                if (!data) return
                setAuditItems((data.items ?? []).map(item => ({
                    id: `audit-${Math.random().toString(36).slice(2, 10)}`,
                    text: item.title, score: item.impact, done: false, prompt: item.prompt,
                })))
                setAuditGenerated(true)
            })
            .catch(err => {
                if (optimizedResumeIdRef.current !== targetId) return
                console.error('[resume-edit] audit fetch failed:', err)
                setAuditLoading(false)
            })
    }, [optimizedResumeId, auditLoading])

    // Batched (post-Phase-3 cost pass): ONE adapter.send() call asking the
    // model to address every pending item, instead of one call per item — the
    // model can call propose_edit multiple times in a single turn (see the
    // BATCH REQUESTS rule in chat/route.ts's SYSTEM_PROMPT). Run silently (no
    // chat bubbles), auto-applying each proposal as it streams in.
    //
    // Proposals are applied against a LOCAL `state` variable, not
    // editorStateRef.current — that ref only updates on React's next render,
    // so if two proposals arrive back-to-back in the same stream chunk (no
    // real async gap between them), reading the ref for the second one would
    // still see the state from before the first was applied and clobber it.
    //
    // "done" bookkeeping is all-or-nothing across the whole batch rather than
    // per-item: Apply All has no per-item review card to correlate a specific
    // returned proposal back to a specific audit item, and if the agent
    // declines one (e.g. an unverified-skill claim it won't propose without
    // confirmation — see get_user_evidence), there's no reliable signal for
    // WHICH item that was. An item left unaddressed can still be asked for
    // directly in chat, where the real unverified-skill warning card applies.
    const onApplyAll = useCallback(async () => {
        const pending = auditItems.filter(a => !a.done && a.prompt)
        if (pending.length === 0) { setActiveCard(null); return }

        const combined = `Apply ALL of the following improvements. Call propose_edit once for each one, in the same order — don't stop after the first:\n\n${pending.map((item, i) => `${i + 1}. ${item.prompt}`).join('\n')}`

        let state = editorStateRef.current
        let appliedCount = 0
        for await (const event of adapterRef.current.send(combined, state)) {
            if (event.type !== 'proposal') continue
            const proposal = event.proposal
            const before = readProposalTarget(state, proposal.target)
            state = applyProposal(state, proposal)
            appliedCount++
            // Awaited, not fire-and-forget: firing several PATCHes without
            // waiting would make every one after the first look stale to the
            // optimistic-lock check (updatedAtRef only advances on response).
            await persist(state, {
                section: proposal.target.section, operation: 'replace', index: proposal.target.index,
                before, after: proposal.after, rationale: proposal.why, source: 'ai',
                coverage: computeKeywordCoverage(atsKeywordsRef.current, generateATSText(state)),
            })
        }

        if (appliedCount > 0) {
            setEditorState(state)
            setCoverage(computeKeywordCoverage(atsKeywordsRef.current, generateATSText(state)))
            const ids = new Set(pending.map(a => a.id))
            setAuditItems(prev => prev.map(a => (ids.has(a.id) ? { ...a, done: true } : a)))
        }
        setActiveCard(null)
    }, [auditItems, setEditorState, persist])

    // Architecture doc §5 Layer 2 — real re-score of the edited artifact,
    // debounced 30s client-side (a fresh gpt-4.1-mini call costs real quota).
    const lastRescoredAtRef = useRef(0)
    const onRescore = useCallback(() => {
        if (rescoring) return
        const id = optimizedResumeIdRef.current
        if (!id) return
        if (Date.now() - lastRescoredAtRef.current < 30_000) return
        setRescoring(true)
        fetch('/api/resume-edit/rescore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ optimizedResumeId: id, editorState: editorStateRef.current }),
        })
            .then(async res => ({ ok: res.ok, data: await res.json().catch(() => ({})) }))
            .then(({ ok, data }) => {
                setRescoring(false)
                if (ok && typeof data.score === 'number') {
                    lastRescoredAtRef.current = Date.now()
                    setRescoredCaption(`match scored just now · ${data.score}%`)
                } else {
                    setRescoredCaption(typeof data.error === 'string' ? data.error : 'Re-score failed — try again')
                }
            })
            .catch(err => {
                console.error('[resume-edit] rescore failed:', err)
                setRescoring(false)
                setRescoredCaption('Re-score failed — try again')
            })
    }, [rescoring])

    const dismissToast = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), [])

    // Gated on auditGenerated: an empty array before the user has ever clicked
    // "Find improvements" would otherwise vacuously satisfy .every() and show
    // the "Nothing left to fix" success state instead of the find-improvements prompt.
    const allDone = auditGenerated && auditItems.every(a => a.done)

    return {
        messages, isTyping, coverage, coverageStart: coverageStartRef.current, coverageMax: 100, atsKeywords, floatDelta, rescoring, rescoredCaption,
        auditItems, allDone, auditGenerated, auditLoading, activeCard, decorations, toasts, inputValue, setInputValue,
        sendMessage: (t: string) => sendMessage(t), sendChip, onAuditItemClick, onFindImprovements, onApplyAll, onRescore,
        applyActiveCard, rejectActiveCard, editActiveCard, dismissToast,
    }
}
