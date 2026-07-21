import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // A failed password-recovery exchange (expired/already-used link) should
  // land on /reset-password, which already renders a friendly "link expired"
  // state when it finds no session — rather than a silent /login redirect.
  if (next.startsWith('/reset-password')) {
    return NextResponse.redirect(`${origin}/reset-password`)
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
