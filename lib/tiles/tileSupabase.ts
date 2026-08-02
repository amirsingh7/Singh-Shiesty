/**
 * Optional Supabase client for real cross-device tile saving.
 *
 * Created lazily and ONLY when both env vars are present; otherwise the base
 * stays on localStorage and never touches Supabase. Delegates to the shared
 * cookie-backed browser client (lib/auth/supabaseBrowser.ts) so every tile
 * read/write carries the signed-in user's session — RLS (`auth.uid() =
 * user_id`) depends on that session being present, not just the anon key.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseBrowser } from '@/lib/auth/supabaseBrowser'

export function supa(): SupabaseClient | null {
  return supabaseBrowser()
}
