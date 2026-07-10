import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUserLimit } from '@/lib/rate-limit'
import { logEstimatedUsage } from '@/lib/usage'
import { checkQuota } from '@/lib/plan'

// Cover letter generation can take time (AI + n8n workflow)
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await requireUserLimit(user.id, 'cover-letter')
  if (rl) return rl

  const supabase = supabaseAuth

  try {
    const body = await req.json()
    const { resume_id, job_id, force_refresh } = body
    const user_id = user.id

    // ── Validate required fields ──────────────────────────
    if (!resume_id || !job_id) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: resume_id, job_id' },
        { status: 400 }
      )
    }

    // ── Cache-first: a row must already exist (resume was optimized) ───────
    const { data: row, error: rowError } = await supabase
      .from('optimized_resumes' as any)
      .select('cover_letter')
      .eq('user_id', user_id)
      .eq('resume_id', resume_id)
      .eq('job_id', job_id)
      .single()

    if (rowError || !row) {
      return NextResponse.json(
        { success: false, error: 'not_optimized' },
        { status: 409 }
      )
    }

    const existingLetter = (row as any).cover_letter
    if (existingLetter && !force_refresh) {
      return NextResponse.json({ success: true, cached: true, cover_letter: existingLetter })
    }

    // Past the cache → real generation will run. Count it against the quota.
    const overQuota = await checkQuota(user_id, 'cover_letter')
    if (overQuota) return overQuota

    // ── Forward to n8n cover-letter webhook ───────────────────
    const webhookUrl = process.env.N8N_COVER_LETTER_WEBHOOK_URL

    if (!webhookUrl) {
      return NextResponse.json(
        { success: false, error: 'N8N_COVER_LETTER_WEBHOOK_URL not configured' },
        { status: 500 }
      )
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120_000)

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id, resume_id, job_id }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const errorText = await response.text()
        // Log full upstream detail server-side; return a generic message.
        console.error('[/api/cover-letter] n8n error:', response.status, errorText)
        return NextResponse.json(
          { success: false, error: 'Cover letter generation failed' },
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

      // The optimized_resumes row was deleted between our cache check and the
      // n8n PATCH — same guard as the workflow's own orphan check.
      if (data.error === 'not_optimized') {
        return NextResponse.json(
          { success: false, error: 'not_optimized' },
          { status: 409 }
        )
      }

      if (!data.success) {
        console.error('[/api/cover-letter] n8n returned failure:', data)
        return NextResponse.json(
          { success: false, error: data.error || 'Cover letter generation failed' },
          { status: 502 }
        )
      }

      // Fresh (non-cached) generation ran the n8n AI workflow — log its cost.
      void logEstimatedUsage({ userId: user_id, feature: 'cover_letter' })
      return NextResponse.json({ success: true, cover_letter: data.cover_letter })
    } catch (fetchError: any) {
      clearTimeout(timeout)

      if (fetchError.name === 'AbortError') {
        return NextResponse.json(
          { success: false, error: 'Cover letter request timed out after 120 seconds' },
          { status: 504 }
        )
      }
      throw fetchError
    }
  } catch (error: any) {
    console.error('Cover letter proxy error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Unknown error occurred' },
      { status: 500 }
    )
  }
}
