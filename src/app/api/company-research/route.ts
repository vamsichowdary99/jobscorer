import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { safeRedis } from '@/lib/redis'
import { KEY, TTL } from '@/lib/redis-keys'
import { requireUserLimit } from '@/lib/rate-limit'

// When an L1 cache hit serves a response, the n8n "Save AI Analysis" node
// never runs, so the DB row that powers the research-history sidebar is
// missing. Mirror what that node would have written so the sidebar stays
// in sync with what the user actually saw. Fire-and-forget — never let a
// DB hiccup slow the user-facing response.
async function backfillAnalysisRow(args: {
    userId: string
    resumeId: string
    jobId: string
    companyName: string
    aiAnalysis: unknown
}) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return
    const supabase = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { error } = await supabase
        .from('company_research_analysis')
        .upsert(
            {
                user_id: args.userId,
                resume_id: args.resumeId,
                job_id: args.jobId,
                company_name: args.companyName,
                ai_analysis: args.aiAnalysis,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,company_name,job_id,resume_id', ignoreDuplicates: false }
        )
    if (error) console.warn('[company-research] cache-hit backfill failed:', error.message)
}

// Firecrawl agent can take time to browse and research
export const maxDuration = 120

class N8nError extends Error {
    status: number
    constructor(status: number, message: string) {
        super(message)
        this.status = status
    }
}

// Two-layer cache:
//   1. companyAi:<slug>:<resumeId>:<jobId> — full candidate-tailored response (24h).
//      Same resume + same job = same output, so this layer turns warm clicks into <1s.
//   2. company:<slug> — candidate-agnostic company_research block (7d). When the AI
//      cache misses but this hits, we pass it to n8n so Firecrawl/Supabase lookup
//      both get skipped — saves ~3min on a cold company.
export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: Record<string, unknown>
    try {
        body = (await req.json()) as Record<string, unknown>
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
    }
    body.user_id = user.id

    const job = (body.job ?? {}) as { company?: string }
    const company = job.company ?? ''
    if (!company) {
        return NextResponse.json(
            { success: false, error: 'job.company is required' },
            { status: 400 }
        )
    }

    const jobId = typeof body.job_id === 'string' ? body.job_id : ''
    const resumeId = typeof body.resume_id === 'string' ? body.resume_id : ''

    // Layer 1: full AI-tailored response cache. Only attempted when we have
    // resume_id + job_id — without both the cache key isn't safe to share.
    if (resumeId && jobId) {
        const aiKey = KEY.companyAi(company, resumeId, jobId)
        const aiHit = await safeRedis<Record<string, unknown> | null>(async (r) => {
            return await r.get<Record<string, unknown>>(aiKey)
        })
        if (aiHit) {
            // Make sure the sidebar history catches up — n8n's Save AI Analysis
            // node didn't run, so without this the DB row will be missing.
            if (aiHit.ai_analysis) {
                void backfillAnalysisRow({
                    userId: user.id,
                    resumeId,
                    jobId,
                    companyName: company,
                    aiAnalysis: aiHit.ai_analysis,
                })
            }
            return NextResponse.json({ ...aiHit, cached: true, cache_layer: 'ai' })
        }
    }

    // Past the cheap path — now rate-limit the expensive one.
    const rl = await requireUserLimit(user.id, 'company')
    if (rl) return rl

    const webhookUrl = process.env.N8N_COMPANY_RESEARCH_WEBHOOK
    if (!webhookUrl) {
        return NextResponse.json(
            { success: false, error: 'N8N_COMPANY_RESEARCH_WEBHOOK not configured' },
            { status: 500 }
        )
    }

    const companyKey = KEY.company(company)

    // Layer 2: candidate-agnostic company block. If warm, hand it to n8n so it
    // can skip its own Supabase lookup branch entirely.
    const cachedBlock = await safeRedis<Record<string, unknown> | null>(async (r) => {
        return await r.get<Record<string, unknown>>(companyKey)
    })
    if (cachedBlock) {
        body.cached_company_research = cachedBlock
    }

    let value: Record<string, unknown>
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
        if (!response.ok) {
            const errorText = await response.text()
            throw new N8nError(response.status, `n8n error: ${errorText}`)
        }
        value = (await response.json()) as Record<string, unknown>
    } catch (err) {
        if (err instanceof N8nError) {
            return NextResponse.json({ success: false, error: err.message }, { status: err.status })
        }
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error('Company research proxy error:', err)
        return NextResponse.json({ success: false, error: msg }, { status: 502 })
    }

    // Backfill both cache layers. The AI layer is keyed per-resume-per-job so
    // there's no cross-user bleed; the company layer is shared across all users.
    const companyResearch = value.company_research
    if (companyResearch && typeof companyResearch === 'object' && !cachedBlock) {
        await safeRedis(async (r) => {
            await r.set(companyKey, companyResearch, { ex: TTL.COMPANY })
            return true
        })
    }

    if (resumeId && jobId && value.ai_analysis && value.company_research) {
        const aiKey = KEY.companyAi(company, resumeId, jobId)
        await safeRedis(async (r) => {
            await r.set(aiKey, value, { ex: TTL.COMPANY_AI })
            return true
        })
    }

    return NextResponse.json({ ...value, cached: Boolean(cachedBlock) || Boolean(value.cached) })
}
