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
    pathname === '/api/debug/redis' ||
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
