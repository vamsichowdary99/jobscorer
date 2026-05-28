import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireUserLimit } from '@/lib/rate-limit'

/**
 * Inserts a job that the user pasted manually (LinkedIn, Naukri, referral, etc.)
 * into the same `jobs` table that ingestion writes to. Marked with
 * `source = 'manual_paste'` so analytics can distinguish them, and with a
 * stable per-user source_id ("manual:{userId}:{hash}") for de-dupe when the
 * same user pastes the same role+company+description twice.
 *
 * The browser client doesn't insert directly because the `jobs` table is
 * service-role-write — RLS keeps the public anon key out of this surface.
 *
 * Each Supabase call is wrapped so we can surface the *real* error to the
 * client + server log instead of the opaque "TypeError: fetch failed" wrapper.
 */

type Payload = {
    title: string
    company: string
    location?: string
    description: string
    source_url?: string
    experience_level?: string
}

/** djb2 — produces a stable short hash for the source_id slug. */
function hashSlug(s: string): string {
    let h = 5381
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h + s.charCodeAt(i)) | 0
    }
    return (h >>> 0).toString(36)
}

/** Build a per-request admin client so dev HMR can't leave us with a stale instance. */
function getAdmin() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url) throw new Error('[manual-paste] NEXT_PUBLIC_SUPABASE_URL is not set')
    if (!key) throw new Error('[manual-paste] SUPABASE_SERVICE_ROLE_KEY is not set')
    return createAdminClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    })
}

export async function POST(req: NextRequest) {
    // ── 1. Auth gate ─────────────────────────────────────────
    let userId: string
    try {
        const userClient = await createServerClient()
        const { data: { user }, error: authError } = await userClient.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
        }
        userId = user.id
    } catch (err) {
        console.error('[manual-paste] auth threw:', err)
        return NextResponse.json({ error: 'Auth check failed' }, { status: 500 })
    }

    // ── 2. Rate limit (per-user, share the ingest bucket) ────
    const limited = await requireUserLimit(userId, 'ingest')
    if (limited) return limited

    // ── 3. Validate body ─────────────────────────────────────
    let body: Payload
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const title = (body.title ?? '').trim().slice(0, 200)
    const company = (body.company ?? '').trim().slice(0, 200)
    const description = (body.description ?? '').trim()
    if (!company) return NextResponse.json({ error: 'Company is required' }, { status: 400 })
    if (!description) return NextResponse.json({ error: 'Job description is required' }, { status: 400 })

    const boundedDescription = description.slice(0, 8000)
    const finalTitle = title || `${company} role`
    const sourceId = `manual:${userId}:${hashSlug(`${company}|${finalTitle}|${boundedDescription.slice(0, 500)}`)}`

    // ── 4. Build admin client ────────────────────────────────
    let admin: ReturnType<typeof getAdmin>
    try {
        admin = getAdmin()
    } catch (err) {
        console.error('[manual-paste] admin client init failed:', err)
        return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    // ── 5. Dedupe check ──────────────────────────────────────
    // Done in a try/catch so a transient network error returns a real message
    // instead of taking down the whole route.
    try {
        const dedupe = await admin
            .from('jobs')
            .select('id')
            .eq('source', 'manual_paste')
            .eq('source_id', sourceId)
            .maybeSingle()
        if (dedupe.error) {
            console.error('[manual-paste] dedupe select failed:', dedupe.error)
            // Don't bail — continue to insert. Worst case we double-insert,
            // and a unique index on (source, source_id) protects us.
        } else if (dedupe.data?.id) {
            return NextResponse.json({ id: dedupe.data.id, deduped: true })
        }
    } catch (err) {
        console.error('[manual-paste] dedupe select threw:', err)
        // Continue to insert anyway.
    }

    // ── 6. Insert row ────────────────────────────────────────
    const row: Record<string, unknown> = {
        source: 'manual_paste',
        source_id: sourceId,
        title: finalTitle,
        company,
        description: boundedDescription,
        posted_date: new Date().toISOString(),
    }
    if (body.location?.trim()) row.location = body.location.trim().slice(0, 200)
    if (body.source_url?.trim()) row.source_url = body.source_url.trim().slice(0, 500)
    if (body.experience_level?.trim()) row.experience_level = body.experience_level.trim().slice(0, 50)

    try {
        const insertRes = await admin
            .from('jobs')
            .insert(row as any)
            .select('id')
            .single()

        if (insertRes.error) {
            // Full error logged server-side; client gets a generic message so we
            // don't leak Postgres column/constraint names to authenticated probers.
            console.error('[manual-paste] insert returned error:', insertRes.error)
            return NextResponse.json({ error: 'Could not save job' }, { status: 500 })
        }
        if (!insertRes.data) {
            console.error('[manual-paste] insert returned no data')
            return NextResponse.json({ error: 'Could not save job' }, { status: 500 })
        }
        return NextResponse.json({ id: (insertRes.data as { id: string }).id, deduped: false })
    } catch (err) {
        console.error('[manual-paste] insert threw:', err)
        return NextResponse.json({ error: 'Could not save job' }, { status: 500 })
    }
}
