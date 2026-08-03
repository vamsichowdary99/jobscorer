import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { delPattern } from '@/lib/redis'
import { KEY } from '@/lib/redis-keys'
import { requireUserLimit } from '@/lib/rate-limit'
import { checkStoredLimit } from '@/lib/plan'
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

    // Server-side file validation (H5). The client sends { file: <base64>, filename }.
    // Client-side caps are a UX hint only — enforce type + size here on the trust
    // boundary the app controls. Limits match the product contract: PDF/DOCX, ≤10MB.
    const MAX_BYTES = 10 * 1024 * 1024
    const ALLOWED_EXT = ['.pdf', '.docx']
    const fileB64 = typeof body.file === 'string' ? body.file : ''
    const filename = typeof body.filename === 'string' ? body.filename : ''
    const lowerName = filename.toLowerCase()
    if (!fileB64 || !filename || !ALLOWED_EXT.some((ext) => lowerName.endsWith(ext))) {
        return NextResponse.json(
            { success: false, error: 'A PDF or DOCX file is required' },
            { status: 400 }
        )
    }
    // Estimate decoded size from base64 length (defensively strip a data: prefix
    // if one is ever present). ~4 base64 chars encode 3 bytes.
    const b64 = fileB64.includes(',') ? fileB64.slice(fileB64.indexOf(',') + 1) : fileB64
    const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
    const approxBytes = Math.floor((b64.length * 3) / 4) - padding
    if (approxBytes <= 0 || approxBytes > MAX_BYTES) {
        return NextResponse.json(
            { success: false, error: 'File must be non-empty and at most 10MB' },
            { status: 400 }
        )
    }

    // Retry guard: the n8n parse takes 15-35s, and a dropped mobile connection
    // during that window makes the client think the upload failed when it's
    // still running server-side — the user then retaps upload with the same
    // file. Without this check, checkStoredLimit's count-then-n8n-inserts-later
    // race lets every retry slip through and each one creates a real duplicate
    // resume row. Same user + same filename + created moments ago = a retry of
    // an in-flight or just-finished upload, not a new resume — reuse it.
    const RETRY_WINDOW_MS = 3 * 60 * 1000
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: recentDupe } = await (supabase as any)
        .from('resumes')
        .select('id, parsing_confidence')
        .eq('user_id', user.id)
        .eq('original_filename', filename)
        .gte('created_at', new Date(Date.now() - RETRY_WINDOW_MS).toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (recentDupe) {
        return NextResponse.json({
            success: true,
            data: {
                resume_id: recentDupe.id,
                parsing_confidence: recentDupe.parsing_confidence ?? 0,
                parsed_preview: {},
            },
        })
    }

    const limited = await requireUserLimit(user.id, 'resume')
    if (limited) return limited

    // Stored-resource cap: Free 1 / Pro 5 / Max 20 résumés. Delete one to free a slot.
    const capped = await checkStoredLimit(user.id, 'resumes')
    if (capped) return capped

    const webhookUrl = process.env.N8N_RESUME_WEBHOOK_URL
    if (!webhookUrl) {
        console.error('[resume-upload] N8N_RESUME_WEBHOOK_URL not configured')
        return NextResponse.json(
            { success: false, error: 'Resume upload is not configured' },
            { status: 500 }
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