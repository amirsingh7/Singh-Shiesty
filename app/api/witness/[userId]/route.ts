import { timingSafeEqual } from 'node:crypto'
import { supabaseAdmin } from '@/lib/auth/supabaseAdmin'
import type { Profile } from '@/lib/tiles/profile'
import { allLifts, recordExists, type TrainSplit } from '@/lib/tiles/profileDerive'
import type { CompetitionRecord } from '@/lib/tiles/competitions'
import { sanitizeWitnessInput, type WitnessRecord } from '@/lib/tiles/witnesses'

/**
 * "I witnessed this lift" — the one write path in the app a stranger can
 * hit with no session at all, mirroring how anyone can already READ a
 * public/token-shared profile at app/p/[userId]/page.tsx. Gated the same
 * way that page is: 'public' visibility, or the exact shareToken as `t` in
 * the body. Wrong/missing token and a nonexistent user both 404, same
 * no-oracle rule as the read side.
 *
 * Beyond visibility, the attested lift/date/weight/reps must match a real
 * entry already on file (Train history or an imported competition result) —
 * checked server-side via recordExists() — so this can't be used to invent
 * a PR that was never logged, only to vouch for one that was. Uses the
 * service-role client throughout, same as the public page, since a visitor
 * by definition has no auth.uid() for RLS to match.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function tokenMatches(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return undefined
}

export async function POST(req: Request, { params }: { params: { userId: string } }): Promise<Response> {
  const { userId } = params
  const admin = supabaseAdmin()
  if (!admin) {
    return Response.json({ error: 'Witnessing needs Supabase configured on this deployment.' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body must be JSON.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Body must be a JSON object.' }, { status: 400 })
  }
  const b = body as Record<string, unknown>

  const { data: rows } = await admin
    .from('tile_data')
    .select('tile_id, data')
    .eq('user_id', userId)
    .in('tile_id', ['profile', `${userId}:train`, 'competitions', 'witnesses'])

  const profileData = (rows ?? []).find((r: { tile_id: string }) => r.tile_id === 'profile')?.data as Profile | undefined
  if (!profileData || typeof profileData !== 'object') return Response.json({ error: 'not found' }, { status: 404 })

  const authorized = profileData.visibility === 'public' || tokenMatches(typeof b.token === 'string' ? b.token : undefined, profileData.shareToken)
  if (!authorized) return Response.json({ error: 'not found' }, { status: 404 })

  const liftId = typeof b.liftId === 'string' ? b.liftId : ''
  const date = typeof b.date === 'string' ? b.date : ''
  const weightKg = num(b.weightKg)
  const reps = num(b.reps)
  if (!liftId || !date || weightKg === undefined || reps === undefined) {
    return Response.json({ error: 'liftId, date, weightKg, and reps are all required.' }, { status: 400 })
  }

  const sanitized = sanitizeWitnessInput(b)
  if (!sanitized.ok) return Response.json({ error: sanitized.error }, { status: 400 })

  let split: TrainSplit | null = null
  const trainData = (rows ?? []).find((r: { tile_id: string }) => r.tile_id === `${userId}:train`)?.data as
    | Record<string, unknown>
    | undefined
  if (trainData) {
    const raw = trainData['vitality.logger.v4']
    if (typeof raw === 'string' && raw) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed && Array.isArray(parsed.days)) split = parsed
      } catch {
        /* no train data — recordExists will correctly find nothing to match */
      }
    }
  }
  const competitionsData = (rows ?? []).find((r: { tile_id: string }) => r.tile_id === 'competitions')?.data
  const competitions: CompetitionRecord[] = Array.isArray(competitionsData) ? (competitionsData as CompetitionRecord[]) : []

  if (!recordExists(allLifts(split), competitions, liftId, date, weightKg, reps)) {
    return Response.json({ error: "That record doesn't match anything on file for this athlete." }, { status: 400 })
  }

  const existingData = (rows ?? []).find((r: { tile_id: string }) => r.tile_id === 'witnesses')?.data
  const existing: WitnessRecord[] = Array.isArray(existingData) ? (existingData as WitnessRecord[]) : []

  const record: WitnessRecord = {
    id: crypto.randomUUID(),
    liftId,
    date,
    weightKg,
    reps,
    witnessName: sanitized.value.witnessName,
    relation: sanitized.value.relation,
    note: sanitized.value.note,
    createdAt: new Date().toISOString(),
  }
  const next = [...existing, record]

  const { error: writeErr } = await admin
    .from('tile_data')
    .upsert({ user_id: userId, tile_id: 'witnesses', data: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id,tile_id' })
  if (writeErr) return Response.json({ error: 'Could not save the attestation.' }, { status: 500 })

  return Response.json({ ok: true })
}
