import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type AllowedSection =
    | 'work_experience'
    | 'education'
    | 'skills'
    | 'certifications'
    | 'projects'
    | 'personal_info'
    | 'professional_summary'

const ALLOWED_SECTIONS: AllowedSection[] = [
    'work_experience',
    'education',
    'skills',
    'certifications',
    'projects',
    'personal_info',
    'professional_summary',
]

// structured_data in Supabase is sometimes a plain object, sometimes a JSON-encoded string,
// sometimes double-stringified (n8n quirk). Parse to a JS object and remember the depth so we
// can write it back in the same format and avoid breaking downstream consumers.
function unwrap(raw: unknown): { data: Record<string, unknown>; depth: number } {
    let data: unknown = raw
    let depth = 0
    while (typeof data === 'string') {
        try {
            data = JSON.parse(data)
            depth++
        } catch {
            break
        }
    }
    if (data == null || typeof data !== 'object') {
        return { data: {}, depth }
    }
    return { data: data as Record<string, unknown>, depth }
}

function rewrap(data: Record<string, unknown>, depth: number): unknown {
    let out: unknown = data
    for (let i = 0; i < depth; i++) {
        out = JSON.stringify(out)
    }
    return out
}

export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: { resume_id?: string; section?: string; value?: unknown }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { resume_id, section, value } = body
    if (!resume_id || !section) {
        return NextResponse.json({ error: 'resume_id and section are required' }, { status: 400 })
    }
    if (!ALLOWED_SECTIONS.includes(section as AllowedSection)) {
        return NextResponse.json({ error: `Section "${section}" is not allowed` }, { status: 400 })
    }
    // Validate the section value: must be present, serializable, and size-bounded
    // so a user can't store an oversized/cyclic blob in their structured_data. (M7)
    if (value === undefined) {
        return NextResponse.json({ error: 'value is required' }, { status: 400 })
    }
    let serializedValue: string
    try {
        serializedValue = JSON.stringify(value)
    } catch {
        return NextResponse.json({ error: 'value is not serializable' }, { status: 400 })
    }
    if (serializedValue && serializedValue.length > 200_000) {
        return NextResponse.json({ error: 'value is too large' }, { status: 413 })
    }

    // Verify ownership and fetch current structured_data.
    // Cast to any: the generated Supabase types don't cover the resumes table here (matches gap-form route).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    const { data: row, error: fetchErr } = await sb
        .from('resumes')
        .select('id, user_id, structured_data')
        .eq('id', resume_id)
        .maybeSingle()

    if (fetchErr) {
        return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    }
    if (!row) {
        return NextResponse.json({ error: 'Resume not found' }, { status: 404 })
    }
    if (row.user_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: current, depth } = unwrap(row.structured_data)

    // Patch the target section
    const next = { ...current, [section]: value }
    const repacked = rewrap(next, depth)

    const { error: updateErr } = await sb
        .from('resumes')
        .update({ structured_data: repacked })
        .eq('id', resume_id)

    if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, structured_data: next })
}
