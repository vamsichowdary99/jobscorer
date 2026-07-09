// resuscore/src/lib/resume-edit/validator.ts
//
// Deterministic "never hallucinate numbers" gate (architecture doc §4). Runs
// inside propose_edit before any proposal reaches the user. The model's
// cheapest path when it can't verify a number must be to ask the user.
//
// Phase 2 scope cut: allowlist source (d) — project_evidence — is omitted
// here. That source only exists once Phase 3's get_user_evidence tool ships;
// until then metric_sources only accepts 'original_resume' | 'user_message'
// (see tool-definitions.ts).

export interface MetricSource {
    value: string
    source: 'original_resume' | 'user_message'
    quote: string
}

export interface ValidatorContext {
    /** The resume's current ResumeEditorState — anything already in here is auto-allowed. */
    editorState: unknown
    /** Every user message in the conversation (history + current turn). Assistant messages and the job description are deliberately excluded. */
    userMessages: string[]
}

export type ValidationResult =
    | { ok: true }
    | { ok: false; unverified: string[] }

const NUMBER_RE = /[$₹€£]?\s?\d[\d,.]*\s*(?:%|percent|k|K|M|B|x|×|\+)?/g
const RANGE_RE = /\d[\d,.]*\s*[-–]\s*\d[\d,.]*\s*(?:%|percent|k|K|M|B|x|×|\+)?/g
// "Java 17", "HTTP 200", "React 18", "Python 3.11" — a capitalized word directly
// followed by a number is a version/status-code token, not a claimed metric.
const VERSION_RE = /\b[A-Z][A-Za-z.]*\s+\d+(?:\.\d+)*\b/g

function normalize(token: string): string {
    return token.replace(/\s+/g, '').replace(/,/g, '')
}

function extractNumbers(text: string): string[] {
    const out = new Set<string>()
    for (const m of text.match(RANGE_RE) ?? []) out.add(normalize(m))
    for (const m of text.match(NUMBER_RE) ?? []) {
        const n = normalize(m)
        if (/\d/.test(n)) out.add(n)
    }
    return [...out]
}

function extractVersionExemptNumbers(text: string): Set<string> {
    const out = new Set<string>()
    for (const m of text.match(VERSION_RE) ?? []) {
        const numPart = m.match(/\d+(?:\.\d+)*$/)
        if (numPart) out.add(normalize(numPart[0]))
    }
    return out
}

const WORD_NUMBERS: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
    hundred: 100, thousand: 1000,
}

function wordsToNumber(tokens: string[]): number | null {
    let total = 0
    let found = false
    for (const t of tokens) {
        const v = WORD_NUMBERS[t]
        if (v === undefined) continue
        found = true
        if (v === 100 || v === 1000) total = (total || 1) * v
        else total += v
    }
    return found ? total : null
}

/** "forty percent" → "40%", "twenty five" → "25" — user messages only (2c). */
function extractWordNumbers(text: string): string[] {
    const words = text.toLowerCase().replace(/-/g, ' ').split(/\s+/)
    const out: string[] = []
    for (let i = 0; i < words.length; i++) {
        if (!(words[i] in WORD_NUMBERS)) continue
        let j = i
        while (j < words.length && words[j] in WORD_NUMBERS) j++
        const num = wordsToNumber(words.slice(i, j))
        if (num !== null) {
            const next = words[j] ?? ''
            out.push(next === 'percent' || next === '%' ? `${num}%` : `${num}`)
        }
        i = j - 1
    }
    return out
}

/**
 * Validates every number/%/$/duration in `newValue`. Numbers already present
 * anywhere in the current resume state or in something the user typed pass
 * automatically (they're not invented — they're already true). Anything else
 * needs a metric_sources entry whose quote both contains the value and is a
 * verbatim substring of the claimed source.
 */
export function validateProposedText(
    newValue: string,
    ctx: ValidatorContext,
    metricSources: MetricSource[],
): ValidationResult {
    const exemptVersions = extractVersionExemptNumbers(newValue)
    const candidates = extractNumbers(newValue).filter(n => !exemptVersions.has(n))
    if (candidates.length === 0) return { ok: true }

    const stateText = JSON.stringify(ctx.editorState)
    const messagesText = ctx.userMessages.join(' \n ')
    const allowlist = new Set<string>([
        ...extractNumbers(stateText),
        ...ctx.userMessages.flatMap(extractNumbers),
        ...ctx.userMessages.flatMap(extractWordNumbers).map(normalize),
    ])

    const unverified: string[] = []
    for (const num of candidates) {
        if (allowlist.has(num)) continue

        const source = metricSources.find(s => normalize(s.value) === num)
        if (!source) { unverified.push(num); continue }

        const sourceText = source.source === 'original_resume' ? stateText : messagesText
        const quoteContainsValue = source.quote.length > 0 && source.quote.includes(source.value)
        const quoteIsVerbatim = source.quote.length > 0 && sourceText.includes(source.quote)
        if (!quoteContainsValue || !quoteIsVerbatim) unverified.push(num)
    }

    return unverified.length === 0 ? { ok: true } : { ok: false, unverified }
}

/** Tool-result rejection payload fed back into the tool loop (architecture doc §4.5). */
export function buildRejectionPayload(unverified: string[]) {
    return {
        error: 'unverified_metrics',
        unverified,
        instruction:
            "These figures do not appear in the resume or the user's messages. NEVER invent metrics. " +
            'Ask the user conversationally, offering options: keep it as their estimate, remove the number, or rewrite the line qualitatively without a number.',
    }
}
