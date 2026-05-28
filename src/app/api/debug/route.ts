import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const keyPresent = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    const { data, error, count } = await supabase
        .from('jobs')
        .select('id, title, company', { count: 'exact' })
        .limit(3)

    return NextResponse.json({
        envUrl: url,
        keyPresent,
        error: error ? { message: error.message, code: error.code, details: error.details } : null,
        count,
        sample: data,
    })
}
