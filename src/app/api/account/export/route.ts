import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

// DPDP data-access right: return a JSON copy of everything we hold for the
// authenticated user. Service-role read after verifying identity via cookies.
const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID_TABLES = [
    'resumes',
    'user_job_matches',
    'optimized_resumes',
    'learning_paths',
    'user_profile_data',
    'resume_sections_audit',
    'gap_form_responses',
] as const

export async function GET() {
    const userClient = await createServerClient()
    const { data: { user }, error } = await userClient.auth.getUser()
    if (error || !user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const uid = user.id

    const out: Record<string, unknown> = {
        exported_at: new Date().toISOString(),
        user: { id: uid, email: user.email },
    }

    // profiles is keyed by id (= auth user id), not user_id.
    try {
        const { data } = await admin.from('profiles' as never).select('*').eq('id', uid)
        out.profile = (data as unknown[] | null)?.[0] ?? null
    } catch {
        out.profile = null
    }

    for (const t of USER_ID_TABLES) {
        try {
            const { data } = await admin.from(t as never).select('*').eq('user_id', uid)
            out[t] = data ?? []
        } catch {
            out[t] = []
        }
    }

    return new NextResponse(JSON.stringify(out, null, 2), {
        headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="resuscore-data-${uid}.json"`,
        },
    })
}
