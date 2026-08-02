'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/auth/supabaseBrowser'

/**
 * Where a Supabase "reset password" email link lands. The link itself
 * carries a recovery token in the URL that the browser client picks up
 * automatically (detectSessionInUrl, on by default) — this page just waits
 * for that recovery session, then lets the user set a new password via
 * auth.updateUser(). Without this page, clicking the email link had nowhere
 * to actually complete the reset.
 */
export default function ResetPasswordPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const c = supabaseBrowser()
    if (!c) return

    let alive = true
    ;(async () => {
      // @supabase/ssr's browser client defaults to the PKCE flow, so the
      // recovery link lands here with a `?code=...` query param that has to
      // be exchanged explicitly — it is NOT picked up automatically the way
      // the older implicit (#access_token=...) flow was.
      const code = new URL(window.location.href).searchParams.get('code')
      if (code) {
        const { error: exchangeError } = await c.auth.exchangeCodeForSession(code)
        if (alive && !exchangeError) {
          setReady(true)
          return
        }
      }
      const { data } = await c.auth.getSession()
      if (alive) setReady(!!data.session)
    })()

    const { data: sub } = c.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true)
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    const c = supabaseBrowser()
    if (!c) return
    setBusy(true)
    const { error: err } = await c.auth.updateUser({ password })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    setDone(true)
    setTimeout(() => router.replace('/'), 1200)
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
      <div
        style={{
          width: 'min(380px, 100%)',
          background: '#121722',
          border: '1px solid #262c38',
          borderRadius: 16,
          padding: 28,
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Set a new password</h1>

        {!ready && !done && (
          <p style={{ color: '#8a92a3', fontSize: 13 }}>
            Waiting on the reset link… if this doesn't clear in a few seconds, the link may have expired — request a
            new one from the login page.
          </p>
        )}

        {ready && !done && (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#b7bdc9' }}>
              New password
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#b7bdc9' }}>
              Confirm password
              <input
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                style={inputStyle}
              />
            </label>
            {error && <div style={{ color: '#ff8080', fontSize: 13 }}>{error}</div>}
            <button
              type="submit"
              disabled={busy}
              style={{
                marginTop: 4,
                padding: '11px 16px',
                borderRadius: 10,
                border: 'none',
                background: busy ? '#3a4152' : '#fff',
                color: busy ? '#9aa1af' : '#0A0D14',
                fontWeight: 600,
                cursor: busy ? 'default' : 'pointer',
              }}
            >
              {busy ? 'Saving…' : 'Set new password'}
            </button>
          </form>
        )}

        {done && <p style={{ color: '#7fd88f', fontSize: 14 }}>Password updated. Taking you back to your board…</p>}
      </div>
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
