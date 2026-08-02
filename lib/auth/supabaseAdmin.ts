import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client — SERVER ONLY, never import this from a
 * component or anything that could ship to the browser. It bypasses RLS
 * entirely, so every query using it must filter by user_id explicitly; there
 * is no database-enforced isolation once you're on this client.
 *
 * Exists for automation endpoints with no browser session to read a cookie
 * from — the iOS Shortcut hitting /api/vitals/ingest, and the MCP connector
 * hitting /api/mcp — both authenticate via a static bearer token instead of a
 * login, so they resolve "which user" from OWNER_USER_ID (set once, after you
 * sign up in the app) rather than auth.uid().
 */
let client: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  if (!client) {
    try {
      client = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        // Next.js patches global fetch to cache GET requests by default —
        // without this override a page/route reading through this client
        // can serve a stale row after a write, since Supabase's own selects
        // are plain GETs Next has no way to know just went stale.
        global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
      })
    } catch {
      return null
    }
  }
  return client
}
