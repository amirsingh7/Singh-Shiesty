import { redirect } from 'next/navigation'
import Dashboard from './app/Dashboard'
import { site } from '@/content/site'
import { supabaseServer } from '@/lib/auth/supabaseServer'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dashboard · PR Portfolio',
}

// A zero-env-var fork (no Supabase configured) stays exactly as before: no
// auth, a fixed "me" userId, everything in localStorage. Once a Supabase
// project IS configured, this becomes a real gate — signed out visitors are
// sent to /login, and the board renders under the actual signed-in user's id
// so their data is theirs alone (see supabase/auth_migration.sql for the RLS
// that enforces this server-side, not just here).
export default async function Page() {
  const supa = await supabaseServer()
  if (!supa) {
    return <Dashboard firstName={site.name || null} userId="me" />
  }

  const {
    data: { user },
  } = await supa.auth.getUser()

  if (!user) redirect('/login')

  return <Dashboard firstName={site.name || null} userId={user.id} />
}
