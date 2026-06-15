import { createClient as createServiceClient } from '@supabase/supabase-js';
import { embedResume } from './embeddings';

// Plan-recommended threshold for text-embedding-3-small. Cosine values for this
// model cluster lower than older models — 0.3 is a sane starting point. Tune
// from real data once we have scoring telemetry.
const DEFAULT_SIMILARITY_THRESHOLD = 0.3;
// Cap is the upper bound on how many jobs we send for gpt-4o scoring.
// Below-threshold jobs are dropped server-side by match_jobs, so this can
// safely be high — we'll get fewer matches when the resume is niche.
const DEFAULT_MATCH_COUNT = 25;

let _supabase: ReturnType<typeof createServiceClient> | null = null;
function supabase() {
    if (_supabase) return _supabase;
    _supabase = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    return _supabase;
}

export interface MatchedJob {
    job_id: string;
    similarity: number;
    content: string;
}

export interface FindBestJobMatchesOpts {
    count?: number;
    similarityThreshold?: number;
    experienceLevel?: string | null;
    /**
     * Filter jobs to only those whose extracted min_years_experience is
     * <= maxYearsRequired (NULL/unknown values pass through — lenient).
     * For a fresher with 0 years, pass 1 to allow "0-1 year" JDs.
     */
    maxYearsRequired?: number | null;
    /**
     * When provided, scope the vector search to only these job IDs.
     * The similarity threshold is automatically lowered to 0.1 so weak
     * matches still return a score (used for the pre-score gate check).
     */
    candidateJobIds?: string[];
    /**
     * Drop jobs older than this many days, measured by
     * COALESCE(posted_date, created_at). Lenient — null posted_date rows
     * fall back to the scrape date so freshly-ingested jobs aren't lost.
     * Default 14 days (Indian fresher market churns fast — older listings
     * are usually filled or ghost reposts).
     */
    maxPostedDaysOld?: number | null;
}

/**
 * Find the top-N most semantically similar jobs for a given resume.
 *
 * If the resume has no embedding yet, embeds it synchronously before searching.
 * The embed step is idempotent and adds ~200-400ms on first call only.
 *
 * Returns the matched jobs ordered by descending cosine similarity. Empty
 * array means either (a) no embeddings in the DB at all yet, (b) similarity
 * below threshold for every job, or (c) the resume's structured_data was
 * un-embeddable (e.g. parsing failed).
 */
export async function findBestJobMatches(
    resumeId: string,
    opts: FindBestJobMatchesOpts = {},
): Promise<MatchedJob[]> {
    const sb = supabase();
    const count = opts.count ?? DEFAULT_MATCH_COUNT;
    const threshold = opts.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
    const experienceLevel = opts.experienceLevel ?? null;

    // 1. Ensure the resume is embedded
    const { data: existing, error: existingErr } = await sb
        .from('resume_embeddings' as any)
        .select('embedding')
        .eq('resume_id', resumeId)
        .maybeSingle();
    if (existingErr) throw new Error(`findBestJobMatches: lookup failed: ${existingErr.message}`);

    if (!existing) {
        const result = await embedResume(resumeId);
        if (!result.embedded) {
            console.warn(`[rag/search] resume ${resumeId} could not be embedded: ${result.reason}`);
            return [];
        }
    }

    // 2. Re-fetch the embedding (might have just been written). Use maybeSingle:
    //    on a transaction-visibility/replication race the row may not be readable
    //    yet — return [] instead of throwing a 500 on the whole /api/score. (M2)
    const { data: row, error: rowErr } = await sb
        .from('resume_embeddings' as any)
        .select('embedding')
        .eq('resume_id', resumeId)
        .maybeSingle();
    if (rowErr) throw new Error(`findBestJobMatches: re-fetch failed: ${rowErr.message}`);
    if (!row) {
        console.warn(`[rag/search] embedding not yet visible for resume ${resumeId}`);
        return [];
    }

    const embedding = (row as { embedding: string }).embedding;
    if (!embedding) return [];

    // 3. Call the match_jobs RPC. The pgvector cast happens server-side because
    //    the function signature accepts vector(1536) and we pass the literal.
    // When scoping to specific jobs, lower threshold so we get similarity
    // scores even for weak matches — the caller uses these for the gate check.
    const effectiveThreshold = opts.candidateJobIds?.length
        ? Math.min(threshold, 0.1)
        : threshold;

    const { data: matches, error: rpcErr } = await sb.rpc('match_jobs' as any, {
        query_embedding: embedding,
        match_count: count,
        similarity_threshold: effectiveThreshold,
        filter_experience_level: experienceLevel,
        max_min_years: opts.maxYearsRequired ?? null,
        filter_job_ids: opts.candidateJobIds?.length
            ? opts.candidateJobIds
            : null,
        max_posted_days_old: opts.maxPostedDaysOld ?? null,
    } as any);
    if (rpcErr) throw new Error(`findBestJobMatches: match_jobs RPC failed: ${rpcErr.message}`);

    return (matches ?? []) as MatchedJob[];
}
