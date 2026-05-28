'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, ChevronDown, X } from 'lucide-react'

export type DateRange = 'any' | '24h' | '7d' | '30d'

interface OptionMeta {
    value: DateRange
    label: string
    short: string
    cutoffMs: number | null
}

const OPTIONS: OptionMeta[] = [
    { value: 'any', label: 'Any time',       short: 'Any time',     cutoffMs: null },
    { value: '24h', label: 'Past 24 hours',  short: 'Past 24 hrs',  cutoffMs: 24 * 3600_000 },
    { value: '7d',  label: 'Past week',      short: 'Past week',    cutoffMs: 7  * 86400_000 },
    { value: '30d', label: 'Past month',     short: 'Past month',   cutoffMs: 30 * 86400_000 },
]

interface Props {
    value: DateRange
    onChange: (next: DateRange) => void
    /** Pass each result's posted_date (raw ISO string or null). Used for live count badges + bar viz. */
    postedDates: (string | null)[]
}

export function DatePostedFilter({ value, onChange, postedDates }: Props) {
    const [open, setOpen] = useState(false)
    const wrapRef = useRef<HTMLDivElement>(null)

    // Close on outside click + Esc
    useEffect(() => {
        if (!open) return
        const onDown = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
        }
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    // Count how many jobs fall in each range (computed once per results change)
    const counts = useMemo(() => {
        const now = Date.now()
        const out: Record<DateRange, number> = { any: postedDates.length, '24h': 0, '7d': 0, '30d': 0 }
        for (const d of postedDates) {
            if (!d) continue
            const t = new Date(d).getTime()
            if (isNaN(t)) continue
            const ageMs = now - t
            if (ageMs <= OPTIONS[1].cutoffMs!) out['24h']++
            if (ageMs <= OPTIONS[2].cutoffMs!) out['7d']++
            if (ageMs <= OPTIONS[3].cutoffMs!) out['30d']++
        }
        return out
    }, [postedDates])

    const active = OPTIONS.find(o => o.value === value)!
    const isActive = value !== 'any'

    return (
        <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 10px 6px 12px',
                    borderRadius: 9999,
                    border: `1px solid ${isActive ? '#135bec' : '#E2E8F0'}`,
                    background: isActive ? '#EFF4FE' : '#fff',
                    color: isActive ? '#0F4DD0' : '#475569',
                    fontSize: '0.8125rem', fontWeight: 600,
                    fontFamily: 'inherit', cursor: 'pointer',
                    transition: 'border-color 0.15s, background 0.15s, color 0.15s',
                    whiteSpace: 'nowrap',
                }}
            >
                <Clock size={13} strokeWidth={isActive ? 2.4 : 2} />
                <span>{isActive ? active.short : 'Posted: Any time'}</span>
                {isActive ? (
                    <span
                        role="button"
                        aria-label="Clear date filter"
                        onClick={(e) => { e.stopPropagation(); onChange('any') }}
                        style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 16, height: 16, borderRadius: 9999,
                            background: 'rgba(19,91,236,0.12)', marginLeft: 2,
                        }}
                    >
                        <X size={10} strokeWidth={2.5} />
                    </span>
                ) : (
                    <ChevronDown size={13} style={{
                        transition: 'transform 0.2s',
                        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                    }} />
                )}
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{ duration: 0.14, ease: [0.32, 0.72, 0.2, 1] }}
                        style={{
                            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 30,
                            width: 248,
                            background: '#fff',
                            border: '1px solid #E2E8F0',
                            borderRadius: 12,
                            boxShadow: '0 12px 32px -8px rgba(15,23,42,0.18), 0 2px 6px rgba(15,23,42,0.06)',
                            padding: 6,
                            fontFamily: 'inherit',
                        }}
                    >
                        <div style={{
                            padding: '6px 10px 8px',
                            fontSize: '0.6875rem', fontWeight: 700, letterSpacing: 0.6,
                            color: '#94A3B8', textTransform: 'uppercase',
                        }}>
                            Date posted
                        </div>
                        {OPTIONS.map((opt, idx) => {
                            const c = counts[opt.value]
                            const isSel = opt.value === value
                            const dim = opt.value !== 'any' && c === 0
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => { onChange(opt.value); setOpen(false) }}
                                    disabled={dim}
                                    style={{
                                        position: 'relative',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                                        width: '100%', textAlign: 'left',
                                        padding: '10px 12px 10px 14px',
                                        borderRadius: 8,
                                        border: 'none',
                                        background: isSel ? '#EFF4FE' : 'transparent',
                                        color: dim ? '#CBD5E1' : isSel ? '#0F4DD0' : '#1E293B',
                                        cursor: dim ? 'not-allowed' : 'pointer',
                                        fontFamily: 'inherit',
                                        transition: 'background 0.12s',
                                        marginBottom: idx === OPTIONS.length - 1 ? 0 : 1,
                                    }}
                                    onMouseEnter={(e) => { if (!isSel && !dim) e.currentTarget.style.background = '#F8FAFC' }}
                                    onMouseLeave={(e) => { if (!isSel && !dim) e.currentTarget.style.background = 'transparent' }}
                                >
                                    {/* Left accent rail on the selected row */}
                                    {isSel && (
                                        <span style={{
                                            position: 'absolute', left: 4, top: 10, bottom: 10,
                                            width: 2, borderRadius: 2,
                                            background: '#135bec',
                                        }} />
                                    )}
                                    <span style={{ fontSize: '0.8125rem', fontWeight: isSel ? 600 : 500 }}>
                                        {opt.label}
                                    </span>
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                        minWidth: 26, height: 20, padding: '0 7px',
                                        borderRadius: 9999,
                                        background: dim
                                            ? 'transparent'
                                            : isSel ? '#DCE7FD' : '#F1F5F9',
                                        color: dim ? '#CBD5E1' : isSel ? '#0F4DD0' : '#475569',
                                        fontSize: '0.6875rem', fontWeight: 600,
                                        fontVariantNumeric: 'tabular-nums',
                                    }}>
                                        {c}
                                    </span>
                                </button>
                            )
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

/** Pure helper exported for reuse in the page's filter pipeline. */
export function filterByDateRange<T extends { posted_date: string | null }>(
    items: T[],
    range: DateRange,
): T[] {
    if (range === 'any') return items
    const opt = OPTIONS.find(o => o.value === range)
    if (!opt?.cutoffMs) return items
    const cutoff = Date.now() - opt.cutoffMs
    return items.filter(j => {
        if (!j.posted_date) return false
        const t = new Date(j.posted_date).getTime()
        return !isNaN(t) && t >= cutoff
    })
}

export function rangeShortLabel(range: DateRange): string {
    return OPTIONS.find(o => o.value === range)?.short ?? 'Any time'
}
