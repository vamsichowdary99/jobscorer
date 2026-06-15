import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Never auth-gate static assets, font API, the redis debug verification route,
  // admin routes, or RAG embedding routes — admin and RAG routes use their own
  // X-Admin-Token / X-Internal-Token header auth instead of session cookies.
  if (
    pathname.startsWith('/fonts/') ||
    pathname.startsWith('/api/fonts/') ||
    pathname.startsWith('/api/admin/') ||
    pathname.startsWith('/api/rag/') ||
    // Razorpay webhook authenticates via X-Razorpay-Signature (HMAC), not a
    // session cookie — Razorpay's servers have no session. Must bypass auth.
    pathname === '/api/billing/webhook' ||
    pathname === '/api/debug/redis' ||
    // Public SEO / metadata routes — must be reachable without a session and
    // never trigger a Supabase auth lookup (crawlers, social scrapers, favicon).
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/manifest.webmanifest' ||
    pathname.startsWith('/opengraph-image') ||
    pathname.startsWith('/twitter-image') ||
    pathname.startsWith('/icon') ||
    pathname.startsWith('/apple-icon') ||
    /\.(ttf|otf|woff|woff2|svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname)
  ) {
    return NextResponse.next()
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
