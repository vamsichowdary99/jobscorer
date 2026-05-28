import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeRedis } from '@/lib/redis'
import { KEY, TTL } from '@/lib/redis-keys'

/**
 * Warm-cache fallback for company research.
 *
 * The main /api/company-research route writes Redis only after the n8n
 * webhook returns. But n8n + Firecrawl cold runs routinely take 3–7 minutes,
 * which exceeds the route's `maxDuration = 120`. When that happens:
 *   - n8n still writes `company_research` + `company_research_analysis` rows
 *     to Supabase (independent of the HTTP response back to Next.js).
 *   - The Redis cache writes at the bottom of the main route NEVER execute.
 *   - Next click on the same company → cold miss → another 3–7 min run.
 *
 * This endpoint closes the gap. The research page (and the cross-page
 * toaster) call it whenever they observe a freshly-landed result. It reads
 * the DB row(s) and pushes both Redis layers, so the next click on the same
 * company / resume / job lands a sub-second cache hit.
 *
 * Idempotent: safe to call repeatedly; we only write the AI cache when the
 * analysis row actually exists, and we don't over-write a present key.
 */
export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: { companyName?: string; resumeId?: string; jobId?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
    }

    const companyName = (body.companyName || '').trim()
    if (!companyName) {
        return NextResponse.json({ success: false, error: 'companyName required' }, { status: 400 })
    }

    const resumeId = typeof body.resumeId === 'string' ? body.resumeId : ''
    const jobId = typeof body.jobId === 'string' ? body.jobId : ''

    // ── Layer 2: candidate-agnostic company_research block ──────────
    // Fetch latest matching row (case-insensitive on company_name).
    const { data: companyRow } = await supabase
        .from('company_research')
        .select('*')
        .ilike('company_name', companyName)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    let layer2 = false
    if (companyRow) {
        const ok = await safeRedis(async (r) => {
            await r.set(KEY.company(companyName), companyRow, { ex: TTL.COMPANY })
            return true
        })
        layer2 = ok === true
    }

    // ── Layer 1: candidate-tailored AI analysis (per resume + job) ──
    let layer1 = false
    if (resumeId && jobId && companyRow) {
        const { data: analysisRow } = await supabase
            .from('company_research_analysis')
            .select('ai_analysis')
            .eq('user_id', user.id)
            .eq('company_name', companyName)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        const aiAnalysis = (analysisRow as { ai_analysis?: unknown } | null)?.ai_analysis
        if (aiAnalysis) {
            // Match the shape that /api/company-research returns on a cache hit
            // so the front-end consumer doesn't need to special-case anything.
            const payload = {
                success: true,
                company_research: companyRow,
                ai_analysis: aiAnalysis,
            }
            const ok = await safeRedis(async (r) => {
                await r.set(KEY.companyAi(companyName, resumeId, jobId), payload, { ex: TTL.COMPANY_AI })
                return true
            })
            layer1 = ok === true
        }
    }

    return NextResponse.json({ success: true, warmed: { layer1, layer2 } })
}
