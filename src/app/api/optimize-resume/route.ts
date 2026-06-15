import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUserLimit } from '@/lib/rate-limit'
import { logEstimatedUsage } from '@/lib/usage'
import { checkQuota } from '@/lib/plan'

// Resume optimisation can take time (AI + n8n workflow)
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await requireUserLimit(user.id, 'optimize')
  if (rl) return rl

  const supabase = supabaseAuth

  try {
    const body = await req.json()
    // Override user_id with authenticated user
    const { resume_id, job_id, force_refresh, gap_data, accepted_recommendations } = body
    const user_id = user.id

    // The optimized_resumes cache key has no notion of accepted recommendations,
    // so accepting any item must bypass the cache and re-run the optimizer.
    const hasAccepted = Array.isArray(accepted_recommendations) && accepted_recommendations.length > 0
    const skipCache = !!force_refresh || hasAccepted

    // ── Validate required fields ──────────────────────────
    if (!user_id || !resume_id || !job_id) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: user_id, resume_id, job_id' },
        { status: 400 }
      )
    }

    // ── Check cache (unless force_refresh or items accepted) ────────────────
    if (!skipCache) {
      const { data: cached, error: cacheError } = await supabase
        .from('optimized_resumes' as any)
        .select('*')
        .eq('user_id', user_id)
        .eq('resume_id', resume_id)
        .eq('job_id', job_id)
        .single()

      if (!cacheError && cached) {
        const row = cached as any
        // stitch workflow saves as optimized_json; Claude workflow saves as optimized_data
        const optimized_data = row.optimized_data || row.optimized_json
        return NextResponse.json({
          success: true,
          cached: true,
          optimized_data,
          keyword_alignment_score: row.keyword_alignment_score,
          optimization_notes: row.optimization_notes,
        })
      }
    }

    // Past the cache → real optimization will run. Count it against the quota.
    const overQuota = await checkQuota(user_id, 'optimize')
    if (overQuota) return overQuota

    // ── Forward to n8n optimise webhook ───────────────────
    const webhookUrl =
      process.env.NEXT_PUBLIC_N8N_OPTIMIZE_WEBHOOK ||
      process.env.N8N_OPTIMIZE_WEBHOOK_URL

    if (!webhookUrl) {
      return NextResponse.json(
        { success: false, error: 'N8N_OPTIMIZE_WEBHOOK not configured' },
        { status: 500 }
      )
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120_000)

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id, resume_id, job_id, gap_data: gap_data ?? null, accepted_recommendations: hasAccepted ? accepted_recommendations : [] }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const errorText = await response.text()
        // Log full upstream detail server-side; return a generic message. (M9)
        console.error('[/api/optimize-resume] n8n error:', response.status, errorText)
        return NextResponse.json(
          { success: false, error: 'Resume optimization failed' },
          { status: response.status }
        )
      }

      const rawText = await response.text()
      if (!rawText || !rawText.trim()) {
        return NextResponse.json(
          { success: false, error: 'n8n workflow returned empty response — check n8n execution logs for the error' },
          { status: 502 }
        )
      }
      let data: any
      try {
        data = JSON.parse(rawText)
      } catch {
        return NextResponse.json(
          { success: false, error: `n8n returned non-JSON response: ${rawText.slice(0, 200)}` },
          { status: 502 }
        )
      }
      // Normalize field names: stitch workflow returns `optimized_resume`,
      // Claude workflow returns `optimized_data` — map both to `optimized_data`
      if (data.optimized_resume && !data.optimized_data) {
        data.optimized_data = data.optimized_resume
        delete data.optimized_resume
      }
      // Fresh (non-cached) optimization ran the n8n AI workflow — log its cost.
      void logEstimatedUsage({ userId: user_id, feature: 'optimize' })
      return NextResponse.json(data)
    } catch (fetchError: any) {
      clearTimeout(timeout)

      if (fetchError.name === 'AbortError') {
        return NextResponse.json(
          { success: false, error: 'Optimization request timed out after 120 seconds' },
          { status: 504 }
        )
      }
      throw fetchError
    }
  } catch (error: any) {
    console.error('Optimize resume proxy error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Unknown error occurred' },
      { status: 500 }
    )
  }
}
