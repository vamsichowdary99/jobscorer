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

  // Detect whether a Supabase auth cookie was actually sent. If it was, we
  // give the session the benefit of the doubt on transient getUser() failures
  // (network blip, in-flight refresh-token rotation) — the alternative was
  // bouncing the user to /login mid-session whenever Supabase took >1s.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))

  let user = null
  let transientError = false
  try {
    const { data, error } = await supabase.auth.getUser()
    user = data.user
    // Network/refresh errors leave user=null but set `error`. Distinguish them
    // from a clean "no session at all" so we don't kick users out on hiccups.
    if (!user && error && hasAuthCookie) {
      transientError = true
    }
  } catch {
    if (hasAuthCookie) transientError = true
  }

  // Public routes that don't require auth
  const publicPaths = ['/', '/browse', '/login', '/signup', '/auth']
  const isPublic = publicPaths.some(
    (path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(path + '/')
  )

  // If Supabase failed transiently but the user clearly has a session cookie,
  // let the request through. The client-side Supabase will pick up the real
  // state on its own; better than a false-positive logout.
  if (!user && !isPublic && !transientError) {
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
