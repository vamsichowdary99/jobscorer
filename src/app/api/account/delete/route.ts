import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Service-role client: deletes the user's data and the auth user itself
// (self-delete isn't possible with the anon key). We verify the caller's
// identity with the cookie-based client first, then act only on their own id.
const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Tables keyed by user_id (text). Each delete is best-effort: a missing table
// or column logs a warning rather than aborting the whole erasure.
const USER_ID_TABLES = [
    'optimized_resumes',
    'company_research_analysis',
    'user_job_matches',
    'learning_paths',
    'gap_form_responses',
    'resume_sections_audit',
    'user_profile_data',
    'resumes',
] as const

export async function POST() {
    const userClient = await createServerClient()
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const uid = user.id

    // 1. Collect the user's resume ids first — resume_skills has no user_id.
    let resumeIds: string[] = []
    try {
        const { data } = await admin.from('resumes').select('id').eq('user_id', uid)
        resumeIds = (data ?? []).map((r: { id: string }) => r.id)
    } catch (e) {
        console.warn('[account/delete] could not list resumes:', e)
    }

    // 2. Remove the user's stored resume files (foldered by user id).
    try {
        const { data: files } = await admin.storage.from('resumes').list(uid)
        if (files?.length) {
            await admin.storage.from('resumes').remove(files.map((f) => `${uid}/${f.name}`))
        }
    } catch (e) {
        console.warn('[account/delete] storage cleanup failed:', e)
    }

    // 3. Delete resume-scoped rows.
    if (resumeIds.length) {
        try {
            await admin.from('resume_skills' as never).delete().in('resume_id', resumeIds)
        } catch (e) {
            console.warn('[account/delete] resume_skills:', e)
        }
    }

    // 4. Delete user-scoped rows.
    for (const table of USER_ID_TABLES) {
        try {
            await admin.from(table as never).delete().eq('user_id', uid)
        } catch (e) {
            console.warn(`[account/delete] ${table}:`, e)
        }
    }

    // 5. Delete the profile row (PK = auth user id; would also cascade below).
    try {
        await admin.from('profiles' as never).delete().eq('id', uid)
    } catch (e) {
        console.warn('[account/delete] profiles:', e)
    }

    // 6. Delete the auth user itself — the part the old flow punted to "support".
    const { error: delErr } = await admin.auth.admin.deleteUser(uid)
    if (delErr) {
        return NextResponse.json(
            { error: 'Your data was removed, but final account deletion failed. Please contact support.' },
            { status: 500 }
        )
    }

    return NextResponse.json({ ok: true })
}
