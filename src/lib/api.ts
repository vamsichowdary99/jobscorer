import { createClient } from './supabase/client'

const supabase = createClient()
import type { Job, Resume, UserJobMatch, CompanyResearch, AiAnalysis, OptimizedResumeData, LearningPath, BuildPlan, AcceptedRecommendation, JobGap } from './types'

// ── Rate limiting ────────────────────────────────────────────

export class RateLimitError extends Error {
    retryAfterSec: number
    constructor(retryAfterSec: number, message?: string) {
        super(message ?? `Rate limited. Retry in ${retryAfterSec}s.`)
        this.name = 'RateLimitError'
        this.retryAfterSec = retryAfterSec
    }
}

/**
 * Parse a Response body as JSON, but surface a readable error when the body
 * is empty or non-JSON instead of letting .json() throw the browser's
 * `Unexpected end of JSON input` message. This happens periodically when
 * n8n returns 200 but an internal node errored after the webhook acknowledged.
 */
async function safeJson<T = unknown>(res: Response, opLabel: string): Promise<T> {
    const text = await res.text()
    if (!text.trim()) {
        throw new Error(`${opLabel} returned no data. The backend likely errored after accepting the request. Try again.`)
    }
    try {
        return JSON.parse(text) as T
    } catch {
        throw new Error(`${opLabel} returned an unexpected response. Try again.`)
    }
}

/** Throws RateLimitError if `res` is 429. Returns res unchanged otherwise. */
async function check429(res: Response): Promise<Response> {
    // 402 = plan quota exhausted → fire the global upgrade prompt, then let the
    // caller's normal !res.ok handling return a clean failure.
    if (res.status === 402) {
        const { handleQuota } = await import('@/lib/quota')
        await handleQuota(res)
        return res
    }
    if (res.status !== 429) return res
    const retryHeader = res.headers.get('retry-after')
    let retryAfterSec = retryHeader ? parseInt(retryHeader, 10) : 0
    let serverMsg: string | undefined
    try {
        const body = await res.clone().json() as { retry_after_sec?: number; error?: string }
        if (body.retry_after_sec) retryAfterSec = body.retry_after_sec
        serverMsg = body.error
    } catch { /* ignore */ }
    if (!Number.isFinite(retryAfterSec) || retryAfterSec <= 0) retryAfterSec = 30
    throw new RateLimitError(retryAfterSec, serverMsg)
}

/**
 * Build a clean, user-facing Error from a non-OK Response. Prefers the server's
 * JSON `error` message (our API routes return professional copy, including
 * quota/upgrade text) and NEVER surfaces the raw response body as a JSON blob.
 * Use in every `if (!res.ok)` branch instead of throwing `${await res.text()}`.
 */
async function cleanError(res: Response, fallback: string): Promise<Error> {
    let serverMsg: string | undefined
    try {
        const text = await res.text()
        if (text.trim()) {
            const body = JSON.parse(text) as { error?: string }
            if (typeof body?.error === 'string' && body.error.trim()) serverMsg = body.error
        }
    } catch { /* non-JSON or empty body — fall back */ }
    return new Error(serverMsg || fallback)
}

// ── Job Queries ──────────────────────────────────────────────

export async function fetchJobs(limit = 20, offset = 0): Promise<Job[]> {
    const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .neq('application_status', 'closed')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

    if (error) throw new Error(`Failed to fetch jobs: ${error.message}`)
    return data ?? []
}

export async function fetchJobsSince(since: string, limit = 200): Promise<Job[]> {
    const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(limit)
    if (error) throw new Error(`Failed to fetch recent jobs: ${error.message}`)
    return data ?? []
}

export async function fetchJobsByIds(ids: string[]): Promise<Job[]> {
    if (ids.length === 0) return []
    const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .in('id', ids)
    if (error) throw new Error(`Failed to fetch jobs by ids: ${error.message}`)
    return data ?? []
}

export async function fetchJobById(id: string): Promise<Job | null> {
    const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', id)
        .single()

    if (error) return null
    return data
}

/**
 * Crowdsourced job-status report. The user clicked Apply and tells us whether
 * the listing is still open. Returns the job's resulting application_status
 * (e.g. 'closed' once the report threshold trips), or null on failure.
 */
export async function reportJobStatus(jobId: string, status: 'open' | 'closed'): Promise<string | null> {
    const res = await fetch(`/api/jobs/${jobId}/report-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return (data?.application_status as string) ?? null
}

// Location alias expansion: some jobs store locations as "TS, IN" (state, country code)
// instead of "Hyderabad, Telangana, India". We run parallel queries for all patterns.
const LOCATION_EXPANSIONS: Record<string, string[]> = {
    'india':     [', IN'],           // catches "TS, IN", "KA, IN", "MH, IN" etc.
    'hyderabad': [', TS,', 'TS, IN'],
    'bangalore': ['bengaluru', ', KA,', 'KA, IN'],
    'bengaluru': ['bangalore', ', KA,', 'KA, IN'],
    'mumbai':    [', MH,', 'MH, IN'],
    'pune':      [', MH,', 'MH, IN'],
    'delhi':     ['new delhi', 'gurgaon', 'gurugram', 'noida', ', DL,', 'DL, IN'],
    'chennai':   [', TN,', 'TN, IN'],
    'kolkata':   [', WB,', 'WB, IN'],
    'ahmedabad': [', GJ,', 'GJ, IN'],
    'jaipur':    [', RJ,', 'RJ, IN'],
    'kochi':     [', KL,', 'KL, IN'],
    'visakhapatnam': [', AP,', 'AP, IN'],
    'hyderabad telangana': [', TS,', 'TS, IN'],
}

export async function searchJobs(query: string, filters?: {
    location?: string
    experience_level?: string
    schedule_type?: string
}): Promise<Job[]> {
    // Build a query with a specific location pattern (or no location filter)
    function buildQuery(locationPattern?: string) {
        let q = supabase
            .from('jobs')
            .select('*')
            .neq('application_status', 'closed')
            .order('posted_date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(200)

        // Only add text search if query is non-empty
        // NOTE: Do NOT search description — it's 10KB+ per row and causes timeouts
        if (query && query.trim()) {
            const term = query.trim()
            const words = term.split(/\s+/).filter(w => w.length > 2)
            if (words.length >= 3) {
                // Long query like "Python Django Developer": ANY word in title.
                // AND-all was too strict — most "Python Developer" jobs don't
                // also say "Django" in the title. The AI scoring step that
                // runs downstream re-ranks by real fit anyway, so cast wide here.
                q = q.or(words.map(w => `title.ilike.%${w}%`).join(','))
            } else if (words.length === 2) {
                // AND both words, but strip the "-ing" suffix for root matching so
                // "software testing" also finds "Software Test Engineer" and
                // "Software Tester" — without returning all generic "Software X" jobs.
                // Guard: only strip if the resulting root is ≥ 4 chars.
                const roots = words.map(w => {
                    const stripped = w.replace(/ing$/i, '')
                    return stripped.length >= 4 ? stripped : w
                })
                for (const root of roots) {
                    q = q.ilike('title', `%${root}%`)
                }
            } else {
                q = q.or(`title.ilike.%${term}%,company.ilike.%${term}%`)
            }
        }

        if (locationPattern) {
            q = q.ilike('location', `%${locationPattern}%`)
        }

        // n8n's experience_level extraction is unreliable — some sources return
        // NULL, others use "junior"/"intern" for what the user calls "entry_level".
        // For fresher-tier filters we match a synonym group + NULL so all the
        // jobs the ingestion surfaced remain visible on a re-search.
        if (filters?.experience_level) {
            const lvl = filters.experience_level.toLowerCase()
            const FRESHER = new Set(['entry_level', 'internship', 'associate', 'junior'])
            if (FRESHER.has(lvl)) {
                q = q.or(
                    'experience_level.ilike.%entry%,' +
                    'experience_level.ilike.%junior%,' +
                    'experience_level.ilike.%intern%,' +
                    'experience_level.ilike.%associate%,' +
                    'experience_level.ilike.%fresher%,' +
                    'experience_level.is.null'
                )
            } else {
                q = q.ilike('experience_level', `%${filters.experience_level}%`)
            }
        }
        if (filters?.schedule_type) {
            q = q.ilike('schedule_type', `%${filters.schedule_type}%`)
        }

        return q
    }

    if (filters?.location) {
        const term = filters.location.trim()
        const extras = LOCATION_EXPANSIONS[term.toLowerCase()] ?? []

        // Run parallel queries: one for the main term + one each for alias patterns
        const allPatterns = [term, ...extras]
        const results = await Promise.all(allPatterns.map(p => buildQuery(p)))

        // Merge results and deduplicate by job id
        const seen = new Set<string>()
        const merged: Job[] = []
        for (const result of results) {
            if (result.error) continue
            for (const job of (result.data ?? []) as Job[]) {
                if (!seen.has(job.id)) {
                    seen.add(job.id)
                    merged.push(job)
                }
            }
        }

        // Sort merged results by posted_date desc
        return merged.sort((a, b) => {
            const aDate = a.posted_date || a.created_at || ''
            const bDate = b.posted_date || b.created_at || ''
            return bDate.localeCompare(aDate)
        })
    }

    // No location filter — single query
    const { data, error } = await buildQuery()
    if (error) throw new Error(`Search failed: ${error.message}`)
    return data ?? []
}

export async function getJobCount(): Promise<number> {
    const { count, error } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })

    if (error) {
        console.warn('[getJobCount] failed:', error.message)
        return 0
    }
    return count ?? 0
}

// ── Resume Queries ───────────────────────────────────────────

export async function fetchResumes(userId: string): Promise<Resume[]> {
    const { data, error } = await supabase
        .from('resumes')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

    if (error) throw new Error(`Failed to fetch resumes: ${error.message}`)
    return data ?? []
}

export async function fetchResumeById(id: string): Promise<Resume | null> {
    const { data, error } = await supabase
        .from('resumes')
        .select('*')
        .eq('id', id)
        .single()

    if (error) return null
    return data
}

export async function deleteResume(id: string): Promise<boolean> {
    // Use server-side API route (service role key bypasses RLS + handles FK cascade)
    const res = await fetch(`/api/resume-delete?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        console.error('Failed to delete resume:', body.error)
        return false
    }
    return true
}

// ── Match Queries ────────────────────────────────────────────

export async function fetchMatches(userId: string): Promise<(UserJobMatch & { job: Job })[]> {
    const { data, error } = await supabase
        .from('user_job_matches')
        .select(`
      *,
      job:jobs(*)
    `)
        .eq('user_id', userId)
        .order('relevance_score', { ascending: false })

    if (error) throw new Error(`Failed to fetch matches: ${error.message}`)
    return (data ?? []) as unknown as (UserJobMatch & { job: Job })[]
}

/**
 * Count this user's scoring jobs that are still in flight (queued or running).
 * Used by the matches page as a polling backstop: Supabase Realtime is the
 * primary refresh signal, but if an event is dropped/missed the page would sit
 * empty forever. While this returns > 0 we keep polling fetchMatches; once it
 * hits 0 the run is finished (done/failed) and polling stops. Statuses seen in
 * job_queue are 'pending' | 'done' | 'failed'; anything not terminal counts as
 * active so a transient 'processing' would also keep us polling.
 *
 * Staleness cutoff (H8): if the n8n Queue Processor stalls, a row can sit
 * 'pending' indefinitely and the page would poll forever. We only count rows
 * newer than STALE_AFTER_MS as active — beyond that we assume the run is dead
 * and stop polling (the DB-side reaper fails such rows within ~1h anyway).
 */
const QUEUE_STALE_AFTER_MS = 10 * 60 * 1000 // 10 min — generous for a scoring run

export async function countActiveScoreJobs(userId: string): Promise<number> {
    const cutoff = new Date(Date.now() - QUEUE_STALE_AFTER_MS).toISOString()
    const { count, error } = await supabase
        .from('job_queue')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('workflow_type', 'score')
        .not('status', 'in', '("done","failed")')
        .gte('created_at', cutoff)

    if (error) throw new Error(`Failed to check scoring queue: ${error.message}`)
    return count ?? 0
}

// ── Webhook Triggers ─────────────────────────────────────────

/**
 * Save a job the user pasted manually (LinkedIn, Naukri, referral…) into the
 * `jobs` table so the same scoring/research/optimize pipelines can target it.
 * The server route enforces auth + dedupes by content hash.
 *
 * Accepts an optional external AbortSignal so the caller (the modal) can kill
 * the fetch when the user closes the dialog mid-flight. Also enforces an
 * internal 20s timeout — if both fail, the user's caller would hang forever,
 * which is exactly the bug we hit in the field.
 */
export async function createManualJob(
    payload: {
        title: string
        company: string
        location?: string
        description: string
        source_url?: string
        experience_level?: string
    },
    opts?: { signal?: AbortSignal }
): Promise<{ id: string; deduped: boolean }> {
    const internalCtrl = new AbortController()
    const timer = setTimeout(() => internalCtrl.abort(), 20_000)

    // Chain the caller's signal into ours so either source can abort.
    if (opts?.signal) {
        if (opts.signal.aborted) internalCtrl.abort()
        else opts.signal.addEventListener('abort', () => internalCtrl.abort(), { once: true })
    }

    let res: Response
    try {
        res = await fetch('/api/jobs/manual-paste', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: internalCtrl.signal,
        })
    } catch (err) {
        if (internalCtrl.signal.aborted) {
            // Distinguish caller-cancel from our timeout — different UX.
            if (opts?.signal?.aborted) throw new Error('Cancelled')
            throw new Error('Saving the job is taking too long (>20s). The server may not be responding — check that the dev server is running and try again.')
        }
        throw err
    } finally {
        clearTimeout(timer)
    }
    if (!res.ok) {
        // Common cases: 401 (not signed in), 400 (validation), 500 (insert failed).
        throw await cleanError(res, 'Could not save the job. Please try again.')
    }
    return safeJson(res, 'Manual job paste')
}

export async function triggerJobIngestion(payload: {
    role: string
    location: string
    experience_level?: string
}): Promise<{ success: boolean; id?: string }> {
    const res = await fetch('/api/ingest-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })
    await check429(res)
    return safeJson(res, 'Job ingestion')
}

/** Convert a File object to a base64 string. */
function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            const result = reader.result as string
            // Strip the data URL prefix (e.g. "data:application/pdf;base64,")
            const base64 = result.split(',')[1]
            resolve(base64)
        }
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(file)
    })
}

export async function triggerResumeUpload(
    file: File,
    userId: string
): Promise<{ success: boolean; data?: { resume_id: string; parsing_confidence: number; parsed_preview: Record<string, unknown> } }> {
    const base64 = await fileToBase64(file)

    // POST to /api/resume-upload (same-origin proxy) to avoid CORS issues.
    // The proxy route forwards the request to n8n server-side.
    const res = await fetch('/api/resume-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            file: base64,
            filename: file.name,
            user_id: userId,
        }),
    })

    if (!res.ok) {
        // Parse the JSON error body and surface a clean, human message — never
        // dump the raw `{"success":false,...}` blob at the user.
        let body: {
            error?: string; upgrade?: boolean; feature?: string
            plan?: string; quota?: number; used?: number
        } | null = null
        try { body = JSON.parse(await res.text()) } catch { /* non-JSON response */ }

        // Quota / plan-limit case (402): present a polished upgrade message.
        if (res.status === 402 || body?.upgrade) {
            const quota = body?.quota ?? 1
            const noun = quota === 1 ? 'resume' : 'resumes'
            const nextPlan = body?.plan === 'pro' ? 'Max' : 'Pro'
            throw new Error(
                `You've reached your ${body?.plan ?? 'free'} plan limit of ${quota} ${noun}. ` +
                `Upgrade to ${nextPlan} to upload more, or delete an existing resume to free a slot.`
            )
        }
        // Any other error: prefer the server's friendly message, else a generic one.
        throw new Error(body?.error || 'Upload failed. Please try again.')
    }

    // n8n's webhook sometimes returns 200 with an empty body when an internal
    // node errored after the webhook acknowledged the request. Surface a
    // readable message instead of the raw `Unexpected end of JSON input`
    // that .json() would throw on an empty Response.
    const text = await res.text()
    if (!text.trim()) {
        throw new Error(
            "Resume parser didn't return any data. The PDF might be a scanned image rather than a text PDF, or the parser hit an internal error. Try uploading again — if it keeps failing, try exporting the resume as a fresh PDF first."
        )
    }
    try {
        return JSON.parse(text)
    } catch {
        throw new Error('Resume parser returned an unexpected response. Try uploading again.')
    }
}

export async function triggerScoring(payload: {
    resumeId: string
    userId: string
    jobIds: string[]
    experienceLevel?: string
    mode?: 'rag' | 'all'
    forceScore?: boolean
}): Promise<{
    success: boolean
    gate_triggered?: boolean
    max_similarity?: number
    mode?: 'rag' | 'all'
    jobs_scored?: number
    cache_hits?: number
    from_cache?: boolean
    rag_shortlist_size?: number
    results?: unknown[]
}> {
    const res = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: payload.userId,
            resume_id: payload.resumeId,
            job_ids: payload.jobIds,
            experience_level: payload.experienceLevel || '',
            mode: payload.mode ?? 'all',
            force_score: payload.forceScore ?? false,
        }),
    })

    await check429(res)

    if (!res.ok) {
        throw await cleanError(res, 'Scoring failed. Please try again.')
    }

    return safeJson(res, 'AI scoring')
}

// ── Company Research ────────────────────────────────────────

/**
 * Sentinel error used when the company-research fetch is aborted because n8n's
 * Firecrawl path runs longer than the client wants to wait (typically ~5 min,
 * vs. our 60s client budget). The n8n workflow still completes in the
 * background and writes the row to `company_research` — callers should
 * redirect to /dashboard/research where the page reads from that table.
 */
export class CompanyResearchPendingError extends Error {
    constructor() {
        super('CompanyResearchPending')
        this.name = 'CompanyResearchPendingError'
    }
}

export async function triggerCompanyResearch(payload: {
    job_id: string
    user_id: string
    job: Job
    resume: { structured_data: Resume['structured_data'] }
    resume_id?: string
}, opts?: { timeoutMs?: number }): Promise<{ success: boolean; cached?: boolean; company_research?: CompanyResearch; ai_analysis?: AiAnalysis }> {
    const timeoutMs = opts?.timeoutMs ?? 60_000
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)

    let res: Response
    try {
        res = await fetch('/api/company-research', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: ctrl.signal,
        })
    } catch (err) {
        if (ctrl.signal.aborted) throw new CompanyResearchPendingError()
        throw err
    } finally {
        clearTimeout(timer)
    }

    await check429(res)

    if (!res.ok) {
        throw await cleanError(res, 'Company research failed. Please try again.')
    }

    return safeJson(res, 'Company research')
}

// ── Primary Resume Helpers ───────────────────────────────────

const PRIMARY_RESUME_KEY = 'ag_primary_resume_id'

export function getPrimaryResumeId(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(PRIMARY_RESUME_KEY)
}

/**
 * Mark a resume as the user's primary. Updates the localStorage cache
 * synchronously (so existing call sites keep working) and fires a
 * fire-and-forget DB write so the choice survives session resets and
 * different browsers. DB write is best-effort — localStorage is the
 * warm read path. The partial unique index `resumes_one_primary_per_user`
 * is why we clear first, set second.
 */
export function setPrimaryResumeId(id: string): void {
    if (typeof window === 'undefined') return
    localStorage.setItem(PRIMARY_RESUME_KEY, id)
    void persistPrimaryResumeToDb(id)
}

async function persistPrimaryResumeToDb(resumeId: string): Promise<void> {
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        // Clear, then set. Doing both in one update would violate the partial
        // unique index when the user already has a different primary row.
        await supabase
            .from('resumes')
            .update({ is_primary: false } as never)
            .eq('user_id', user.id)
            .eq('is_primary', true)
        await supabase
            .from('resumes')
            .update({ is_primary: true } as never)
            .eq('id', resumeId)
            .eq('user_id', user.id)
    } catch (err) {
        // localStorage already won; the next syncPrimaryResumeIdFromDb on a
        // different device will reconcile via whichever value is freshest.
        console.warn('[setPrimaryResumeId] DB persist failed:', err)
    }
}

/**
 * Read the user's DB-stored primary resume id and mirror it into the
 * localStorage cache. Call this on auth-state change so a fresh browser
 * (or wiped localStorage) immediately knows the user's choice.
 */
export async function syncPrimaryResumeIdFromDb(userId: string | null): Promise<string | null> {
    if (typeof window === 'undefined') return null
    if (!userId) return null
    try {
        const { data } = await supabase
            .from('resumes')
            .select('id')
            .eq('user_id', userId)
            .eq('is_primary', true)
            .maybeSingle()
        const primary = (data as { id: string } | null)?.id ?? null
        if (primary) localStorage.setItem(PRIMARY_RESUME_KEY, primary)
        return primary
    } catch (err) {
        console.warn('[syncPrimaryResumeIdFromDb] failed:', err)
        return null
    }
}

// ── Resume Optimization ─────────────────────────────────────

export async function triggerResumeOptimization(payload: {
    user_id: string; resume_id: string; job_id: string; force_refresh?: boolean; gap_data?: Record<string, any> | null
    /** Items the user accepted in the Build Plan modal — folded into the resume with honest "in progress" framing. */
    accepted_recommendations?: AcceptedRecommendation[]
}): Promise<{ success: boolean; cached?: boolean; optimized_data?: any; keyword_alignment_score?: number; optimization_notes?: string[] }> {
    const res = await fetch('/api/optimize-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })
    await check429(res)
    if (!res.ok) {
        throw await cleanError(res, 'Resume optimization failed. Please try again.')
    }
    return safeJson(res, 'Resume optimization')
}

export async function fetchOptimizedResume(userId: string, resumeId: string, jobId: string) {
    const { data, error } = await supabase
        .from('optimized_resumes' as any)
        .select('*')
        .eq('user_id', userId)
        .eq('resume_id', resumeId)
        .eq('job_id', jobId)
        .single()
    if (error) return null
    return data as any
}

export async function fetchAllOptimizedResumes(userId: string) {
    const { data: rows, error } = await supabase
        .from('optimized_resumes' as any)
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
    if (error) return []
    const list = (rows ?? []) as any[]
    if (list.length === 0) return list

    const jobIds = [...new Set(list.map((r: any) => r.job_id as string))]
    const { data: jobs } = await supabase
        .from('jobs')
        .select('id, title, company, location')
        .in('id', jobIds)
    const jobMap: Record<string, any> = Object.fromEntries((jobs ?? []).map((j: any) => [j.id, j]))

    return list.map((r: any) => ({
        ...r,
        job: jobMap[r.job_id] ?? { id: r.job_id, title: null, company: null, location: null },
    }))
}

export async function fetchOptimizedResumesByResume(userId: string, resumeId: string) {
    // No FK between optimized_resumes.job_id → jobs.id so we can't use PostgREST join.
    // Two-step: fetch rows, then fetch the matching jobs separately.
    const { data: rows, error } = await supabase
        .from('optimized_resumes' as any)
        .select('id, user_id, resume_id, job_id, keyword_alignment_score, updated_at, optimized_data')
        .eq('user_id', userId)
        .eq('resume_id', resumeId)
        .order('updated_at', { ascending: false })
    if (error) {
        console.error('[fetchOptimizedResumesByResume] error:', error.message)
        return []
    }
    const list = (rows ?? []) as any[]
    if (list.length === 0) return []

    const jobIds = [...new Set(list.map((r: any) => r.job_id as string))]
    const { data: jobs } = await supabase
        .from('jobs')
        .select('id, title, company, location')
        .in('id', jobIds)
    const jobMap: Record<string, any> = Object.fromEntries((jobs ?? []).map((j: any) => [j.id, j]))

    return list.map((r: any) => ({
        ...r,
        job: jobMap[r.job_id] ?? { id: r.job_id, title: null, company: null, location: null },
    }))
}

// ── Build Plan (recommendation popup) ────────────────────────

/**
 * Trigger the "Build Plan Generator" n8n workflow (cert + project + learning
 * recommendations grounded with real GitHub repos). Returns a cached BuildPlan
 * when one exists for (resume_id, job_id) unless force_refresh is set.
 */
export async function triggerBuildPlan(payload: {
    resume_id: string
    job_id: string
    force_refresh?: boolean
    gaps?: JobGap[] | null
    matched_skills?: string[]
    missing_skills?: string[]
    job_title?: string
    company_name?: string
}): Promise<{ success: boolean; cached?: boolean; build_plan?: BuildPlan | null }> {
    const res = await fetch('/api/build-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })
    await check429(res)
    if (!res.ok) {
        throw await cleanError(res, 'Build plan generation failed. Please try again.')
    }
    return safeJson(res, 'Build plan generation')
}

/** Read a cached BuildPlan for (resume_id, job_id) without triggering generation. */
export async function fetchBuildPlan(resumeId: string, jobId: string): Promise<BuildPlan | null> {
    const res = await fetch(`/api/build-plan?resume_id=${encodeURIComponent(resumeId)}&job_id=${encodeURIComponent(jobId)}`)
    if (!res.ok) return null
    const json = await res.json()
    return json.build_plan ?? null
}

// ── Learning Paths ───────────────────────────────────────────

export async function fetchLearningPaths(userId: string, jobId: string): Promise<LearningPath[]> {
    const res = await fetch(`/api/learning-path?user_id=${encodeURIComponent(userId)}&job_id=${encodeURIComponent(jobId)}`)
    if (!res.ok) return []
    const json = await res.json()
    return json.paths ?? []
}

export interface LearningPathSummary {
    job_id: string
    resume_id: string | null
    skill_count: number
    top_skills: string[]
    critical_count: number
    standard_count: number
    optional_count: number
    latest_created_at: string
    job: {
        id: string
        title: string | null
        company: string | null
        location: string | null
        source: string | null
        source_url: string | null
        experience_level: string | null
    } | null
    resume: {
        id: string
        original_filename: string | null
        is_primary: boolean | null
    } | null
}

export async function fetchLearningPathSummaries(userId: string): Promise<LearningPathSummary[]> {
    if (!userId) return []
    const res = await fetch(`/api/learning-path?user_id=${encodeURIComponent(userId)}&summary=1`)
    if (!res.ok) return []
    const json = await res.json()
    return json.summaries ?? []
}

export async function triggerLearningPathGeneration(payload: {
    userId: string
    jobId: string
    /** Active resume at generation time — stored on each learning_paths row so the history can show which resume produced this path. */
    resumeId?: string | null
    missingSkills: string[]
    /** Block B: structured gap analysis from scorer. Preferred over flat missingSkills when present. */
    gaps?: import('./types').JobGap[] | null
    jobTitle: string
    companyName: string
    company_research?: {
        overview?: string
        tech_stack?: Record<string, unknown>
        culture?: Record<string, unknown>
        industry?: string
    } | null
}): Promise<{ success: boolean; skills_generated?: number }> {
    const res = await fetch('/api/learning-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: payload.userId,
            job_id: payload.jobId,
            resume_id: payload.resumeId ?? undefined,
            missing_skills: payload.missingSkills,
            gaps: payload.gaps ?? undefined,
            job_title: payload.jobTitle,
            company_name: payload.companyName,
            company_research: payload.company_research ?? undefined,
        }),
    })
    await check429(res)
    if (!res.ok) {
        throw await cleanError(res, 'Learning path generation failed. Please try again.')
    }
    return safeJson(res, 'Learning path generation')
}

// ── AI Analysis Helpers ─────────────────────────────────────

export async function fetchCompanyResearchAnalysis(userId: string, companyName: string) {
    const { data, error } = await supabase
        .from('company_research_analysis' as any)
        .select('*')
        .eq('user_id', userId)
        .eq('company_name', companyName)
        .single()
    if (error) return null
    return data as any
}

/**
 * The display row for the Research-history sidebar.
 * Pre-joined to `jobs` so the sidebar can render company / title / location
 * without a second query per row.
 */
export interface ResearchHistoryItem {
    analysis_id: string
    job_id: string | null
    company_name: string
    resume_id: string | null
    researched_at: string
    job_title: string | null
    job_location: string | null
    /** Canonical AI Match score from `user_job_matches.relevance_score`. The
     *  company_research workflow ALSO produces its own internal
     *  skills_match.match_score, but the two often disagree by 15–25 points
     *  because they're computed by different LLMs in different workflows
     *  (gpt-4o vs gpt-4.1-mini) without sharing a canonical skills list. To
     *  prevent confusing the user with two scores for the same (resume, job),
     *  this field PREFERS the AI Match score and only falls back to the
     *  company-research internal score when no AI Match row exists. */
    match_score: number | null
    /** True when the score above came from `user_job_matches`; false when it
     *  fell back to the company-research internal score. Lets the UI optionally
     *  badge the source. */
    score_from_ai_match: boolean
}

/**
 * Researches the user has run with a specific resume as the source.
 * Pass null resumeId to get ALL researches for the user (untagged + every resume).
 *
 * After the resume_id backfill (2026-05-12) and the Save AI Analysis fix,
 * every NEW research row carries its resume_id. Two historical rows remain
 * NULL because no scoring record existed to infer from — those only surface
 * when resumeId is null (the "All researches" view).
 *
 * Score reconciliation (May 2026): we now overlay
 * `user_job_matches.relevance_score` on top of each research row so the score
 * the user sees in the research sidebar is the same one they saw in AI
 * Matches. Previously the sidebar showed the company-research internal score,
 * which led to "Zensar Technologies · 78 in AI Matches, 55 in Research" type
 * discrepancies. One source of truth per (user, resume, job) pair.
 */
export async function fetchResearchHistory(userId: string, resumeId: string | null): Promise<ResearchHistoryItem[]> {
    let q = supabase
        .from('company_research_analysis' as any)
        .select(`
            id, job_id, company_name, resume_id, created_at,
            ai_analysis,
            jobs:job_id ( title, location )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
    if (resumeId) q = q.eq('resume_id', resumeId)
    const { data, error } = await q
    if (error || !data) return []
    const rows = data as any[]

    // Batch-fetch the canonical AI Match scores for every (resume_id, job_id)
    // pair represented in the research list. One query covers all of them.
    const pairs = rows
        .map(r => ({ resume_id: r.resume_id, job_id: r.job_id }))
        .filter(p => p.resume_id && p.job_id) as Array<{ resume_id: string; job_id: string }>
    const aiMatchByKey: Record<string, number> = {}
    if (pairs.length > 0) {
        const jobIds = [...new Set(pairs.map(p => p.job_id))]
        const resumeIds = [...new Set(pairs.map(p => p.resume_id))]
        const { data: matches } = await supabase
            .from('user_job_matches')
            .select('job_id, resume_id, relevance_score')
            .eq('user_id', userId)
            .in('job_id', jobIds)
            .in('resume_id', resumeIds)
        for (const m of (matches ?? []) as any[]) {
            const k = `${m.resume_id}::${m.job_id}`
            if (typeof m.relevance_score === 'number') aiMatchByKey[k] = m.relevance_score
        }
    }

    return rows.map((row) => {
        const ai = row?.ai_analysis ?? {}
        const internal = ai?.skills_match?.match_score
        const k = (row.resume_id && row.job_id) ? `${row.resume_id}::${row.job_id}` : null
        const aiMatch = k ? aiMatchByKey[k] : undefined
        const canonical =
            typeof aiMatch === 'number' ? aiMatch :
            typeof internal === 'number' ? internal :
            null
        return {
            analysis_id: row.id,
            job_id: row.job_id ?? null,
            company_name: row.company_name,
            resume_id: row.resume_id ?? null,
            researched_at: row.created_at,
            job_title: row.jobs?.title ?? null,
            job_location: row.jobs?.location ?? null,
            match_score: canonical,
            score_from_ai_match: typeof aiMatch === 'number',
        }
    })
}

/**
 * Counts of researches per resume, used to render the "8 researches" badge
 * in the ResumeSelector dropdown. Returns a map of resume_id -> count.
 */
export async function fetchResearchCountsByResume(userId: string): Promise<Record<string, number>> {
    const { data, error } = await supabase
        .from('company_research_analysis' as any)
        .select('resume_id')
        .eq('user_id', userId)
    if (error || !data) return {}
    const counts: Record<string, number> = {}
    for (const row of data as any[]) {
        const k = row.resume_id ?? '__untagged__'
        counts[k] = (counts[k] || 0) + 1
    }
    return counts
}

export async function fetchResumeAnalysis(resumeId: string) {
    const { data, error } = await supabase
        .from('resumes')
        .select('ai_analysis')
        .eq('id', resumeId)
        .single()
    if (error) return null
    return (data as any)?.ai_analysis ?? null
}

// ── User Settings (profiles + preferences) ───────────────────

export type NotificationPrefs = {
    new_strong_matches: boolean
    weekly_digest: boolean
    interview_reminders: boolean
    product_updates: boolean
    tips_career_advice: boolean
}

export type UserSettings = {
    full_name: string | null
    email: string | null
    avatar_url: string | null
    target_roles: string[]
    target_locations: string[]
    experience_level: string | null
    remote_preference: string | null
    default_template: string | null
    email_frequency: string
    notification_prefs: NotificationPrefs
    joined_at: string | null
}

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
    new_strong_matches: true,
    weekly_digest: true,
    interview_reminders: true,
    product_updates: false,
    tips_career_advice: false,
}

/**
 * Load the user's settings from `profiles`. Auto-upserts a row if the trigger
 * never ran for legacy accounts (we don't want UI showing zero data).
 */
export async function fetchUserSettings(userId: string, email: string | null): Promise<UserSettings> {
    if (!userId) {
        return {
            full_name: null, email, avatar_url: null,
            target_roles: [], target_locations: [],
            experience_level: null, remote_preference: null,
            default_template: null, email_frequency: 'daily',
            notification_prefs: DEFAULT_NOTIFICATION_PREFS,
            joined_at: null,
        }
    }
    const { data, error } = await supabase
        .from('profiles' as any)
        .select('full_name, email, avatar_url, target_roles, target_locations, experience_level, remote_preference, default_template, email_frequency, notification_prefs, created_at')
        .eq('id', userId)
        .maybeSingle()

    if (error || !data) {
        // Auto-create the row so subsequent saves don't fail.
        await supabase.from('profiles' as any).upsert({ id: userId, email } as any)
        return {
            full_name: null, email, avatar_url: null,
            target_roles: [], target_locations: [],
            experience_level: null, remote_preference: null,
            default_template: null, email_frequency: 'daily',
            notification_prefs: DEFAULT_NOTIFICATION_PREFS,
            joined_at: null,
        }
    }
    const row = data as any
    return {
        full_name: row.full_name ?? null,
        email: row.email ?? email,
        avatar_url: row.avatar_url ?? null,
        target_roles: Array.isArray(row.target_roles) ? row.target_roles : [],
        target_locations: Array.isArray(row.target_locations) ? row.target_locations : [],
        experience_level: row.experience_level ?? null,
        remote_preference: row.remote_preference ?? null,
        default_template: row.default_template ?? null,
        email_frequency: row.email_frequency ?? 'daily',
        notification_prefs: { ...DEFAULT_NOTIFICATION_PREFS, ...(row.notification_prefs ?? {}) },
        joined_at: row.created_at ?? null,
    }
}

/**
 * Patch one or more settings fields. Caller passes only what changed.
 * Returns the upserted row so the page can refresh local state.
 */
export async function updateUserSettings(
    userId: string,
    patch: Partial<Omit<UserSettings, 'email' | 'joined_at'>>
): Promise<boolean> {
    if (!userId) return false
    const dbPatch: Record<string, unknown> = { id: userId, updated_at: new Date().toISOString() }
    if (patch.full_name !== undefined) dbPatch.full_name = patch.full_name
    if (patch.avatar_url !== undefined) dbPatch.avatar_url = patch.avatar_url
    if (patch.target_roles !== undefined) dbPatch.target_roles = patch.target_roles
    if (patch.target_locations !== undefined) dbPatch.target_locations = patch.target_locations
    if (patch.experience_level !== undefined) dbPatch.experience_level = patch.experience_level
    if (patch.remote_preference !== undefined) dbPatch.remote_preference = patch.remote_preference
    if (patch.default_template !== undefined) dbPatch.default_template = patch.default_template
    if (patch.email_frequency !== undefined) dbPatch.email_frequency = patch.email_frequency
    if (patch.notification_prefs !== undefined) dbPatch.notification_prefs = patch.notification_prefs

    const { error } = await supabase.from('profiles' as any).upsert(dbPatch as any)
    if (error) {
        console.warn('[updateUserSettings] failed:', error.message)
        return false
    }
    return true
}

/**
 * Monthly usage counters for the Usage & Limits card. Counts rows created
 * since the first of the current month, normalized to UTC.
 */
export type UsageStats = {
    jobsScored: number
    resumesTailored: number
    companiesResearched: number
    aiChatMessages: number
    resetDate: string  // ISO of next month start
}

export async function fetchUsageStats(userId: string): Promise<UsageStats> {
    if (!userId) return { jobsScored: 0, resumesTailored: 0, companiesResearched: 0, aiChatMessages: 0, resetDate: '' }
    const now = new Date()
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()

    const [matches, optimized, research] = await Promise.all([
        supabase.from('user_job_matches').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', monthStart),
        supabase.from('optimized_resumes' as any).select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('updated_at', monthStart),
        supabase.from('company_research_analysis' as any).select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', monthStart),
    ])

    return {
        jobsScored: matches.count ?? 0,
        resumesTailored: optimized.count ?? 0,
        companiesResearched: research.count ?? 0,
        aiChatMessages: 0,  // No chat_messages table yet — placeholder.
        resetDate: nextMonth,
    }
}

// ── Applications (Wave 2 — kanban tracker) ───────────────────

export type ApplicationStatus = 'applied' | 'interview' | 'offer' | 'rejected' | 'withdrawn'

export type ApplicationRejectionReason =
    | 'ghosted'
    | 'rejected_after_application'
    | 'rejected_after_interview'
    | 'i_withdrew'
    | 'better_offer_elsewhere'

export type StatusHistoryEntry = {
    status: ApplicationStatus
    at: string
    note?: string
}

export type Application = {
    id: string
    user_id: string
    job_id: string | null
    external_company: string | null
    external_role: string | null
    external_url: string | null
    external_location: string | null
    external_salary: string | null
    optimized_resume_id: string | null
    company_research_id: string | null
    status: ApplicationStatus
    applied_at: string
    interview_at: string | null
    offer_at: string | null
    decided_at: string | null
    rejection_reason: ApplicationRejectionReason | null
    rejection_note: string | null
    notes: string | null
    interview_notes: string | null
    status_history: StatusHistoryEntry[]
    created_at: string
    updated_at: string
    // Joined fields (filled by fetchApplications)
    job?: { id: string; title: string; company: string | null; location: string | null; source_url: string | null; salary: string | null } | null
    optimized_resume?: { id: string; resume_id: string | null; keyword_alignment_score: number | null } | null
    company_research?: { id: string; company_name: string; ai_analysis: any } | null
}

export type ApplicationPipelineCounts = {
    applied: number
    interview: number
    offer: number
    rejected: number
    withdrawn: number
    total: number
}

/** Aggregate counts per status — used by the dashboard Pipeline summary tile. */
export async function fetchApplicationPipelineCounts(userId: string): Promise<ApplicationPipelineCounts> {
    if (!userId) return { applied: 0, interview: 0, offer: 0, rejected: 0, withdrawn: 0, total: 0 }
    const { data, error } = await supabase
        .from('applications' as any)
        .select('status')
        .eq('user_id', userId)
    if (error || !data) return { applied: 0, interview: 0, offer: 0, rejected: 0, withdrawn: 0, total: 0 }
    const rows = data as Array<{ status: ApplicationStatus }>
    return rows.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1
        acc.total += 1
        return acc
    }, { applied: 0, interview: 0, offer: 0, rejected: 0, withdrawn: 0, total: 0 } as ApplicationPipelineCounts)
}

/** Fetch all applications for the user, joined with related job + research + resume. */
export async function fetchApplications(userId: string): Promise<Application[]> {
    if (!userId) return []
    const { data, error } = await supabase
        .from('applications' as any)
        .select(`
            *,
            job:jobs(id, title, company, location, source_url, salary),
            optimized_resume:optimized_resumes(id, resume_id, keyword_alignment_score),
            company_research:company_research_analysis(id, company_name, ai_analysis)
        `)
        .eq('user_id', userId)
        .order('applied_at', { ascending: false })
    if (error) {
        console.warn('[fetchApplications] failed:', error.message)
        return []
    }
    return (data ?? []) as unknown as Application[]
}

/** Create an application — either from a job match or manually. Returns the new row. */
export async function createApplication(payload: {
    user_id: string
    job_id?: string | null
    external_company?: string | null
    external_role?: string | null
    external_url?: string | null
    external_location?: string | null
    external_salary?: string | null
    optimized_resume_id?: string | null
    company_research_id?: string | null
    status?: ApplicationStatus
    notes?: string | null
    applied_at?: string  // ISO
}): Promise<Application | null> {
    const status = payload.status ?? 'applied'
    const applied_at = payload.applied_at ?? new Date().toISOString()
    const seedHistory: StatusHistoryEntry[] = [{ status, at: applied_at }]
    const { data, error } = await supabase
        .from('applications' as any)
        .insert({
            user_id: payload.user_id,
            job_id: payload.job_id ?? null,
            external_company: payload.external_company ?? null,
            external_role: payload.external_role ?? null,
            external_url: payload.external_url ?? null,
            external_location: payload.external_location ?? null,
            external_salary: payload.external_salary ?? null,
            optimized_resume_id: payload.optimized_resume_id ?? null,
            company_research_id: payload.company_research_id ?? null,
            status,
            applied_at,
            notes: payload.notes ?? null,
            status_history: seedHistory,
        } as any)
        .select('*')
        .single()
    if (error) {
        console.warn('[createApplication] failed:', error.message)
        // Free-plan application cap (enforced by the enforce_application_cap DB trigger).
        if (error.message?.includes('APPLICATION_LIMIT')) {
            const { showUpgradePrompt } = await import('@/lib/quota')
            showUpgradePrompt({
                feature: 'applications',
                plan: 'free',
                message: 'Free plan tracks up to 3 applications. Upgrade to Pro for unlimited tracking.',
            })
        }
        return null
    }
    return data as unknown as Application
}

/** Transition an application to a new status — appends to status_history + sets phase timestamps. */
export async function updateApplicationStatus(
    applicationId: string,
    newStatus: ApplicationStatus,
    extra?: { rejection_reason?: ApplicationRejectionReason | null; rejection_note?: string | null; note?: string }
): Promise<boolean> {
    // Read current history so we can append (Supabase has no native jsonb_append).
    const { data: current, error: readErr } = await supabase
        .from('applications' as any)
        .select('status_history, interview_at')
        .eq('id', applicationId)
        .single()
    if (readErr) {
        console.warn('[updateApplicationStatus] read failed:', readErr.message)
        return false
    }
    const history = ((current as any)?.status_history ?? []) as StatusHistoryEntry[]
    const now = new Date().toISOString()
    history.push({ status: newStatus, at: now, note: extra?.note })

    const patch: Record<string, unknown> = {
        status: newStatus,
        status_history: history,
    }
    // Only stamp interview_at the first time — preserve the original on re-transition. (M5)
    if (newStatus === 'interview' && !(current as any)?.interview_at) patch.interview_at = now
    if (newStatus === 'offer') patch.offer_at = now
    if (newStatus === 'rejected' || newStatus === 'withdrawn' || newStatus === 'offer') patch.decided_at = now
    if (extra?.rejection_reason !== undefined) patch.rejection_reason = extra.rejection_reason
    if (extra?.rejection_note !== undefined) patch.rejection_note = extra.rejection_note

    const { error } = await (supabase.from('applications' as any) as any).update(patch).eq('id', applicationId)
    if (error) {
        console.warn('[updateApplicationStatus] update failed:', error.message)
        return false
    }
    return true
}

/** Patch arbitrary application fields (notes, interview_at, interview_notes, etc.). */
export async function updateApplication(
    applicationId: string,
    patch: Partial<Pick<Application, 'notes' | 'interview_notes' | 'interview_at' | 'external_url'>>
): Promise<boolean> {
    const { error } = await (supabase.from('applications' as any) as any).update(patch).eq('id', applicationId)
    if (error) {
        console.warn('[updateApplication] failed:', error.message)
        return false
    }
    return true
}

export async function deleteApplication(applicationId: string): Promise<boolean> {
    const { error } = await supabase.from('applications' as any).delete().eq('id', applicationId)
    if (error) {
        console.warn('[deleteApplication] failed:', error.message)
        return false
    }
    return true
}

// ── Dashboard Aggregates ─────────────────────────────────────

export type DashboardActivityEvent = {
    kind: 'match' | 'resume' | 'research'
    title: string
    timestamp: string
}

export type DashboardStats = {
    resumeScore: number | null
    totalMatches: number
    strongMatchesThisWeek: number
    optimizedResumesCount: number
    companiesResearchedCount: number
    activeDaysThisWeek: number  // 0..7 — for weekly streak dots
    topGaps: { skill: string; jobCount: number }[]
    recentActivity: DashboardActivityEvent[]
}

/**
 * Collects all the aggregate numbers the dashboard renders.
 * One coordinated read instead of 8 hooks each firing separately.
 */
export async function fetchDashboardStats(
    userId: string,
    /**
     * Pre-fetched arrays from the dashboard's other parallel queries
     * (fetchMatches / fetchAllOptimizedResumes / fetchResearchHistory).
     * Passing them in lets us derive stats without duplicating those queries.
     */
    preloaded?: {
        matches?: Array<{ relevance_score: number | null; missing_skills: string[] | null; created_at: string }>
        optimized?: Array<{ id: string; job_id: string; updated_at: string; optimized_data: any }>
        research?: Array<{ id: string; company_name: string; created_at: string }>
    }
): Promise<DashboardStats> {
    if (!userId) {
        return {
            resumeScore: null, totalMatches: 0, strongMatchesThisWeek: 0,
            optimizedResumesCount: 0, companiesResearchedCount: 0,
            activeDaysThisWeek: 0, topGaps: [], recentActivity: [],
        }
    }

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // Only the resume-score query stays here; everything else is derived from
    // the dashboard's preloaded arrays.
    const [matchesRes, optimizedRes, researchRes, latestResumeRes] = await Promise.all([
        preloaded?.matches !== undefined
            ? Promise.resolve({ data: preloaded.matches })
            : supabase.from('user_job_matches')
                .select('id, relevance_score, missing_skills, created_at')
                .eq('user_id', userId),
        preloaded?.optimized !== undefined
            ? Promise.resolve({ data: preloaded.optimized })
            : supabase.from('optimized_resumes' as any)
                .select('id, job_id, updated_at, optimized_data')
                .eq('user_id', userId)
                .order('updated_at', { ascending: false }),
        preloaded?.research !== undefined
            ? Promise.resolve({ data: preloaded.research })
            : supabase.from('company_research_analysis' as any)
                .select('id, company_name, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false }),
        supabase.from('resumes')
            .select('ai_analysis, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
    ])

    const matches = (matchesRes.data ?? []) as Array<{
        relevance_score: number | null
        missing_skills: string[] | null
        created_at: string
    }>
    const optimized = (optimizedRes.data ?? []) as Array<{ id: string; job_id: string; updated_at: string; optimized_data: any }>
    const research = (researchRes.data ?? []) as Array<{ id: string; company_name: string; created_at: string }>

    // Resume score: prefer the parsed resume's market readiness, fall back to avg match score.
    // market_readiness_score is stored on a 0–10 scale (upload page shows "8.4 /10");
    // dashboard renders 0–100, so we scale up. Guard against legacy 0–100 values.
    const aiAnalysis = (latestResumeRes.data as any)?.ai_analysis
    const marketScore = aiAnalysis?.market_readiness_score
    let resumeScore: number | null = typeof marketScore === 'number'
        ? Math.round(marketScore <= 10 ? marketScore * 10 : marketScore)
        : null
    if (resumeScore === null && matches.length > 0) {
        const valid = matches.filter(m => typeof m.relevance_score === 'number').map(m => m.relevance_score as number)
        if (valid.length > 0) {
            resumeScore = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
        }
    }

    // Strong matches this week = relevance_score >= 80 AND created_at within 7d.
    const strongMatchesThisWeek = matches.filter(m =>
        m.created_at >= weekAgo && (m.relevance_score ?? 0) >= 80
    ).length

    // Weekly streak: count distinct active days in last 7 from any user activity.
    const dayBucket = new Set<string>()
    const todayKey = (iso: string) => iso.slice(0, 10)
    for (const m of matches) if (m.created_at >= weekAgo) dayBucket.add(todayKey(m.created_at))
    for (const o of optimized) if (o.updated_at >= weekAgo) dayBucket.add(todayKey(o.updated_at))
    for (const r of research) if (r.created_at >= weekAgo) dayBucket.add(todayKey(r.created_at))

    // Top skill gaps: aggregate missing_skills across matches, normalized by lowercase.
    const gapCounts: Record<string, { display: string; count: number }> = {}
    for (const m of matches) {
        if (!Array.isArray(m.missing_skills)) continue
        for (const skill of m.missing_skills) {
            if (!skill || typeof skill !== 'string') continue
            const key = skill.trim().toLowerCase()
            if (!key) continue
            if (!gapCounts[key]) gapCounts[key] = { display: skill.trim(), count: 0 }
            gapCounts[key].count += 1
        }
    }
    const topGaps = Object.values(gapCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map(g => ({ skill: g.display, jobCount: g.count }))

    // Synthesize an activity timeline by unioning timestamped rows from the 3 tables.
    // Wave 3 will replace this with a real `user_events` table once it lands.
    const events: DashboardActivityEvent[] = []
    // Count ALL matches scored this week, then take the newest for the timestamp.
    // (Previously this sliced to 2 before counting, so the activity line always
    // read "Scored 2 matches" even when dozens were scored — a visible mismatch
    // against the AI Matches stat tile.)
    const recentMatches = matches
        .filter(m => m.created_at >= weekAgo)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    if (recentMatches.length > 0) {
        events.push({
            kind: 'match',
            title: `Scored ${recentMatches.length === 1 ? 'a match' : `${recentMatches.length} matches`} against your resume`,
            timestamp: recentMatches[0].created_at,
        })
    }
    for (const o of optimized.slice(0, 2)) {
        const jobTitle = o.optimized_data?.personal_info?.target_role ?? o.optimized_data?.target_role ?? 'a job'
        events.push({
            kind: 'resume',
            title: `Generated tailored resume for ${jobTitle}`,
            timestamp: o.updated_at,
        })
    }
    for (const r of research.slice(0, 2)) {
        events.push({
            kind: 'research',
            title: `Researched ${r.company_name}`,
            timestamp: r.created_at,
        })
    }
    events.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

    return {
        resumeScore,
        totalMatches: matches.length,
        strongMatchesThisWeek,
        optimizedResumesCount: optimized.length,
        companiesResearchedCount: research.length,
        activeDaysThisWeek: dayBucket.size,
        topGaps,
        recentActivity: events.slice(0, 5),
    }
}

