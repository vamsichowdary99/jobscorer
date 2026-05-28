import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { ParsedResume, WorkExperience } from '@/lib/types';

let _sb: ReturnType<typeof createServiceClient> | null = null;
function sb() {
    if (_sb) return _sb;
    _sb = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    return _sb;
}

/**
 * Robustly parse a date string from a resume's work_history into a Date.
 * Resume parsers emit a wild variety: "Jun 2024", "06/2024", "2024-06-01",
 * "Present", "Current", "Jun. 2024 - Aug. 2024", etc. We try common formats
 * and return null on failure (treated as "ignore this entry's span").
 */
function parseResumeDate(s: string | undefined | null, treatNowAsToday = false): Date | null {
    if (!s) return null;
    const trimmed = String(s).trim();
    if (!trimmed) return null;
    if (/^(present|current|now|ongoing|till\s*date|to\s*date)$/i.test(trimmed)) {
        return treatNowAsToday ? new Date() : null;
    }
    // Try ISO first
    const iso = new Date(trimmed);
    if (!isNaN(iso.getTime())) return iso;
    // Month Year e.g. "Jun 2024", "June 2024"
    const my = trimmed.match(/^([A-Za-z]+)[.\s]+(\d{4})$/);
    if (my) {
        const d = new Date(`${my[1]} 1, ${my[2]}`);
        if (!isNaN(d.getTime())) return d;
    }
    // MM/YYYY
    const mmyy = trimmed.match(/^(\d{1,2})[\/\-](\d{4})$/);
    if (mmyy) {
        const d = new Date(parseInt(mmyy[2], 10), parseInt(mmyy[1], 10) - 1, 1);
        if (!isNaN(d.getTime())) return d;
    }
    // Year only — assume January
    const yy = trimmed.match(/^(\d{4})$/);
    if (yy) {
        const d = new Date(parseInt(yy[1], 10), 0, 1);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
}

/**
 * Compute total years of professional work experience from parsed resume data.
 *
 * Handles both n8n resume parser schemas:
 *   - Schema A: work_history[]
 *   - Schema B: work_experience[] (also may have pre-computed total_years_experience)
 *
 * Strategy:
 *   1. If parsed.total_years_experience is a non-negative number, trust it.
 *   2. Otherwise sum (end - start) across work entries with "Present" → today.
 *   3. Floor to integer (hiring filters say "min X years", a candidate with
 *      1.8y can't claim 2).
 *
 * Internships count toward experience — we don't try to distinguish.
 */
export function calculateYearsFromParsed(parsed: any): number {
    if (!parsed) return 0;

    // Trust the parser's pre-computed total if present and sane
    const total = parsed.total_years_experience;
    if (typeof total === 'number' && Number.isFinite(total) && total >= 0 && total < 60) {
        return Math.floor(total);
    }

    // Fall back to summing entry spans
    const work: any[] = Array.isArray(parsed.work_history)
        ? parsed.work_history
        : Array.isArray(parsed.work_experience)
            ? parsed.work_experience
            : [];
    if (work.length === 0) return 0;

    let totalMs = 0;
    for (const w of work as Array<WorkExperience & { duration?: string }>) {
        const start = parseResumeDate(w?.start_date, false);
        const end = parseResumeDate(w?.end_date, true); // "Present" → today
        if (start && end) {
            const span = end.getTime() - start.getTime();
            if (span > 0) totalMs += span;
            continue;
        }
        // Schema B sometimes only has duration: "10 months" / "1 year 2 months"
        if (typeof w?.duration === 'string') {
            const yMatch = w.duration.match(/(\d+(?:\.\d+)?)\s*year/i);
            const mMatch = w.duration.match(/(\d+)\s*month/i);
            let years = yMatch ? parseFloat(yMatch[1]) : 0;
            if (mMatch) years += parseInt(mMatch[1], 10) / 12;
            if (years > 0) totalMs += years * 365.25 * 24 * 60 * 60 * 1000;
        }
    }
    const years = totalMs / (1000 * 60 * 60 * 24 * 365.25);
    return Math.max(0, Math.floor(years));
}

/**
 * Pull a resume by id from Supabase, unwrap any double-stringified
 * structured_data, and compute years-of-experience.
 *
 * Returns 0 if the resume has no work history or can't be parsed
 * (i.e. treat as fresher — least surprising for our user base of IT freshers).
 */
export async function getResumeYearsOfExperience(resumeId: string): Promise<number> {
    const { data, error } = await sb()
        .from('resumes')
        .select('structured_data')
        .eq('id', resumeId)
        .maybeSingle();
    if (error || !data) return 0;

    let parsed: ParsedResume | null = null;
    const raw = (data as { structured_data: unknown }).structured_data;
    if (typeof raw === 'string') {
        try {
            const once = JSON.parse(raw);
            parsed = (typeof once === 'string' ? JSON.parse(once) : once) as ParsedResume;
        } catch { return 0; }
    } else if (raw && typeof raw === 'object') {
        parsed = raw as ParsedResume;
    }
    return calculateYearsFromParsed(parsed);
}
