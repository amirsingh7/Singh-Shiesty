/**
 * Pure helpers for turning Train's saved lift history into the Featured PRs /
 * Recent achievements a profile shows — shared between the owner's own
 * /profile page and the public, read-only /p/[userId] page so the two never
 * drift out of sync on what counts as a PR.
 */

import type { RecordStatus } from './profile'
import type { CompetitionRecord } from './competitions'

const LB = 0.45359237

export const RECORD_STATUS_LABEL: Record<RecordStatus, string> = {
  'self-reported': 'Self-Reported',
  'evidence-attached': 'Evidence Attached',
  'competition-result': 'Competition Result',
  'community-endorsed': 'Community Endorsed',
}

export interface HistoryEntry {
  w: number
  r: number
  date: string
  off?: boolean
  /** How this entry's credibility is presented. Absent means self-reported —
   *  every entry logged in Train today is typed in by hand, so that's the
   *  honest default until competition import / evidence upload / endorsement
   *  (later phases) start setting the others. */
  recordStatus?: RecordStatus
}
export interface Lift {
  id: string
  name: string
  tier?: number
  hidden?: boolean
  perHand?: boolean
  history?: HistoryEntry[]
}
export interface TrainSplit {
  days: { id: string; name: string; lifts: Lift[] }[]
}

export function allLifts(split: TrainSplit | null): Lift[] {
  if (!split) return []
  const seen = new Set<string>()
  const out: Lift[] = []
  for (const day of split.days || []) {
    for (const lift of day.lifts || []) {
      if (!seen.has(lift.id)) {
        seen.add(lift.id)
        out.push(lift)
      }
    }
  }
  return out
}

/** A lift's Train-logged history plus any competition records mapped to it,
 *  as one array a normal bestOf()/prMoments() can treat like any other
 *  history — competition entries carry their own weight/date and are always
 *  tagged 'competition-result', regardless of what Train separately has for
 *  the same lift. */
export function combinedHistory(lift: Lift, competitions: CompetitionRecord[]): HistoryEntry[] {
  const fromComps: HistoryEntry[] = competitions
    .filter((c) => c.liftId === lift.id)
    .map((c) => ({ w: c.weightKg, r: c.reps, date: c.date, recordStatus: 'competition-result' as RecordStatus }))
  return [...(lift.history || []), ...fromComps]
}

export function bestOf(history: HistoryEntry[]): HistoryEntry | null {
  let best: HistoryEntry | null = null
  for (const h of history) {
    if (h.off) continue
    if (!best || h.w > best.w || (h.w === best.w && h.r > best.r)) best = h
  }
  return best
}

/** Every entry that beat everything strictly before it — a deterministic,
 *  read-only reconstruction of "was this a PR when it was logged," with no
 *  new field written onto Train's data. */
export function prMoments(lift: Lift): { date: string; w: number; r: number; liftName: string }[] {
  const hist = (lift.history || [])
    .filter((h) => !h.off)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
  const out: { date: string; w: number; r: number; liftName: string }[] = []
  let bestW = -Infinity
  let bestR = -Infinity
  for (const h of hist) {
    if (h.w > bestW || (h.w === bestW && h.r > bestR)) {
      out.push({ date: h.date, w: h.w, r: h.r, liftName: lift.name })
      bestW = h.w
      bestR = h.r
    }
  }
  return out
}

export const wDisp = (kg: number, unit: 'kg' | 'lb') => (unit === 'lb' ? Math.round((kg / LB) * 2) / 2 : Math.round(kg * 100) / 100)

export const dateLabel = (k: string) => {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const initials = (name?: string) =>
  (name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '—'
