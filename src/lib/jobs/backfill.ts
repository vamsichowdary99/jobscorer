import { createClient as createServiceClient } from '@supabase/supabase-js';
import { extractYears } from './years';

let _sb: ReturnType<typeof createServiceClient> | null = null;
function sb() {
    if (_sb) return _sb;
    _sb = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    return _sb;
}

export interface BackfillResult {
    selected: number;
    regex_hits: number;
    llm_hits: number;
    unknowns: number;
    errors: number;
    elapsed_ms: number;
}

const TITLE_SENIOR_RE = /\b(senior|sr\.?|lead|principal|staff|director|head of|architect|advanced|master)\b/i;

// Promote-only level reconciliation: given the freshly-extracted min_years and
// the existing tag, return a tag that is at least as senior as both signals
// suggest. Never downgrades (a row tagged 'senior' with min_years=2 stays senior).
function deriveLevelFromYears(currentLevel: string | null, minYears: number, title: string | null): string | null {
    const cur = String(currentLevel || '').toLowerCase();
    const curRank =
        cur.includes('senior') || cur.includes('director') || cur.includes('executive') || cur.includes('lead') ? 3 :
        cur.includes('mid') ? 2 :
        cur.includes('entry') || cur.includes('junior') || cur.includes('intern') || cur.includes('associate') ? 1 :
        0;

    let impliedRank = 0;
    if (minYears >= 7) impliedRank = 3;
    else if (minYears >= 3) impliedRank = 2;
    else if (minYears >= 0) impliedRank = 1;

    if (title && TITLE_SENIOR_RE.test(title)) impliedRank = Math.max(impliedRank, 3);

    if (impliedRank <= curRank) return currentLevel;
    if (impliedRank === 3) return 'senior';
    if (impliedRank === 2) return 'mid';
    if (impliedRank === 1) return 'entry';
    return currentLevel;
}

interface BackfillOpts {
    /** Cap on how many NULL-min-years jobs to process this call. Default 50. */
    limit?: number;
    /** If set, only consider jobs created at or after this ISO timestamp. */
    sinceIso?: string;
    /** Parallelism for the extraction loop. Keeps OpenAI rate-limit friendly. Default 5. */
    concurrency?: number;
    /** If true, re-process even jobs that already have a value. Default false. */
    force?: boolean;
}

/**
 * Process a batch of jobs through the years extractor and persist results.
 * Idempotent: when no NULL-min-years rows remain in scope, it returns
 * { selected: 0 } in ~50ms.
 */
export async function backfillNullYears(opts: BackfillOpts = {}): Promise<BackfillResult> {
    const limit = opts.limit ?? 50;
    const concurrency = opts.concurrency ?? 5;
    const force = opts.force ?? false;
    const t0 = Date.now();

    let q = sb()
        .from('jobs')
        .select('id, title, description, experience_level')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (!force) q = q.is('min_years_experience' as never, null);
    if (opts.sinceIso) q = q.gte('created_at', opts.sinceIso);

    const { data, error } = await q;
    if (error) throw new Error(`backfillNullYears: select failed: ${error.message}`);

    const rows = (data ?? []) as Array<{ id: string; title: string; description: string; experience_level: string | null }>;
    if (rows.length === 0) {
        return { selected: 0, regex_hits: 0, llm_hits: 0, unknowns: 0, errors: 0, elapsed_ms: Date.now() - t0 };
    }

    let regex_hits = 0, llm_hits = 0, unknowns = 0, errors = 0;

    // Process with a small concurrent worker pool
    const queue = [...rows];
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        while (queue.length > 0) {
            const row = queue.shift();
            if (!row) break;
            try {
                const result = await extractYears(row.title ?? '', row.description ?? '');
                if (result.confidence === 'llm') llm_hits++;
                else if (result.confidence === 'regex_fresher' || result.confidence === 'regex_range' || result.confidence === 'regex_min') regex_hits++;
                else unknowns++;

                // Write the value (including null for unknown — explicit "tried, couldn't tell")
                // We use a sentinel of -1 to mark "tried but couldn't determine" so the
                // backfill doesn't keep retrying the same rows on each pass.
                const persisted = result.min_years ?? -1;
                const newLevel = persisted >= 0
                    ? deriveLevelFromYears(row.experience_level, persisted, row.title)
                    : row.experience_level;
                const updates: Record<string, unknown> = { min_years_experience: persisted };
                if (newLevel !== row.experience_level) updates.experience_level = newLevel;
                const { error: upErr } = await sb()
                    .from('jobs')
                    .update(updates as never)
                    .eq('id', row.id);
                if (upErr) {
                    errors++;
                    console.warn(`[backfill] update failed for job ${row.id}: ${upErr.message}`);
                }
            } catch (err) {
                errors++;
                console.warn(`[backfill] extract failed for job ${row.id}:`, err);
            }
        }
    });
    await Promise.all(workers);

    return {
        selected: rows.length,
        regex_hits,
        llm_hits,
        unknowns,
        errors,
        elapsed_ms: Date.now() - t0,
    };
}
