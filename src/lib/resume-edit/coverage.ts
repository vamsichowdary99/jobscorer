// resuscore/src/lib/resume-edit/coverage.ts
//
// Deterministic, free, instant keyword-coverage scoring (architecture doc §5
// Layer 1). Replaces the mock UI's hardcoded 68/74/82 coverage numbers.

export interface AtsKeyword {
    term: string
    weight: 1 | 2 | 3
    variants?: string[]
}

export interface AtsKeywordsData {
    keywords: AtsKeyword[]
    extracted_at: string
}

/** Variant-aware: Σweights(present) / Σweights(all), rounded to an integer 0-100. */
export function computeKeywordCoverage(keywords: AtsKeyword[], atsText: string): number {
    if (!keywords || keywords.length === 0) return 0
    const lower = atsText.toLowerCase()
    let totalWeight = 0
    let presentWeight = 0
    for (const kw of keywords) {
        const weight = kw.weight || 1
        totalWeight += weight
        const terms = [kw.term, ...(kw.variants ?? [])].filter(Boolean)
        if (terms.some(t => lower.includes(t.toLowerCase()))) presentWeight += weight
    }
    return totalWeight === 0 ? 0 : Math.round((presentWeight / totalWeight) * 100)
}
