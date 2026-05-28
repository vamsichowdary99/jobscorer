import OpenAI from 'openai';

/**
 * Extract the minimum years of professional experience a job description requires.
 *
 * Returns:
 *   - number ≥ 0 = min years required (0 means freshers are explicitly welcome)
 *   - null = couldn't determine (don't filter the job out — be lenient)
 *
 * Two-pass strategy to keep cost low:
 *   1. Regex over title + description for common patterns.
 *      Hits ~80% of JDs at zero cost.
 *   2. gpt-4.1-mini fallback for the ambiguous remainder (~$0.0001/job).
 */

const FRESHER_PHRASES = [
    /\bfresher(?:s)?\b/i,
    /\bfresh\s*graduate\b/i,
    /\brecent\s*graduate\b/i,
    /\bentry[\s-]?level\b/i,
    /\binternship\b/i,
    /\bintern\b/i,
    /\bno\s+(?:prior\s+)?experience\s+(?:is\s+)?required\b/i,
    /\bno\s+experience\s+needed\b/i,
    /\b0\s*[-+]?\s*1\s+year(?:s)?\s+(?:of\s+)?experience\b/i,
    /\b0\s+to\s+1\s+year(?:s)?\b/i,
];

const RANGE_PATTERNS: Array<{ re: RegExp; pick: 'lower' }> = [
    // "3-5 years", "3 to 5 years", "3–5 years" → take the lower bound
    { re: /\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*year(?:s)?\b/i, pick: 'lower' },
];

const MIN_PATTERNS: Array<{ re: RegExp }> = [
    // "minimum of 5 years", "at least 3 years", "5+ years of experience"
    { re: /\b(?:minimum(?:\s+of)?|at\s+least|min\.?)\s+(\d{1,2})\s*\+?\s*year(?:s)?\b/i },
    { re: /\b(\d{1,2})\s*\+\s*year(?:s)?\b/i },
    { re: /\b(\d{1,2})\s+year(?:s)?\s+(?:of\s+)?(?:professional\s+|relevant\s+|hands[\s-]?on\s+)?experience\b/i },
];

export interface YearsResult {
    min_years: number | null;
    confidence: 'regex_fresher' | 'regex_range' | 'regex_min' | 'llm' | 'unknown';
    matched_text?: string;
}

export function extractYearsRegex(title: string, description: string): YearsResult {
    const haystack = `${title ?? ''}\n${description ?? ''}`;
    if (!haystack.trim()) return { min_years: null, confidence: 'unknown' };

    for (const p of FRESHER_PHRASES) {
        const m = haystack.match(p);
        if (m) return { min_years: 0, confidence: 'regex_fresher', matched_text: m[0] };
    }

    for (const { re } of RANGE_PATTERNS) {
        const m = haystack.match(re);
        if (m) {
            const lower = parseInt(m[1], 10);
            if (Number.isFinite(lower) && lower >= 0 && lower < 50) {
                return { min_years: lower, confidence: 'regex_range', matched_text: m[0] };
            }
        }
    }

    for (const { re } of MIN_PATTERNS) {
        const m = haystack.match(re);
        if (m) {
            const n = parseInt(m[1], 10);
            if (Number.isFinite(n) && n >= 0 && n < 50) {
                return { min_years: n, confidence: 'regex_min', matched_text: m[0] };
            }
        }
    }

    return { min_years: null, confidence: 'unknown' };
}

let _openai: OpenAI | null = null;
function openai() {
    if (_openai) return _openai;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY missing');
    _openai = new OpenAI({ apiKey });
    return _openai;
}

/**
 * Ask gpt-4.1-mini for the minimum years of professional experience the JD
 * requires. Strict JSON output via response_format.
 */
export async function extractYearsLlm(title: string, description: string): Promise<YearsResult> {
    const jd = (description ?? '').slice(0, 3500); // cap input cost
    const prompt = `Job title: ${title}\n\nJob description:\n${jd}\n\nWhat is the MINIMUM years of professional work experience this job requires? Respond with strict JSON.`;
    const sys = `You are a precise resume/JD analyst. Read the JD and output:
{"min_years": <integer 0-30 or null>, "evidence": "<brief quote from JD>"}

Rules:
- 0 = fresher/intern/recent-graduate explicitly welcomed
- null = JD doesn't mention experience requirement at all
- If JD says "3-5 years", return 3 (the lower bound)
- If JD says "5+ years", return 5
- Output ONLY the JSON object, no markdown, no explanation.`;

    const resp = await openai().chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [
            { role: 'system', content: sys },
            { role: 'user', content: prompt },
        ],
        temperature: 0,
        max_tokens: 80,
        response_format: { type: 'json_object' },
    });

    const text = resp.choices[0]?.message?.content ?? '{}';
    try {
        const parsed = JSON.parse(text) as { min_years: number | null; evidence?: string };
        const n = parsed.min_years;
        if (n === null || n === undefined) return { min_years: null, confidence: 'llm', matched_text: parsed.evidence };
        if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 50) {
            return { min_years: null, confidence: 'llm', matched_text: parsed.evidence };
        }
        return { min_years: Math.round(n), confidence: 'llm', matched_text: parsed.evidence };
    } catch {
        return { min_years: null, confidence: 'unknown' };
    }
}

/**
 * Top-level: try regex first, fall back to LLM if regex was inconclusive.
 * Caller decides how to handle the result (null = lenient; don't filter out).
 */
export async function extractYears(title: string, description: string): Promise<YearsResult> {
    const r = extractYearsRegex(title, description);
    if (r.confidence !== 'unknown') return r;
    if (!description || description.trim().length < 40) {
        // Too little text to reason about — don't waste an LLM call
        return { min_years: null, confidence: 'unknown' };
    }
    try {
        return await extractYearsLlm(title, description);
    } catch (err) {
        console.warn('[years] LLM fallback failed:', err);
        return { min_years: null, confidence: 'unknown' };
    }
}
