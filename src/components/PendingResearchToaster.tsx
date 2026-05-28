'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getPending, removePending, subscribe, type PendingResearch } from '@/lib/pendingResearch'

// ── Local toast state ─────────────────────────────────────────
// A "ready" entry is one that the poller confirmed in the DB.
// We keep it in a separate list so the toast stays even after we
// stop polling for that jobId.
interface ReadyEntry extends PendingResearch {
    completedAt: number
    elapsedMs: number
    /** Was this entry already present in the DB when we started polling?
     *  If so, suppress the toast — the user didn't kick this off this session,
     *  it's just a stale localStorage entry resolving. Prevents the
     *  "popup said 8th Element but I just researched Zensar" bug. */
    wasPreExisting?: boolean
}

// Poll cadence — fast at first to catch quick wins, slowly ramping up.
function getPollIntervalMs(startedAt: number): number {
    const ageS = (Date.now() - startedAt) / 1000
    if (ageS < 60) return 15_000   // first minute — 15s
    if (ageS < 180) return 20_000  // next 2 min — 20s
    if (ageS < 480) return 30_000  // next 5 min — 30s
    return 60_000                  // beyond 8 min — 60s
}

export default function PendingResearchToaster() {
    const [pending, setPending] = useState<PendingResearch[]>([])
    const [ready, setReady] = useState<ReadyEntry[]>([])
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const router = useRouter()

    // Track per-job next-poll timestamps so each entry polls on its own cadence.
    const nextPollRef = useRef<Map<string, number>>(new Map())
    // Track which entries were *already complete* the first time we saw them.
    // Those are stale localStorage rows from prior sessions — don't shout about
    // them with a toast; just silently clean up so the user isn't confused by
    // popups for researches they didn't kick off this session.
    const preExistingRef = useRef<Set<string>>(new Set())

    // ── Sync pending list from localStorage ──
    useEffect(() => {
        const refresh = () => setPending(getPending())
        refresh()
        return subscribe(refresh)
    }, [])

    // ── First-paint sweep: silently drop pending entries whose DB row already
    // exists. They were left over from a previous tab/session that completed
    // after the user navigated away. Without this, the FIRST tick of the poll
    // would fire a "Research ready" toast for a research they didn't trigger
    // this session — exactly the "popup said 8th Element" UX bug.
    useEffect(() => {
        if (pending.length === 0) return
        let cancelled = false
        ;(async () => {
            for (const entry of pending) {
                if (cancelled) return
                const key = `${entry.userId}::${entry.jobId}`
                if (preExistingRef.current.has(key)) continue
                const exists = await checkResearchReady(entry)
                if (cancelled) return
                if (exists) {
                    preExistingRef.current.add(key)
                    // Silently remove — no toast.
                    removePending(entry.jobId, entry.userId)
                }
            }
        })()
        return () => { cancelled = true }
    // Run once per pending list change — entries added later (e.g. from
    // matches/optimize click) get freshly polled.
    }, [pending])

    // ── Polling loop ──
    // One timer drives all entries. Each tick checks which jobs are due.
    // This avoids spinning up N intervals.
    useEffect(() => {
        if (pending.length === 0) return
        let cancelled = false

        const tick = async () => {
            if (cancelled) return
            const now = Date.now()
            const map = nextPollRef.current

            const dueEntries: PendingResearch[] = []
            for (const entry of pending) {
                const key = `${entry.userId}::${entry.jobId}`
                const dueAt = map.get(key) ?? 0
                if (now >= dueAt) {
                    dueEntries.push(entry)
                    map.set(key, now + getPollIntervalMs(entry.startedAt))
                }
            }

            for (const entry of dueEntries) {
                if (cancelled) return
                const found = await checkResearchReady(entry)
                if (cancelled) return
                if (found) {
                    setReady(prev => {
                        if (prev.some(p => p.jobId === entry.jobId && p.userId === entry.userId)) return prev
                        return [
                            ...prev,
                            { ...entry, completedAt: Date.now(), elapsedMs: Date.now() - entry.startedAt },
                        ]
                    })
                    removePending(entry.jobId, entry.userId)
                    // Warm Redis with the freshly-completed result. The main
                    // research route can't have done this on its own — long
                    // n8n runs exceed its 120s maxDuration. Fire-and-forget.
                    void fetch('/api/company-research/warm-cache', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            companyName: entry.companyName,
                            resumeId: entry.resumeId,
                            jobId: entry.jobId,
                        }),
                    }).catch(() => { /* warming is best-effort */ })
                }
            }
        }

        // Run immediately on first paint so a stale pending entry resolves fast,
        // then keep checking every 5s (cheap — most ticks are no-ops).
        tick()
        const id = window.setInterval(tick, 5_000)
        return () => { cancelled = true; window.clearInterval(id) }
    }, [pending])

    // Filter during render — if the user is already viewing the research page
    // for a ready entry, don't shout about it. Computed instead of stored so
    // we don't trigger setState inside an effect (cascading renders).
    const viewingJobId =
        pathname === '/dashboard/research' ? searchParams.get('jobId') : null
    const visibleReady = useMemo(
        () => ready.filter(r => r.jobId !== viewingJobId),
        [ready, viewingJobId]
    )

    const dismiss = useCallback((jobId: string, userId: string) => {
        setReady(prev => prev.filter(r => !(r.jobId === jobId && r.userId === userId)))
    }, [])

    const view = useCallback((entry: ReadyEntry) => {
        const params = new URLSearchParams()
        params.set('jobId', entry.jobId)
        if (entry.resumeId) params.set('resumeId', entry.resumeId)
        router.push(`/dashboard/research?${params.toString()}`)
        dismiss(entry.jobId, entry.userId)
    }, [router, dismiss])

    if (visibleReady.length === 0) return null

    return (
        <div style={WRAPPER_STYLE} aria-live="polite" aria-atomic="false">
            <style>{TOAST_KEYFRAMES}</style>
            {visibleReady.map((entry, i) => (
                <ResearchToast
                    key={`${entry.userId}-${entry.jobId}`}
                    entry={entry}
                    index={i}
                    onView={() => view(entry)}
                    onDismiss={() => dismiss(entry.jobId, entry.userId)}
                />
            ))}
        </div>
    )
}

// ── Single toast card ─────────────────────────────────────────
function ResearchToast({
    entry, index, onView, onDismiss,
}: {
    entry: ReadyEntry
    index: number
    onView: () => void
    onDismiss: () => void
}) {
    const [hovered, setHovered] = useState(false)
    const elapsedMin = Math.max(1, Math.round(entry.elapsedMs / 60_000))
    const seconds = useMemo(() => Math.round(entry.elapsedMs / 1000), [entry.elapsedMs])
    const elapsedLabel = seconds < 60 ? `${seconds}s` : `${elapsedMin}m`

    return (
        <div
            role="status"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                ...CARD_STYLE,
                animationDelay: `${index * 60}ms`,
                transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
                boxShadow: hovered
                    ? '0 18px 40px rgba(15,30,64,0.16), 0 2px 0 #16a34a inset'
                    : '0 12px 28px rgba(15,30,64,0.10), 0 2px 0 #16a34a inset',
            }}
        >
            {/* Top row — status pill + close */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={STATUS_PILL_STYLE}>
                    <CheckGlyph />
                    Research ready
                </span>
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label="Dismiss"
                    style={CLOSE_BUTTON_STYLE}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Company name */}
            <div style={COMPANY_NAME_STYLE} title={entry.companyName}>
                {entry.companyName}
            </div>
            <div style={META_LINE_STYLE}>
                Finished in {elapsedLabel} · sitting in your research history
            </div>

            {/* Action */}
            <button
                type="button"
                onClick={onView}
                style={VIEW_BUTTON_STYLE}
            >
                View analysis
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                </svg>
            </button>
        </div>
    )
}

// ── Inline icon ────────────────────────────────────────────────
function CheckGlyph() {
    return (
        <span style={CHECK_GLYPH_STYLE}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
            </svg>
        </span>
    )
}

// ── DB check ──────────────────────────────────────────────────
// One Supabase query per due entry. Returns true if the analysis row exists.
async function checkResearchReady(entry: PendingResearch): Promise<boolean> {
    try {
        const query = supabase
            .from('company_research_analysis')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', entry.userId)
            .eq('company_name', entry.companyName)
        const { count, error } = await query
        if (error) return false
        return (count ?? 0) > 0
    } catch {
        return false
    }
}

// ── Styles ─────────────────────────────────────────────────────
const WRAPPER_STYLE: React.CSSProperties = {
    position: 'fixed',
    bottom: 24,
    right: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    zIndex: 9999,
    pointerEvents: 'none', // wrapper itself ignores clicks; cards opt back in
    maxWidth: 360,
}

const CARD_STYLE: React.CSSProperties = {
    pointerEvents: 'auto',
    width: 320,
    background: '#ffffff',
    borderRadius: 14,
    border: '1px solid #e2e8f0',
    padding: '14px 16px 12px',
    boxShadow: '0 12px 28px rgba(15,30,64,0.10), 0 2px 0 #16a34a inset',
    animation: 'ag-toast-in 0.36s cubic-bezier(0.32, 0.72, 0.2, 1) both',
    fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
    transition: 'transform 0.18s ease, box-shadow 0.18s ease',
}

const STATUS_PILL_STYLE: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 10px 3px 8px',
    borderRadius: 99,
    background: '#dcfce7',
    color: '#15803d',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
}

const CHECK_GLYPH_STYLE: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 14,
    height: 14,
    borderRadius: '50%',
    background: '#16a34a',
    color: '#fff',
}

const CLOSE_BUTTON_STYLE: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
    borderRadius: 6,
    color: '#94a3b8',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
}

const COMPANY_NAME_STYLE: React.CSSProperties = {
    fontFamily: "'Lora', 'Plus Jakarta Sans', serif",
    fontSize: 17,
    fontWeight: 700,
    color: '#0f172a',
    letterSpacing: '-0.01em',
    lineHeight: 1.25,
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
}

const META_LINE_STYLE: React.CSSProperties = {
    fontSize: 12,
    color: '#64748b',
    marginTop: 3,
    marginBottom: 11,
    lineHeight: 1.4,
}

const VIEW_BUTTON_STYLE: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '7px 14px',
    borderRadius: 8,
    background: '#135bec',
    color: '#ffffff',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: 13,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 2px 10px rgba(19,91,236,0.30)',
    transition: 'transform 0.12s ease, box-shadow 0.12s ease',
}

const TOAST_KEYFRAMES = `
@keyframes ag-toast-in {
    from {
        opacity: 0;
        transform: translateY(16px) scale(0.97);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}
`
