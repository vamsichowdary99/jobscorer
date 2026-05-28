'use client'

import { useEffect } from 'react'
import { Loader2, Clock, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useQueueJob, type QueueJobState } from '@/lib/hooks/useQueueJob'

interface Props {
    /** queue:<uuid> | cache-hit:<key> | <plain uuid> | null/undefined to render nothing */
    jobId: string | null | undefined
    /** Friendly label for what the queue is doing — "fetching jobs", "scoring", etc. */
    label?: string
    /** Called once when the job reaches a terminal state */
    onComplete?: (state: QueueJobState) => void
    onFail?: (state: QueueJobState) => void
}

/**
 * Compact pill showing queue lifecycle: pending → processing → done/failed.
 * Realtime-driven (Supabase subscription) with 5s poll fallback. No heavy CSS.
 */
export function QueueStatusBanner({ jobId, label = 'Working', onComplete, onFail }: Props) {
    const job = useQueueJob(jobId)

    useEffect(() => {
        if (!job.terminal) return
        if (job.status === 'failed') onFail?.(job)
        else onComplete?.(job)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [job.terminal, job.status])

    if (!jobId) return null

    const baseStyle: React.CSSProperties = {
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 12px', borderRadius: 9999,
        fontSize: '0.8125rem', fontWeight: 600,
        fontFamily: 'inherit',
    }

    if (job.status === 'failed') {
        return (
            <div style={{ ...baseStyle, background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
                <AlertTriangle size={14} />
                {label} failed{job.error ? ` — ${job.error}` : ''}
            </div>
        )
    }

    if (job.status === 'completed' || job.status === 'done') {
        return (
            <div style={{ ...baseStyle, background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>
                <CheckCircle2 size={14} />
                {label} complete
            </div>
        )
    }

    if (job.status === 'processing') {
        return (
            <div style={{ ...baseStyle, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
                <Loader2 size={14} className="qsb-spin" />
                {label} — processing…
            </div>
        )
    }

    if (job.status === 'pending' || job.status === 'queued') {
        const pos = job.queue_position
        return (
            <div style={{ ...baseStyle, background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A' }}>
                <Clock size={14} />
                {label} — queued{pos && pos > 0 ? ` (position ${pos})` : ''}
            </div>
        )
    }

    return (
        <div style={{ ...baseStyle, background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
            <Loader2 size={14} className="qsb-spin" />
            {label}…
        </div>
    )
}
