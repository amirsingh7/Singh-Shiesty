import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side Supabase client for Server Components and Route Handlers —
 * reads the session from the request's cookies (set by the browser client,
 * lib/auth/supabaseBrowser.ts, via the same @supabase/ssr cookie contract).
 * This is how a route with no browser JS (e.g. the Spotify OAuth callback)
 * can still find out WHO is signed in.
 *
 * Returns null when Supabase isn't configured (zero-env-var fork) so every
 * caller can no-op back to local-only behavior, same convention as
 * lib/tiles/tileSupabase.ts's supa().
 */
export async function supabaseServer(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null

  const cookieStore = await cookies()
  try {
    return createServerClient(url, key, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Called from a Server Component render (no response to attach
            // Set-Cookie to) — middleware.ts refreshes the session instead.
          }
        },
      },
    })
  } catch {
    return null
  }
}
