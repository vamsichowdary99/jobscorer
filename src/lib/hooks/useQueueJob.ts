'use client'

/**
 * useQueueJob — single source of truth for a job's lifecycle on the client.
 *
 * Takes any of the three ingestion-log-id shapes that /api/ingest-jobs returns:
 *   - `cache-hit:<key>`         → resolves to {status:'completed', cached:true} on first poll
 *   - `cache-hit:pool:<key>`    → Phase 2B variant; same path
 *   - `queue:<uuid>`            → polls /api/ingest-status which maps queue lifecycle
 *   - `<plain uuid>`            → polls /api/ingest-status which reads job_ingestion_logs
 *   - null/undefined            → renders nothing, no fetch
 *
 * Behaviour:
 *   - Immediate first poll on jobId change (so cache-hits resolve in one round-trip)
 *   - 5-second poll loop until terminal status
 *   - Terminal states: completed | done | failed
 *   - All cleanup on unmount or jobId change — no leaked intervals
 *
 * Returns a stable QueueJobState; consumers diff on `state.terminal` + `state.status`.
 */

import { useEffect, useRef, useState } from 'react'

export type QueueJobStatus =
    | 'idle'
    | 'pending'
    | 'queued'
    | 'processing'
    | 'completed'
    | 'done'
    | 'failed'
    | 'unknown'

export interface QueueJobState {
    jobId: string | null
    status: QueueJobStatus
    terminal: boolean
    error?: string | null
    queue_position?: number
    queue_status?: string
    new_jobs_added?: number
    total_jobs_fetched?: number
    cached?: boolean
    from_pool?: boolean
    raw: Record<string, unknown> | null
}

const TERMINAL_STATUSES = new Set<QueueJobStatus>(['completed', 'done', 'failed'])

const IDLE_STATE: QueueJobState = {
    jobId: null,
    status: 'idle',
    terminal: false,
    raw: null,
}

export function useQueueJob(jobId: string | null | undefined): QueueJobState {
    const [state, setState] = useState<QueueJobState>(IDLE_STATE)
    // Track the active jobId in a ref so the polling loop can short-circuit if
    // the consumer changes jobs mid-flight (otherwise we'd race the cleanup).
    const activeIdRef = useRef<string | null>(null)

    useEffect(() => {
        if (!jobId) {
            // No setState here — the render-time short-circuit at the bottom
            // takes care of presenting IDLE_STATE when jobId is null.
            activeIdRef.current = null
            return
        }

        activeIdRef.current = jobId
        let cancelled = false
        let intervalId: ReturnType<typeof setInterval> | undefined

        const pollOnce = async (): Promise<boolean> => {
            try {
                const resp = await fetch(
                    `/api/ingest-status?id=${encodeURIComponent(jobId)}`,
                    { method: 'GET', cache: 'no-store' }
                )

                // Bail if this hook moved on to a different jobId while we were waiting
                if (cancelled || activeIdRef.current !== jobId) return true

                if (!resp.ok) {
                    setState({
                        jobId,
                        status: 'failed',
                        terminal: true,
                        error: `HTTP ${resp.status}`,
                        raw: null,
                    })
                    return true
                }

                const data = (await resp.json()) as Record<string, unknown>
                if (cancelled || activeIdRef.current !== jobId) return true

                const status = String(data.status ?? 'unknown') as QueueJobStatus
                const isTerminal = TERMINAL_STATUSES.has(status)

                setState({
                    jobId,
                    status,
                    terminal: isTerminal,
                    error: (data.error as string | null) ?? null,
                    queue_position: data.queue_position as number | undefined,
                    queue_status: data.queue_status as string | undefined,
                    new_jobs_added: data.new_jobs_added as number | undefined,
                    total_jobs_fetched: data.total_jobs_fetched as number | undefined,
                    cached: data.cached as boolean | undefined,
                    from_pool: data.from_pool as boolean | undefined,
                    raw: data,
                })

                return isTerminal
            } catch (err) {
                if (cancelled || activeIdRef.current !== jobId) return true
                setState({
                    jobId,
                    status: 'failed',
                    terminal: true,
                    error: err instanceof Error ? err.message : 'poll failed',
                    raw: null,
                })
                return true
            }
        }

        // Kick off: immediate poll (so cache-hits resolve in one round-trip),
        // then 5s polling until terminal.
        pollOnce().then((reached) => {
            if (cancelled || reached) return
            intervalId = setInterval(async () => {
                const done = await pollOnce()
                if (done && intervalId !== undefined) {
                    clearInterval(intervalId)
                    intervalId = undefined
                }
            }, 5000)
        })

        return () => {
            cancelled = true
            if (intervalId !== undefined) {
                clearInterval(intervalId)
                intervalId = undefined
            }
        }
    }, [jobId])

    // Render-time short-circuit: when jobId is null/undefined the stored state
    // may still reflect the previous job. Override it for the consumer.
    if (!jobId) return IDLE_STATE
    return state
}
