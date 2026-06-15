import { timingSafeEqual } from 'crypto'

/**
 * Timing-safe check for the admin bearer header `X-Admin-Token`.
 *
 * Prefers a dedicated `ADMIN_API_TOKEN`; falls back to `SUPABASE_SERVICE_ROLE_KEY`
 * for backward compatibility with existing admin routes (refresh-jobs, extract-years,
 * score-legitimacy). Phase 2 / H1: set `ADMIN_API_TOKEN` in env and migrate every
 * admin route to this helper so the service-role key is no longer used as a bearer.
 *
 * Returns true only when a non-empty expected token is configured and the supplied
 * token matches it in constant time.
 */
function tokensMatch(supplied: string, expected: string): boolean {
    if (!expected || !supplied) return false
    const a = Buffer.from(supplied)
    const b = Buffer.from(expected)
    // timingSafeEqual throws on length mismatch — guard first (length is not secret).
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
}

export function isValidAdminToken(req: Request): boolean {
    return tokensMatch(
        req.headers.get('x-admin-token') ?? '',
        process.env.ADMIN_API_TOKEN || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    )
}

/**
 * Timing-safe check for the `X-Internal-Token` header guarding /api/rag/* routes
 * (called server-to-server by n8n). Matches against `N8N_INTERNAL_TOKEN`.
 */
export function isValidInternalToken(req: Request): boolean {
    return tokensMatch(
        req.headers.get('x-internal-token') ?? '',
        process.env.N8N_INTERNAL_TOKEN || '',
    )
}
