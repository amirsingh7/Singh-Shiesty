import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The one browser-side Supabase client for the whole app. Cookie-backed (via
 * @supabase/ssr) instead of the default localStorage session, so the same
 * login is visible to server components/route handlers that read the request
 * cookies (see lib/auth/supabaseServer.ts) — needed for the Spotify OAuth
 * callback and any other server route that has to know WHO is signed in.
 *
 * Lazy + env-gated like lib/tiles/tileSupabase.ts's supa(): a fork with no
 * Supabase project configured just never calls this and stays local-only.
 */
let client: SupabaseClient | null = null

export function supabaseBrowser(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  if (!client) {
    try {
      client = createBrowserClient(url, key)
    } catch {
      return null
    }
  }
  return client
}
