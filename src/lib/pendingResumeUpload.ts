// Carries a resume selected on the public landing page (before the user has
// an account) across the signup/login redirect into the dashboard.
// sessionStorage — not localStorage — since this holds actual resume file
// bytes and only needs to survive the auth redirect, not linger across visits.

const KEY = 'ag_pending_upload_v1'
const MAX_AGE_MS = 10 * 60 * 1000 // give up after 10 minutes — same session, not a saved draft

export interface PendingUpload {
    filename: string
    mimeType: string
    base64: string
    startedAt: number
}

export function setPendingUpload(entry: Omit<PendingUpload, 'startedAt'>) {
    if (typeof window === 'undefined') return
    try {
        window.sessionStorage.setItem(KEY, JSON.stringify({ ...entry, startedAt: Date.now() }))
    } catch {
        // Quota / privacy mode — degrade gracefully, the user just uploads again post-login.
    }
}

export function hasPendingUpload(): boolean {
    if (typeof window === 'undefined') return false
    try {
        return window.sessionStorage.getItem(KEY) !== null
    } catch {
        return false
    }
}

/** Reads and clears the pending upload in one shot so it can only fire once. */
export function takePendingUpload(): PendingUpload | null {
    if (typeof window === 'undefined') return null
    try {
        const raw = window.sessionStorage.getItem(KEY)
        window.sessionStorage.removeItem(KEY)
        if (!raw) return null
        const entry = JSON.parse(raw) as PendingUpload
        if (!entry?.base64 || Date.now() - entry.startedAt > MAX_AGE_MS) return null
        return entry
    } catch {
        return null
    }
}

export function base64ToFile(entry: PendingUpload): File {
    const bytes = atob(entry.base64)
    const buf = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i)
    return new File([buf], entry.filename, { type: entry.mimeType })
}
