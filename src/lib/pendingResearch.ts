// Cross-page tracker for in-flight company-research jobs.
// Persisted to localStorage so it survives navigations and reloads.
// The PendingResearchToaster (mounted in DashboardLayout) polls these
// entries against the DB and surfaces a toast when results land.

const KEY = 'ag_pending_research_v1'
const MAX_AGE_MS = 15 * 60 * 1000 // give up after 15 minutes — Firecrawl rarely exceeds this

export interface PendingResearch {
    jobId: string
    userId: string
    companyName: string
    resumeId: string | null
    startedAt: number
}

function read(): PendingResearch[] {
    if (typeof window === 'undefined') return []
    try {
        const raw = window.localStorage.getItem(KEY)
        if (!raw) return []
        const arr = JSON.parse(raw)
        if (!Array.isArray(arr)) return []
        // Drop stale entries on every read so the list self-cleans.
        const now = Date.now()
        return arr.filter((e: PendingResearch) =>
            e && typeof e === 'object' && e.jobId && (now - (e.startedAt || 0) < MAX_AGE_MS)
        )
    } catch {
        return []
    }
}

function write(list: PendingResearch[]) {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(KEY, JSON.stringify(list))
        // Manual event so same-tab listeners react. The native 'storage' event
        // only fires across tabs, not within the same tab.
        window.dispatchEvent(new CustomEvent('ag-pending-research-changed'))
    } catch {
        // Quota / privacy mode — silently degrade. Polling still works for the
        // current page; cross-page notification just won't fire.
    }
}

export function getPending(): PendingResearch[] {
    return read()
}

export function addPending(entry: Omit<PendingResearch, 'startedAt'>) {
    const existing = read()
    const idx = existing.findIndex(e => e.jobId === entry.jobId && e.userId === entry.userId)
    const next: PendingResearch = { ...entry, startedAt: Date.now() }
    if (idx >= 0) {
        existing[idx] = next
    } else {
        existing.push(next)
    }
    write(existing)
}

export function removePending(jobId: string, userId: string) {
    const existing = read()
    const next = existing.filter(e => !(e.jobId === jobId && e.userId === userId))
    if (next.length !== existing.length) write(next)
}

export function subscribe(listener: () => void): () => void {
    if (typeof window === 'undefined') return () => {}
    const handler = () => listener()
    window.addEventListener('ag-pending-research-changed', handler)
    window.addEventListener('storage', handler) // cross-tab updates
    return () => {
        window.removeEventListener('ag-pending-research-changed', handler)
        window.removeEventListener('storage', handler)
    }
}
