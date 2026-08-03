'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from '../../profile/profile.module.css'

function c(name: keyof typeof styles): string {
  return styles[name]
}

/**
 * "I witnessed this" — the one form a visitor to a public/shared profile can
 * submit with no account at all. Posts to app/api/witness/[userId]/route.ts,
 * which re-checks visibility/token server-side (this component doesn't
 * enforce anything, it just carries the same `t` the page itself was loaded
 * with) and rejects any lift/date/weight/reps that isn't a real entry on
 * file. On success, router.refresh() re-runs the server component so the
 * new witness count shows up without a full reload.
 */
export default function WitnessForm({
  userId,
  token,
  liftId,
  date,
  weightKg,
  reps,
}: {
  userId: string
  token?: string
  liftId: string
  date: string
  weightKg: number
  reps: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [relation, setRelation] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (done) return <p className={c('hint')}>Thanks for witnessing this — it now shows on the record.</p>

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
        I witnessed this
      </button>
    )
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/witness/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liftId, date, weightKg, reps, witnessName: name, relation, note, token }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error || 'Could not submit — try again.')
        setBusy(false)
        return
      }
      setDone(true)
      router.refresh()
    } catch {
      setError('Could not submit — check your connection and try again.')
      setBusy(false)
    }
  }

  return (
    <div className={c('witnessForm')}>
      {error && <p className={c('evidenceError')}>{error}</p>}
      <input
        className="input"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
      />
      <input
        className="input"
        placeholder="How do you know them? (optional)"
        value={relation}
        onChange={(e) => setRelation(e.target.value)}
        maxLength={80}
      />
      <textarea
        className="input"
        placeholder="Anything you'd add? (optional)"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={300}
      />
      <div className={c('editActions')}>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || !name.trim()}>
          {busy ? 'Submitting…' : 'Submit'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  )
}
