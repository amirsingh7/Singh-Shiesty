import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase auth session cookie on every request. Without this,
 * a session nearing its access-token expiry can go stale between page loads
 * (Server Components can read cookies but, per lib/auth/supabaseServer.ts,
 * can't always write the refreshed ones back) — middleware is the one place
 * in Next.js App Router that reliably can. No-ops entirely when Supabase
 * isn't configured (zero-env-var fork stays local-only, no redirect).
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.next()

  // Signed-out visitors (most public profile views) have no session to
  // refresh — skip the Supabase round-trip entirely.
  const hasSession = request.cookies.getAll().some(c => c.name.startsWith('sb-'))
  if (!hasSession) return NextResponse.next()

  let response = NextResponse.next({ request })

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
      },
    },
  })

  // Never let a slow or unreachable Supabase (e.g. a paused free project)
  // hang the whole site — Vercel kills middleware that runs too long.
  try {
    await Promise.race([
      supabase.auth.getUser(),
      new Promise(resolve => setTimeout(resolve, 1500)),
    ])
  } catch {
    // Auth refresh is best-effort; the page still renders.
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|tiles/|exercise-refs/).*)'],
}
