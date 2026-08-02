'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/auth/supabaseBrowser'
import { site } from '@/content/site'

/**
 * Email/password sign-in for a real, multi-tenant PR Portfolio account. Only
 * reachable when Supabase is configured (app/page.tsx redirects here when
 * signed out) — a zero-env-var fork never sees this page at all.
 */
export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    // Already signed in (e.g. back-button after login) — bounce straight to the board.
    const c = supabaseBrowser()
    if (!c) return
    c.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/')
    })
  }, [router])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    const c = supabaseBrowser()
    if (!c) {
      setError('Supabase is not configured — add NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY first.')
      return
    }
    setBusy(true)
    if (mode === 'forgot') {
      // Explicit redirectTo, unlike the Supabase dashboard's own "send
      // recovery email" button — that one redirects to the project's Site
      // URL instead, which for this app is `/`, a page that immediately
      // bounces signed-out visitors to /login before any reset code can be
      // read. Requesting it from here sends the link straight to the one
      // page built to handle it.
      const { error: err } = await c.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      setBusy(false)
      if (err) {
        setError(err.message)
        return
      }
      setMessage('Check your email for a reset link.')
      return
    }
    if (mode === 'signup') {
      const { error: err } = await c.auth.signUp({ email, password })
      setBusy(false)
      if (err) {
        setError(err.message)
        return
      }
      setMessage('Account created. Check your email if confirmation is required, then sign in.')
      setMode('signin')
      return
    }
    const { error: err } = await c.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    router.replace('/')
    router.refresh()
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0A0D14',
        color: '#fff',
        padding: 24,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: 'min(380px, 100%)',
          background: '#121722',
          border: '1px solid #262c38',
          borderRadius: 16,
          padding: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 13, letterSpacing: '.08em', color: '#8a92a3', textTransform: 'uppercase' }}>
            {site.name ? `${site.name}'s` : 'Your'} PR Portfolio
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
            {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create your account' : 'Reset your password'}
          </h1>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#b7bdc9' }}>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            style={inputStyle}
          />
        </label>
        {mode !== 'forgot' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#b7bdc9' }}>
            Password
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              style={inputStyle}
            />
          </label>
        )}

        {error && <div style={{ color: '#ff8080', fontSize: 13 }}>{error}</div>}
        {message && <div style={{ color: '#7fd88f', fontSize: 13 }}>{message}</div>}

        <button
          type="submit"
          disabled={busy}
          style={{
            marginTop: 8,
            padding: '11px 16px',
            borderRadius: 10,
            border: 'none',
            background: busy ? '#3a4152' : '#fff',
            color: busy ? '#9aa1af' : '#0A0D14',
            fontWeight: 600,
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          {busy
            ? 'Please wait…'
            : mode === 'signin'
              ? 'Sign in'
              : mode === 'signup'
                ? 'Create account'
                : 'Send reset link'}
        </button>

        {mode === 'signin' && (
          <button
            type="button"
            onClick={() => {
              setMode('forgot')
              setError(null)
              setMessage(null)
            }}
            style={{ background: 'transparent', border: 'none', color: '#8a92a3', fontSize: 13, cursor: 'pointer' }}
          >
            Forgot password?
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signup' ? 'signin' : mode === 'forgot' ? 'signin' : 'signup')
            setError(null)
            setMessage(null)
          }}
          style={{ background: 'transparent', border: 'none', color: '#8a92a3', fontSize: 13, cursor: 'pointer', marginTop: 4 }}
        >
          {mode === 'signin' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: '#0d121c',
  border: '1px solid #262c38',
  borderRadius: 8,
  padding: '9px 11px',
  color: '#fff',
  fontSize: 14,
}
