// Canonical closed/expired detection for job listings.
// KEEP IN SYNC with the n8n "Score Legitimacy" node (workflow "Anti-Gravity Job
// Ingestion", id ifoe6H3yXBmJTwZH) — the node carries a hand-copied JS version
// of CLOSED_PATTERNS + detectClosedFromText. Same pattern as
// lib/scoreLegitimacy.ts <-> the node's legitimacy logic.

export type JobApplicationStatus = 'open' | 'closed' | 'expired' | 'unknown'

// Conservative, specific phrases. They MUST NOT fire on ordinary JD prose like
// "close collaboration" or "closed-loop control" — hence word boundaries and
// multi-word anchors rather than a bare "closed".
const CLOSED_PATTERNS: RegExp[] = [
    /no longer accepting applications?/i,
    /applications?\s+(are\s+)?closed/i,
    /closed for applications?/i,
    /(position|role|vacancy|job opening)\s+(has been\s+)?filled/i,
    /this\s+(job|position|role)\s+(is|has been)\s+(closed|expired|filled)/i,
    /hiring\s+(is\s+)?(now\s+)?closed/i,
    /-\s*closed\s*$/im,       // "QA Test Engineer - Closed" title suffix (m: match end-of-line, since the haystack is title\ndescription)
    /\bjob expired\b/i,
]

export function detectClosedFromText(title?: string | null, description?: string | null): boolean {
    const hay = `${title ?? ''}\n${description ?? ''}`
    return CLOSED_PATTERNS.some(re => re.test(hay))
}

export function isJobClosed(job: { application_status?: JobApplicationStatus | null }): boolean {
    return job.application_status === 'closed' || job.application_status === 'expired'
}

export function jobStatusLabel(status?: JobApplicationStatus | null): string | null {
    if (status === 'closed') return 'Closed'
    if (status === 'expired') return 'Expired'
    return null
}
