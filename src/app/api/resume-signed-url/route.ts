import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Service-role client bypasses storage RLS so we can mint signed URLs reliably.
// The browser cookie-based client is used only to *verify* the caller's identity
// before granting them a URL to a file they actually own.
const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUCKET = 'resumes'

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const resumeId = searchParams.get('id')

    if (!resumeId) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    // 1. Verify the caller is authenticated.
    const userClient = await createServerClient()
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // 2. Look up the resume row + ownership check (using admin client so RLS
    //    can't accidentally hide it from us — we'll enforce ownership manually).
    const { data: resume, error: rowError } = await adminSupabase
        .from('resumes')
        .select('id, user_id, file_url')
        .eq('id', resumeId)
        .maybeSingle()

    if (rowError || !resume) {
        return NextResponse.json({ error: 'Resume not found' }, { status: 404 })
    }
    if (resume.user_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 3. Extract the storage path from the legacy /public/ URL.
    const fileUrl = resume.file_url as string | null
    if (!fileUrl) {
        return NextResponse.json({ error: 'File not available' }, { status: 404 })
    }
    const match = fileUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/resumes\/(.+)$/)
    const path = match?.[1]
    if (!path) {
        return NextResponse.json({ error: 'Malformed file URL' }, { status: 500 })
    }

    // 4. Sign with the service role client (bypasses storage RLS).
    const { data, error } = await adminSupabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 60 * 5)  // 5-minute expiry

    if (error || !data?.signedUrl) {
        return NextResponse.json({ error: error?.message ?? 'Could not sign URL' }, { status: 500 })
    }

    return NextResponse.json({ signedUrl: data.signedUrl })
}
