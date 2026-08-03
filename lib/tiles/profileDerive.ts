/**
 * Pure helpers for turning Train's saved lift history into the Featured PRs /
 * Recent achievements a profile shows — shared between the owner's own
 * /profile page and the public, read-only /p/[userId] page so the two never
 * drift out of sync on what counts as a PR.
 */

import type { RecordStatus } from './profile'
import type { CompetitionRecord } from './competitions'
import type { EvidenceRecord } from './evidence'
import { evidenceKey } from './evidence'
import type { WitnessRecord } from './witnesses'
import { witnessKey } from './witnesses'

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
  /** Set once combinedHistory finds a matching evidence upload — the storage
   *  path a signed URL can be generated from, never a public URL itself
   *  (the bucket is private; visibility/token enforcement already happened
   *  before this ever gets used, same as the rest of a profile's data). */
  evidencePath?: string
  /** How many witness attestations combinedHistory found for this entry —
   *  set alongside a 'community-endorsed' recordStatus so the UI can show
   *  "2 witnesses" rather than just the badge. */
  witnessCount?: number
  /** True when this entry jumped implausibly far past the lift's previous
   *  best — a nudge toward evidence/witnessing, never a block. See
   *  isOutlier(). Only computed by timelineEvents(); bestOf()/combinedHistory
   *  itself never sets this. */
  outlier?: boolean
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

/** How strongly each status backs a record — used only to decide which
 *  single badge wins when an entry could qualify for more than one (e.g. a
 *  self-reported lift that later picks up both a witness and evidence).
 *  Competition results are federation-verified, the strongest signal;
 *  evidence (a photo/video) is tangible but self-supplied; a witness is a
 *  peer's word, weaker than tangible proof but stronger than nothing. */
const STATUS_RANK: Record<RecordStatus, number> = {
  'self-reported': 0,
  'community-endorsed': 1,
  'evidence-attached': 2,
  'competition-result': 3,
}

/** A lift's Train-logged history plus any competition records mapped to it,
 *  as one array a normal bestOf()/prMoments() can treat like any other
 *  history — competition entries carry their own weight/date and are always
 *  tagged 'competition-result', regardless of what Train separately has for
 *  the same lift. A self-reported entry gets upgraded to the single
 *  strongest signal it has evidence for: 'evidence-attached' if a photo/video
 *  was uploaded for it, else 'community-endorsed' if at least one witness
 *  attested to it — see STATUS_RANK. A competition result never needs the
 *  upgrade, it already outranks both. */
export function combinedHistory(
  lift: Lift,
  competitions: CompetitionRecord[],
  evidence: EvidenceRecord[] = [],
  witnesses: WitnessRecord[] = [],
): HistoryEntry[] {
  const fromComps: HistoryEntry[] = competitions
    .filter((c) => c.liftId === lift.id)
    .map((c) => ({ w: c.weightKg, r: c.reps, date: c.date, recordStatus: 'competition-result' as RecordStatus }))
  const evidenceByKey = new Map(evidence.map((e) => [e.id, e]))
  const witnessCounts = new Map<string, number>()
  for (const w of witnesses) {
    const k = witnessKey(w.liftId, w.date, w.weightKg, w.reps)
    witnessCounts.set(k, (witnessCounts.get(k) ?? 0) + 1)
  }
  const fromTrain: HistoryEntry[] = (lift.history || []).map((h) => {
    const evMatch = evidenceByKey.get(evidenceKey(lift.id, h.date, h.w, h.r))
    const witnessCount = witnessCounts.get(witnessKey(lift.id, h.date, h.w, h.r)) ?? 0
    const candidates: HistoryEntry[] = [h]
    if (evMatch) candidates.push({ ...h, recordStatus: 'evidence-attached', evidencePath: evMatch.storagePath })
    if (witnessCount > 0) candidates.push({ ...h, recordStatus: 'community-endorsed', witnessCount })
    const strongest = candidates.reduce((best, cur) =>
      STATUS_RANK[cur.recordStatus ?? 'self-reported'] > STATUS_RANK[best.recordStatus ?? 'self-reported'] ? cur : best,
    )
    // Carry the witness count along even when evidence wins the badge, so the
    // UI can still say "also witnessed by 2 people" alongside the photo.
    return witnessCount > 0 ? { ...strongest, witnessCount } : strongest
  })
  return [...fromTrain, ...fromComps]
}

/** Whether a lift/date/weight/reps combination is a real entry on file
 *  (Train history or an imported competition result) — the check the
 *  witness API route runs before accepting a stranger's attestation, so
 *  someone can't invent a PR out of thin air and get it witnessed. Evidence
 *  and witnesses themselves are deliberately excluded from this check (they
 *  only ever attach to an entry that already exists, never create one). */
export function recordExists(
  lifts: Lift[],
  competitions: CompetitionRecord[],
  liftId: string,
  date: string,
  weightKg: number,
  reps: number,
): boolean {
  const compMatch = competitions.some((c) => c.liftId === liftId && c.date === date && c.weightKg === weightKg && c.reps === reps)
  if (compMatch) return true
  const lift = lifts.find((l) => l.id === liftId)
  if (!lift) return false
  return (lift.history || []).some((h) => !h.off && h.date === date && h.w === weightKg && h.r === reps)
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
export function prMoments(lift: Lift): { date: string; w: number; r: number; liftName: string; recordStatus?: RecordStatus }[] {
  const hist = (lift.history || [])
    .filter((h) => !h.off)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
  const out: { date: string; w: number; r: number; liftName: string; recordStatus?: RecordStatus }[] = []
  let bestW = -Infinity
  let bestR = -Infinity
  for (const h of hist) {
    if (h.w > bestW || (h.w === bestW && h.r > bestR)) {
      out.push({ date: h.date, w: h.w, r: h.r, liftName: lift.name, recordStatus: h.recordStatus })
      bestW = h.w
      bestR = h.r
    }
  }
  return out
}

/** A jump this far past the lift's previous best is flagged for the owner
 *  and any viewer as worth a second look — not blocked, not penalized, just
 *  surfaced (this app explicitly rules out guilt/gamification mechanics).
 *  25% is a deliberately generous threshold: real single-session PRs of
 *  10-15% happen; this is aimed at typos and implausible claims, not normal
 *  progress. Never flags a lift's very first entry — there's nothing to
 *  compare it to. */
export const OUTLIER_JUMP_RATIO = 0.25

export function isOutlier(priorBestW: number | null, w: number): boolean {
  if (priorBestW === null || priorBestW <= 0) return false
  return (w - priorBestW) / priorBestW > OUTLIER_JUMP_RATIO
}

export interface TimelineEvent {
  date: string
  liftId: string
  liftName: string
  w: number
  r: number
  recordStatus: RecordStatus
  witnessCount?: number
  /** Only ever true for a self-reported entry — evidence/competition/witness
   *  signals already give a viewer something firmer than the number alone,
   *  so the nudge would be redundant there. */
  outlier: boolean
}

/** The full cross-lift, credibility-tagged PR timeline — every entry that
 *  set a new best for its lift, across Train history, competition imports,
 *  evidence, and witnessing, newest first. Builds on prMoments() the same
 *  way the featured-PR cards build on bestOf(): feed it a lift whose
 *  `history` is already combinedHistory()'s output, so a competition/
 *  evidence/witness entry can itself be the moment that set the record. */
export function timelineEvents(
  lifts: Lift[],
  competitions: CompetitionRecord[],
  evidence: EvidenceRecord[] = [],
  witnesses: WitnessRecord[] = [],
): TimelineEvent[] {
  const out: TimelineEvent[] = []
  for (const lift of lifts) {
    const combined = combinedHistory(lift, competitions, evidence, witnesses)
    const hist = combined
      .filter((h) => !h.off)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
    let bestW = -Infinity
    let bestR = -Infinity
    let priorBestW: number | null = null
    for (const h of hist) {
      if (h.w > bestW || (h.w === bestW && h.r > bestR)) {
        const status = h.recordStatus ?? 'self-reported'
        out.push({
          date: h.date,
          liftId: lift.id,
          liftName: lift.name,
          w: h.w,
          r: h.r,
          recordStatus: status,
          witnessCount: h.witnessCount,
          outlier: status === 'self-reported' && isOutlier(priorBestW, h.w),
        })
        priorBestW = h.w
        bestW = h.w
        bestR = h.r
      }
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
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
