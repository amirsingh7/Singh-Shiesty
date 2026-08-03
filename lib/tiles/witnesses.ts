/**
 * Witness attestations — someone who saw a specific PR happen (a training
 * partner, a spotter, anyone with the profile link) says so. This is the
 * "community-endorsed" half of the credibility model: honest by construction
 * — a witness's word, not certification, and the render side never claims
 * otherwise (see RECORD_STATUS_LABEL / the public page's footnote).
 *
 * Unlike evidence/competitions, witness records deliberately do NOT collapse
 * on a deterministic id — three different people can each witness the same
 * lift, and every one of them should be its own row (that's the point: a
 * count of independent witnesses is itself part of the signal). Every
 * witness record gets a random id.
 *
 * Written two ways:
 *   - the owner's own browser, same local+cloud pattern as competitions.ts/
 *     evidence.ts (used to load the list for display/moderation on their
 *     own /profile page — the owner never files a witness attestation this
 *     way, only reads and can remove one)
 *   - a stranger with the profile link, who has no session at all — that
 *     path goes through app/api/witness/[userId]/route.ts, which uses the
 *     service-role client (same as the public page's own reads) since RLS
 *     has no auth.uid() to match for a visitor.
 */

export interface WitnessRecord {
  /** Random — see file header for why these don't dedupe by content. */
  id: string
  liftId: string
  date: string
  weightKg: number
  reps: number
  witnessName: string
  relation?: string
  note?: string
  createdAt: string
}

export const WITNESS_NAME_MAX = 80
export const WITNESS_RELATION_MAX = 80
export const WITNESS_NOTE_MAX = 300

export function witnessKey(liftId: string, date: string, weightKg: number, reps: number): string {
  return [liftId, date, weightKg, reps].join('|')
}

const KEY = 'vitality:witnesses'

export function loadWitnessRecords(): WitnessRecord[] {
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

export function saveWitnessRecords(records: WitnessRecord[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(records))
  } catch {
    /* ignore */
  }
}

/** Owner-side moderation — drop one bad-faith or mistaken attestation,
 *  everything else untouched. */
export function removeWitnessRecord(existing: WitnessRecord[], id: string): WitnessRecord[] {
  return existing.filter((r) => r.id !== id)
}

export async function syncWitnessesToCloud(userId: string, records: WitnessRecord[]): Promise<void> {
  const { syncEnabled, syncSave } = await import('../sync')
  if (syncEnabled()) await syncSave(userId, 'witnesses', records, new Date().toISOString())
}

export async function loadWitnessesFromCloud(userId: string): Promise<WitnessRecord[] | null> {
  const { syncEnabled, syncLoad } = await import('../sync')
  if (!syncEnabled()) return null
  const remote = await syncLoad(userId, 'witnesses')
  return Array.isArray(remote) ? (remote as WitnessRecord[]) : null
}

export interface WitnessSubmission {
  witnessName: string
  relation?: string
  note?: string
}

/** Trims/caps a stranger's POST body before it's ever stored. Pure and
 *  synchronous on purpose — the API route validates the request shape here,
 *  then separately checks (against the owner's real data) that the PR being
 *  witnessed actually exists. */
export function sanitizeWitnessInput(body: Record<string, unknown>): { ok: true; value: WitnessSubmission } | { ok: false; error: string } {
  const name = typeof body.witnessName === 'string' ? body.witnessName.trim() : ''
  if (!name) return { ok: false, error: 'Your name is required to witness a record.' }
  if (name.length > WITNESS_NAME_MAX) return { ok: false, error: `Name must be under ${WITNESS_NAME_MAX} characters.` }
  const relationRaw = typeof body.relation === 'string' ? body.relation.trim() : ''
  const relation = relationRaw ? relationRaw.slice(0, WITNESS_RELATION_MAX) : undefined
  const noteRaw = typeof body.note === 'string' ? body.note.trim() : ''
  const note = noteRaw ? noteRaw.slice(0, WITNESS_NOTE_MAX) : undefined
  return { ok: true, value: { witnessName: name, relation, note } }
}
