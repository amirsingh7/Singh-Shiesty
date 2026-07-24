import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'

/**
 * Vitals ingest — a plain REST endpoint (no MCP/JSON-RPC) so an iOS Shortcut's
 * "Get Contents of URL" action can POST straight to it after a workout ends.
 *
 * Auth: Authorization: Bearer <VITALS_INGEST_TOKEN>. Separate secret from
 * MCP_TOKEN — this endpoint does exactly one thing (merge today's workout
 * numbers into the vitals store) and nothing else, so it gets its own key
 * rather than reusing the connector's broader one. Unset = disabled (503),
 * same pattern as the MCP connector.
 *
 * Body: { date?: 'YYYY-MM-DD', activeCalories?, workoutMinutes?, avgHeartRate? }
 * date defaults to today. Merges into store['<date>'] alongside whatever
 * vitals.html already saved there (sleepHours/feel/whoopRecovery) — never
 * replaces the whole day, only fills the fields sent.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const USER_ID = 'me'
const SLOT = 'vitals'
const dataKey = `${USER_ID}:${SLOT}`

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function bearerToken(req: Request): string | null {
  const h = req.headers.get('authorization')
  if (!h) return null
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return undefined
}

export async function POST(req: Request): Promise<Response> {
  const expected = process.env.VITALS_INGEST_TOKEN
  if (!expected) {
    return Response.json(
      { error: 'Vitals ingest is not configured. Set VITALS_INGEST_TOKEN.' },
      { status: 503 },
    )
  }

  const provided = bearerToken(req)
  if (!provided || !constantTimeEquals(provided, expected)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
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

  const date = typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : todayKey()
  const activeCalories = num(b.activeCalories)
  const workoutMinutes = num(b.workoutMinutes)
  const avgHeartRate = num(b.avgHeartRate)
  if (activeCalories === undefined && workoutMinutes === undefined && avgHeartRate === undefined) {
    return Response.json(
      { error: 'Send at least one of: activeCalories, workoutMinutes, avgHeartRate.' },
      { status: 400 },
    )
  }

  const c = db()
  if (!c) {
    return Response.json(
      { error: 'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY, then run supabase/sync.sql.' },
      { status: 503 },
    )
  }

  const { data: rows, error: readErr } = await c
    .from('tile_data')
    .select('tile_id, data')
    .in('tile_id', [SLOT, dataKey])
  if (readErr) {
    return Response.json({ error: 'Could not read tile_data. Did you run supabase/sync.sql?' }, { status: 500 })
  }
  const bareRow = (rows ?? []).find((r: { tile_id: string }) => r.tile_id === SLOT)
  const scopedRow = (rows ?? []).find((r: { tile_id: string }) => r.tile_id === dataKey)
  const existing = (bareRow ?? scopedRow)?.data
  const store: Record<string, unknown> =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {}

  const prevDay = store[date]
  const day: Record<string, unknown> =
    prevDay && typeof prevDay === 'object' && !Array.isArray(prevDay) ? { ...(prevDay as Record<string, unknown>) } : {}
  if (activeCalories !== undefined) day.activeCalories = activeCalories
  if (workoutMinutes !== undefined) day.workoutMinutes = workoutMinutes
  if (avgHeartRate !== undefined) day.avgHeartRate = avgHeartRate
  store[date] = day

  const stamp = new Date().toISOString()
  const { error: writeErr } = await c.from('tile_data').upsert(
    [
      { tile_id: SLOT, data: store, updated_at: stamp },
      { tile_id: dataKey, data: store, updated_at: stamp },
    ],
    { onConflict: 'tile_id' },
  )
  if (writeErr) {
    return Response.json({ error: 'Could not save. Did you run supabase/sync.sql?' }, { status: 500 })
  }

  return Response.json({ ok: true, date, saved: day })
}
