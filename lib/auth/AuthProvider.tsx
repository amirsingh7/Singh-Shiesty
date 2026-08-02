'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabaseBrowser } from './supabaseBrowser'

interface AuthState {
  user: User | null
  /** true until the initial session check resolves — avoids a flash of the
   *  signed-out state on first paint. */
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState>({ user: null, loading: true, signOut: async () => {} })

/**
 * Wraps the whole app (see app/layout.tsx) so any client component can call
 * useSession() to find out who's signed in, instead of threading a userId
 * prop through every route. Local-only forks (no Supabase configured) get
 * user: null, loading: false immediately — nothing here ever blocks them.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const c = supabaseBrowser()
    if (!c) {
      setLoading(false)
      return
    }
    let alive = true
    c.auth.getSession().then(({ data }) => {
      if (alive) {
        setUser(data.session?.user ?? null)
        setLoading(false)
      }
    })
    const { data: sub } = c.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    const c = supabaseBrowser()
    if (c) await c.auth.signOut()
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, loading, signOut }}>{children}</AuthContext.Provider>
}

export function useSession(): AuthState {
  return useContext(AuthContext)
}
