import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
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
  // Chunked cookies appear when the JWT payload is large, which is common with
  // Google OAuth sessions. The old endsWith('-auth-token') check missed them,
  // so the transient-error guard below never activated for those users and any
  // getUser() hiccup during a long API call sent them back to /login.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'))

  // Returns true only for server-confirmed "refresh token is gone" — i.e. the
  // user genuinely needs to log in again (token rotated on another device,
  // explicit sign-out, account deleted). Everything else is transient.
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

  // Only /dashboard (UI) and /api (data) require a session. Everything else —
  // landing, browse, legal, auth callback, and any unknown URL — is public, so
  // a mistyped path renders the 404 page instead of bouncing to /login.
  const { pathname } = request.nextUrl
  const isProtected = pathname.startsWith('/dashboard') || pathname.startsWith('/api/')

  // Already-authenticated users shouldn't see the auth pages — send them to the app. (L3)
  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((c) => redirectResponse.cookies.set({ ...c }))
    return redirectResponse
  }

  // If Supabase failed transiently but the user clearly has a session cookie,
  // let the request through. The client-side Supabase will pick up the real
  // state on its own; better than a false-positive logout.
  if (!user && isProtected && !transientError) {
    // API routes must answer with JSON 401 — never redirect to /login.
    // Otherwise client `fetch(...).json()` calls choke on the HTML login page
    // with "Unexpected token '<', '<!DOCTYPE'..." which is opaque to debug.
    if (request.nextUrl.pathname.startsWith('/api/')) {
      const apiResp = new NextResponse(
        JSON.stringify({ error: 'Unauthorized', code: 'session_expired' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
      // Carry any cookies Supabase set during getUser() (e.g. a refreshed
      // session) forward so the next request doesn't have to refresh again.
      supabaseResponse.cookies.getAll().forEach(c => {
        apiResp.cookies.set({ ...c })
      })
      return apiResp
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const redirectResponse = NextResponse.redirect(url)
    // Same reason as the API branch — preserve any cookies the Supabase SDK
    // wrote on supabaseResponse during getUser(). Without this, a refresh that
    // succeeded mid-middleware gets dropped by the redirect, causing the
    // /login retry to refresh again (or, if the refresh token also rotated,
    // to fail outright and log the user out).
    supabaseResponse.cookies.getAll().forEach(c => {
      redirectResponse.cookies.set({ ...c })
    })
    return redirectResponse
  }

  return supabaseResponse
}
