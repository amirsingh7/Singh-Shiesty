/**
 * Competition results — imported from a CSV (an OpenPowerlifting per-lifter
 * export, or a generic lift/weight/date sheet), never typed in freehand.
 * Kept in their own store, separate from Train's `vitality.logger.v4`, on
 * purpose: Train's own save path (public/tiles/train.html) rebuilds each
 * lift's `history` array from scratch as `{w, r, date, sets, off}` whenever
 * that lift's chart is edited, which would silently drop any extra field
 * (recordStatus, meetName, federation…) tacked onto an entry living inside
 * it. Living apart, competition records survive every future Train edit.
 *
 * A record starts unmapped (`liftId` unset) until the owner points it at one
 * of their own Train lifts during import review — Train lift ids are
 * whatever the owner named them, never a fixed 'squat'/'bench'/'deadlift',
 * so there's no id to guess correctly without asking.
 *
 * Same two-write-path pattern as profile.ts: this file (local via
 * localStorage) + an explicit cloud mirror the caller opts into.
 */

export interface CompetitionRecord {
  /** Deterministic from its own fields — importing the same CSV twice
   *  merges instead of duplicating. */
  id: string
  /** A Train lift's id, once the owner has mapped this record to one.
   *  Unmapped records don't show up in Featured PRs (nothing to attach to)
   *  but stay in the store so mapping them later is just a re-import away. */
  liftId?: string
  /** The category as the import saw it ('Squat', 'Bench', a CSV column
   *  value…) — kept even after mapping, for the review UI and debugging. */
  liftLabel: string
  weightKg: number
  reps: number
  date: string
  meetName?: string
  federation?: string
  place?: string
  source: 'openpowerlifting' | 'csv'
  importedAt: string
}

const KEY = 'vitality:competitions'

export function loadCompetitionRecords(): CompetitionRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCompetitionRecords(records: CompetitionRecord[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(records))
  } catch {
    /* ignore */
  }
}

/** Adds new records, replaces any that share an id (a re-import with a
 *  corrected mapping), leaves everything else untouched. Never drops a
 *  record the owner already has. */
export function mergeCompetitionRecords(
  existing: CompetitionRecord[],
  incoming: CompetitionRecord[],
): CompetitionRecord[] {
  const byId = new Map(existing.map((r) => [r.id, r]))
  for (const r of incoming) byId.set(r.id, r)
  return Array.from(byId.values())
}

export async function syncCompetitionsToCloud(userId: string, records: CompetitionRecord[]): Promise<void> {
  const { syncEnabled, syncSave } = await import('../sync')
  if (syncEnabled()) await syncSave(userId, 'competitions', records, new Date().toISOString())
}

export async function loadCompetitionsFromCloud(userId: string): Promise<CompetitionRecord[] | null> {
  const { syncEnabled, syncLoad } = await import('../sync')
  if (!syncEnabled()) return null
  const remote = await syncLoad(userId, 'competitions')
  return Array.isArray(remote) ? (remote as CompetitionRecord[]) : null
}
