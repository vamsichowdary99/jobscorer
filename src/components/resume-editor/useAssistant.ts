// resuscore/src/components/resume-editor/useAssistant.ts
'use client'
import { useCallback, useRef, useState } from 'react'
import type { ResumeEditorState } from '@/lib/types'
import type { Proposal, ProposalTarget, AuditItem, AssistantEvent, AssistantAdapter, AssistantButton } from './types'
import type { DecorationsMap } from './types'
import { applyProposal, readProposalTarget } from './applyProposal'
import { decorationKey } from './PreviewDecorations'

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
    coverageMax: number
    floatDelta: { value: string; key: number } | null
    rescoring: boolean
    rescoredCaption: string
    auditItems: AuditItem[]
    allDone: boolean
    activeCard: ActiveCard | null
    decorations: DecorationsMap
    toasts: Toast[]
    inputValue: string
    setInputValue: (v: string) => void
    sendMessage: (text: string) => void
    sendChip: (chip: string) => void
    onAuditItemClick: (id: string) => void
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

// ── Seed audit items ────────────────────────────────────────
function seedAuditItems(jobTitle: string | null): AuditItem[] {
    const kw = summaryKeyword(jobTitle)
    return [
        { id: 'quantify', text: 'Quantify your first experience bullet', score: 4, done: false },
        { id: 'bitbucket', text: `Summary could mention "${kw}"`, score: 2, done: false },
        { id: 'verbs', text: 'Tighten your longest bullet', score: 1, done: false },
        { id: 'seed-1', text: 'Add measurable impact to a recent project', score: 6, done: true },
        { id: 'seed-2', text: 'Remove duplicate skill listing', score: 1, done: true },
    ]
}

const AUDIT_TRIGGER_TEXT: Record<string, string> = {
    quantify: 'quantify my internship bullet',
    bitbucket: 'fix summary keyword',
    verbs: 'shorten resume',
}

function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useAssistant(
    editorState: ResumeEditorState,
    setEditorState: (updater: ResumeEditorState | ((s: ResumeEditorState) => ResumeEditorState)) => void,
    jobTitle: string | null,
): AssistantController {
    const adapterRef = useRef<AssistantAdapter>(createMockAssistantAdapter(jobTitle))
    const editorStateRef = useRef(editorState)
    editorStateRef.current = editorState

    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [isTyping, setIsTyping] = useState(false)
    const [coverage, setCoverage] = useState(74)
    const coverageRef = useRef(74)
    coverageRef.current = coverage
    const [floatDelta, setFloatDelta] = useState<{ value: string; key: number } | null>(null)
    const [rescoring, setRescoring] = useState(false)
    const [rescoredCaption, setRescoredCaption] = useState('match scored 2m ago · 79%')
    const [auditItems, setAuditItems] = useState<AuditItem[]>(() => seedAuditItems(jobTitle))
    const [activeCard, setActiveCard] = useState<ActiveCard | null>(null)
    const [decorations, setDecorations] = useState<DecorationsMap>(new Map())
    const [toasts, setToasts] = useState<Toast[]>([])
    const [inputValue, setInputValue] = useState('')

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
            next.set(decorationKey(target.section, target.index, target.bulletIndex), { kind: 'ghost', text })
            return next
        })
    }, [])

    const clearGhost = useCallback((target: ProposalTarget) => {
        setDecorations(prev => {
            const next = new Map(prev)
            next.delete(decorationKey(target.section, target.index, target.bulletIndex))
            return next
        })
    }, [])

    const flash = useCallback((target: ProposalTarget) => {
        if (prefersReducedMotion()) return
        const key = decorationKey(target.section, target.index, target.bulletIndex)
        setDecorations(prev => { const next = new Map(prev); next.set(key, { kind: 'flash' }); return next })
        setTimeout(() => setDecorations(prev => { const next = new Map(prev); next.delete(key); return next }), 600)
    }, [])

    const sendMessageRef = useRef<(text: string, displayText?: string) => void>(() => {})

    const runAdapter = useCallback(async (text: string) => {
        setIsTyping(true)
        let sawText = false
        for await (const event of adapterRef.current.send(text, editorStateRef.current)) {
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
                setActiveCard({ proposal: { id: 'pending', target: { section: 'summary' }, sectionLabel: '', badge: 'ai', before: '', after: '', why: '', est: 0, auditId: null }, state: 'pending' })
            } else if (event.type === 'proposal') {
                setGhost(event.proposal.target, event.proposal.after)
                setActiveCard({ proposal: event.proposal, state: 'active' })
            } else if (event.type === 'buttons') {
                setMessages(prev => prev.map(m => (m.streaming ? { ...m, streaming: false } : m)))
                addMessage({ kind: 'buttons', buttons: event.buttons.map(b => ({ label: b.label, onClick: () => sendMessageRef.current(b.sendText, b.label) })) })
            } else if (event.type === 'done') {
                setIsTyping(false)
                setMessages(prev => prev.map(m => (m.streaming ? { ...m, streaming: false } : m)))
            }
        }
    }, [addMessage, setGhost])

    const sendMessage = useCallback((text: string, displayText?: string) => {
        if (!text.trim() || isTyping) return
        if (!text.startsWith('__')) addMessage({ kind: 'user', text: displayText ?? text })
        setInputValue('')
        void runAdapter(text)
    }, [isTyping, addMessage, runAdapter])
    sendMessageRef.current = sendMessage

    const sendChip = useCallback((chip: string) => sendMessage(chip), [sendMessage])

    const onAuditItemClick = useCallback((id: string) => {
        const trigger = AUDIT_TRIGGER_TEXT[id]
        if (trigger) sendMessage(trigger)
    }, [sendMessage])

    const applyActiveCard = useCallback((text?: string) => {
        if (!activeCard || activeCard.state === 'pending') return
        const { proposal } = activeCard
        const finalText = text ?? proposal.after
        const previousValue = readProposalTarget(editorStateRef.current, proposal.target)

        setEditorState(s => applyProposal(s, proposal, finalText))
        clearGhost(proposal.target)
        flash(proposal.target)

        const cur = coverageRef.current
        const next = Math.min(82, cur + proposal.est)
        setCoverage(next)
        showFloat(`+${proposal.est}`)

        if (proposal.auditId) setAuditItems(prev => prev.map(a => (a.id === proposal.auditId ? { ...a, done: true } : a)))

        const toastId = uid()
        const undo = () => {
            setEditorState(s => applyProposal(s, proposal, previousValue))
            setCoverage(c => Math.max(0, c - proposal.est))
            if (proposal.auditId) setAuditItems(prev => prev.map(a => (a.id === proposal.auditId ? { ...a, done: false } : a)))
            setToasts(prev => prev.filter(t => t.id !== toastId))
        }

        addMessage({ kind: 'applied', text: proposal.sectionLabel, pts: proposal.est, onUndo: undo })
        setToasts(prev => [...prev, { id: toastId, text: `Applied — ${proposal.sectionLabel}`, onUndo: undo }])
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toastId)), 6000)

        setActiveCard(null)
    }, [activeCard, setEditorState, clearGhost, flash, showFloat, addMessage])

    const rejectActiveCard = useCallback(() => {
        if (!activeCard || activeCard.state === 'pending') return
        clearGhost(activeCard.proposal.target)
        addMessage({ kind: 'rejected', text: activeCard.proposal.sectionLabel })
        setActiveCard(null)
    }, [activeCard, clearGhost, addMessage])

    const editActiveCard = useCallback(() => {
        setActiveCard(prev => (prev ? { ...prev, state: 'editing' } : prev))
    }, [])

    const onApplyAll = useCallback(async () => {
        const pending = auditItems.filter(a => !a.done && AUDIT_TRIGGER_TEXT[a.id])
        for (const item of pending) {
            await sleep(300)
            const trigger = AUDIT_TRIGGER_TEXT[item.id]
            // Run the scripted flow silently (no chat bubbles) to get a proposal, then auto-apply it.
            let proposal: Proposal | null = null
            for await (const event of adapterRef.current.send(trigger, editorStateRef.current)) {
                if (event.type === 'proposal') proposal = event.proposal
            }
            // The "quantify" flow asks a clarifying question on its first send() instead of
            // yielding a proposal immediately — feed a default number to unblock it silently.
            if (item.id === 'quantify' && !proposal) {
                for await (const event of adapterRef.current.send('20', editorStateRef.current)) {
                    if (event.type === 'proposal') proposal = event.proposal
                }
            }
            if (proposal) {
                setEditorState(s => applyProposal(s, proposal!))
                const cur = coverageRef.current
                setCoverage(Math.min(82, cur + proposal.est))
                setAuditItems(prev => prev.map(a => (a.id === item.id ? { ...a, done: true } : a)))
            }
        }
        setActiveCard(null)
    }, [auditItems, setEditorState])

    const onRescore = useCallback(() => {
        if (rescoring) return
        setRescoring(true)
        setTimeout(() => {
            setRescoring(false)
            setRescoredCaption('match scored just now · 86%')
        }, 3000)
    }, [rescoring])

    const dismissToast = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), [])

    const allDone = auditItems.every(a => a.done)

    return {
        messages, isTyping, coverage, coverageMax: 82, floatDelta, rescoring, rescoredCaption,
        auditItems, allDone, activeCard, decorations, toasts, inputValue, setInputValue,
        sendMessage: (t: string) => sendMessage(t), sendChip, onAuditItemClick, onApplyAll, onRescore,
        applyActiveCard, rejectActiveCard, editActiveCard, dismissToast,
    }
}
