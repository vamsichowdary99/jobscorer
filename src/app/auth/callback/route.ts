import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { welcomeEmailHtml } from '@/lib/emailTemplates'

async function sendWelcomeEmailOnce(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
  if (!user.email || user.user_metadata?.welcome_email_sent) return

  try {
    await sendEmail({ to: user.email, subject: 'Welcome to JobScorer', html: welcomeEmailHtml() })
  } catch (err) {
    console.error('[auth/callback] welcome email failed:', err)
    return
  }

  const admin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, welcome_email_sent: true },
  })
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      if (data.user) await sendWelcomeEmailOnce(data.user)
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
