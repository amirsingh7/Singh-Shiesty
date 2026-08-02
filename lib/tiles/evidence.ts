/**
 * Evidence — a photo or video attached to one specific PR (a lift + the
 * date/weight/reps of the entry it backs), stored in Supabase Storage
 * (bucket 'evidence', see supabase/evidence_storage.sql) under
 * `${userId}/...`, never in tile_data itself — JSONB is the wrong place for
 * megabytes of binary. Only a small metadata record (which PR, which storage
 * path, when) lives in tile_data, same bare-key pattern as profile.ts and
 * competitions.ts.
 *
 * Upload/delete happen from the browser with the owner's own session — the
 * RLS policies staged in evidence_storage.sql restrict every user to their
 * own folder, so this never needs a server route the way the public
 * /p/[userId] read path does (that one goes through supabaseAdmin() instead,
 * deliberately bypassing RLS the same way it already does for tile_data).
 */

import { supabaseBrowser } from '../auth/supabaseBrowser'

export interface EvidenceRecord {
  /** Deterministic from the PR it backs — re-attaching for the same lift/
   *  date/weight/reps replaces rather than duplicates. */
  id: string
  liftId: string
  date: string
  weightKg: number
  reps: number
  storagePath: string
  mimeType: string
  uploadedAt: string
}

export const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024

export function evidenceKey(liftId: string, date: string, weightKg: number, reps: number): string {
  return [liftId, date, weightKg, reps].join('|')
}

function isAcceptedType(mimeType: string): boolean {
  return mimeType.startsWith('image/') || mimeType.startsWith('video/')
}

const KEY = 'vitality:evidence'

export function loadEvidenceRecords(): EvidenceRecord[] {
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

export function saveEvidenceRecords(records: EvidenceRecord[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(records))
  } catch {
    /* ignore */
  }
}

export async function syncEvidenceToCloud(userId: string, records: EvidenceRecord[]): Promise<void> {
  const { syncEnabled, syncSave } = await import('../sync')
  if (syncEnabled()) await syncSave(userId, 'evidence', records, new Date().toISOString())
}

export async function loadEvidenceFromCloud(userId: string): Promise<EvidenceRecord[] | null> {
  const { syncEnabled, syncLoad } = await import('../sync')
  if (!syncEnabled()) return null
  const remote = await syncLoad(userId, 'evidence')
  return Array.isArray(remote) ? (remote as EvidenceRecord[]) : null
}

export interface UploadEvidenceResult {
  ok: boolean
  record?: EvidenceRecord
  error?: string
}

/** Uploads a file to the owner's own Storage folder and returns the metadata
 *  record to save. Does NOT touch the tile_data store itself — callers merge
 *  the returned record in and persist it (same shape as competitions.ts's
 *  import flow), so this function has exactly one job. */
export async function uploadEvidence(
  userId: string,
  liftId: string,
  date: string,
  weightKg: number,
  reps: number,
  file: File,
): Promise<UploadEvidenceResult> {
  if (!isAcceptedType(file.type)) return { ok: false, error: 'Only photos or videos are accepted.' }
  if (file.size > MAX_EVIDENCE_BYTES) return { ok: false, error: 'File is over the 25MB limit.' }

  const c = supabaseBrowser()
  if (!c) return { ok: false, error: 'Cloud storage isn’t configured — evidence needs Supabase set up first.' }

  const ext = file.name.includes('.') ? file.name.split('.').pop() : file.type.split('/')[1] || 'bin'
  const path = `${userId}/${crypto.randomUUID()}.${ext}`
  const { error } = await c.storage.from('evidence').upload(path, file, { contentType: file.type })
  if (error) return { ok: false, error: error.message }

  return {
    ok: true,
    record: {
      id: evidenceKey(liftId, date, weightKg, reps),
      liftId,
      date,
      weightKg,
      reps,
      storagePath: path,
      mimeType: file.type,
      uploadedAt: new Date().toISOString(),
    },
  }
}

/** Best-effort — removing the old file when evidence is replaced or cleared
 *  should never block updating the metadata record itself. */
export async function deleteEvidenceFile(storagePath: string): Promise<void> {
  const c = supabaseBrowser()
  if (!c) return
  try {
    await c.storage.from('evidence').remove([storagePath])
  } catch {
    /* ignore */
  }
}

export function mergeEvidenceRecords(existing: EvidenceRecord[], incoming: EvidenceRecord): EvidenceRecord[] {
  return [...existing.filter((r) => r.id !== incoming.id), incoming]
}

export async function signedEvidenceUrl(storagePath: string): Promise<string | null> {
  const c = supabaseBrowser()
  if (!c) return null
  const { data, error } = await c.storage.from('evidence').createSignedUrl(storagePath, 3600)
  return error ? null : data.signedUrl
}
