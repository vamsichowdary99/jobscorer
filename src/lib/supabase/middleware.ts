import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl

  // API routes handle their own auth in the route handler via createClient() +
  // getUser(). Route handlers use cookies() from next/headers, which reliably
  // writes Set-Cookie back to the browser on token refresh. Middleware's
  // NextResponse.next() cookies don't propagate to API responses on Vercel,
  // causing token-rotation 401s after the first server-side refresh.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Detect any Supabase auth cookie — covers both unchunked
  // (sb-[ref]-auth-token) and chunked (sb-[ref]-auth-token.0, .1 …) variants.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'))

  // Returns true only for server-confirmed "refresh token is gone".
  function isGenuineExpiry(msg: string, status?: number): boolean {
    return (
      msg.includes('refresh_token_not_found') ||
      msg.includes('Invalid Refresh Token') ||
      msg.includes('Refresh Token Not Found') ||
      status === 400
    )
  }

  let user = null
  let transientError = false
  try {
    const { data, error } = await supabase.auth.getUser()
    user = data.user
    if (!user && error && hasAuthCookie) {
      const msg = error.message ?? ''
      const status = (error as { status?: number }).status
      if (!isGenuineExpiry(msg, status)) transientError = true
    }
  } catch (err) {
    if (hasAuthCookie) {
      const msg = err instanceof Error ? err.message : ''
      if (!isGenuineExpiry(msg)) transientError = true
    }
  }

  // Only /dashboard (UI pages) requires a session via middleware. API routes
  // are handled above with an early return.
  const isProtected = pathname.startsWith('/dashboard')

  // OAuth identities (Google) are pre-verified by the provider, so
  // email_confirmed_at is only ever null for an unconfirmed password signup.
  const isUnconfirmed = !!user && !user.email_confirmed_at

  // Already-authenticated users shouldn't see the auth pages.
  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = isUnconfirmed ? '/verify-email' : '/dashboard'
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((c) => redirectResponse.cookies.set({ ...c }))
    return redirectResponse
  }

  if (!user && isProtected && !transientError) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach(c => {
      redirectResponse.cookies.set({ ...c })
    })
    return redirectResponse
  }

  if (isUnconfirmed && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/verify-email'
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach(c => {
      redirectResponse.cookies.set({ ...c })
    })
    return redirectResponse
  }

  return supabaseResponse
}
