import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { delPattern } from '@/lib/redis'
import { KEY } from '@/lib/redis-keys'
import { requireUserLimit } from '@/lib/rate-limit'
export const maxDuration = 60; // Set timeout to 60 seconds

/**
 * Proxy route: forwards resume upload requests to n8n server-side.
 * On success, invalidates Redis score:<resume_id>:* keys so that re-uploads
 * (or re-parses returning the same resume_id) force fresh n8n scoring.
 */
export async function POST(request: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limited = await requireUserLimit(user.id, 'resume')
    if (limited) return limited

    const webhookUrl = process.env.N8N_RESUME_WEBHOOK_URL
    if (!webhookUrl) {
        console.error('[resume-upload] N8N_RESUME_WEBHOOK_URL not configured')
        return NextResponse.json(
            { success: false, error: 'Resume upload is not configured' },
            { status: 500 }
        )
    }

    let body: Record<string, unknown>
    try {
        body = await request.json()
        body.user_id = user.id
    } catch {
        return NextResponse.json(
            { success: false, error: 'Invalid JSON body' },
            { status: 400 }
        )
    }

    let n8nResponse: Response
    try {
        n8nResponse = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
    } catch (err) {
        // Webhook URL not echoed to client — internal infra detail.
        console.error('[resume-upload] could not reach n8n:', err)
        return NextResponse.json(
            { success: false, error: 'Resume processing service is unavailable' },
            { status: 502 }
        )
    }

    const text = await n8nResponse.text()
    let data: unknown
    try {
        data = JSON.parse(text)
    } catch {
        return new NextResponse(text, {
            status: n8nResponse.status,
            headers: { 'Content-Type': 'text/plain' },
        })
    }

    // Best-effort score-cache invalidation. Resume id may live in several shapes.
    if (n8nResponse.ok) {
        const resumeId = extractResumeId(data)
        if (resumeId) {
            const prefix = KEY.scorePrefix(resumeId) + '*'
            try {
                await delPattern(prefix)
            } catch (err) {
                console.warn('[resume-upload] score cache invalidation failed:', err)
            }
        }
    }

    return NextResponse.json(data, { status: n8nResponse.status })
}

function extractResumeId(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null
    const p = payload as Record<string, unknown>
    if (typeof p.resume_id === 'string') return p.resume_id
    if (p.data && typeof p.data === 'object') {
        const d = p.data as Record<string, unknown>
        if (typeof d.resume_id === 'string') return d.resume_id
    }
    return null
}