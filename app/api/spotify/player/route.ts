import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The single proxy every Spotify action goes through — the Symphony tile is a
 * sandboxed opaque-origin iframe with no network, so useTileHost.ts posts
 * every action here on the tile's behalf (same shape as the youtube/finance
 * proxies), never exposing tokens to the browser.
 *
 * Body: { action: 'status'|'devices'|'play'|'pause'|'next'|'previous'
 *   |'volume'|'shuffle'|'repeat'|'transfer'|'disconnect', ...action-specific }
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TILE_ID = 'spotify_auth'
const API = 'https://api.spotify.com/v1'

interface StoredAuth {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  try {
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  } catch {
    return null
  }
}

async function loadAuth(c: SupabaseClient): Promise<StoredAuth | null> {
  const { data, error } = await c.from('tile_data').select('data').eq('tile_id', TILE_ID).maybeSingle()
  if (error || !data?.data) return null
  const d = data.data as Partial<StoredAuth>
  if (!d.accessToken || !d.refreshToken || !d.expiresAt) return null
  return d as StoredAuth
}

async function saveAuth(c: SupabaseClient, auth: StoredAuth): Promise<void> {
  await c
    .from('tile_data')
    .upsert({ tile_id: TILE_ID, data: auth, updated_at: new Date().toISOString() }, { onConflict: 'tile_id' })
}

async function refreshAuth(c: SupabaseClient, auth: StoredAuth): Promise<StoredAuth | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  let res: Response
  try {
    res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: auth.refreshToken }),
    })
  } catch {
    return null
  }
  if (!res.ok) return null
  const j = await res.json().catch(() => null)
  if (!j?.access_token) return null
  const next: StoredAuth = {
    accessToken: j.access_token,
    // Spotify only rotates the refresh token sometimes — keep the old one otherwise.
    refreshToken: j.refresh_token || auth.refreshToken,
    expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000,
  }
  await saveAuth(c, next)
  return next
}

/** null = never connected. 'reauth_required' = refresh token itself is dead. */
async function ensureValidAuth(c: SupabaseClient): Promise<StoredAuth | null | 'reauth_required'> {
  const auth = await loadAuth(c)
  if (!auth) return null
  if (Date.now() < auth.expiresAt - 30_000) return auth
  const refreshed = await refreshAuth(c, auth)
  return refreshed ?? 'reauth_required'
}

async function spotifyErrorReason(r: Response): Promise<string> {
  if (r.status === 401) return 'reauth_required'
  if (r.status === 404) return 'no_active_device'
  try {
    const j = await r.json()
    const reason = j?.error?.reason
    if (reason === 'NO_ACTIVE_DEVICE') return 'no_active_device'
    if (reason === 'PREMIUM_REQUIRED' || r.status === 403) return 'premium_required'
    return typeof j?.error?.message === 'string' ? j.error.message : 'spotify_error'
  } catch {
    return r.status === 403 ? 'premium_required' : 'spotify_error'
  }
}

async function afterControl(r: Response): Promise<Response> {
  if (r.ok || r.status === 204) return Response.json({ ok: true })
  return Response.json({ error: await spotifyErrorReason(r) }, { status: r.status })
}

function clampInt(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n)) return null
  return Math.max(min, Math.min(max, Math.round(n)))
}

function normalizeStatus(j: Record<string, unknown>) {
  const item = j.item as Record<string, unknown> | null
  const device = j.device as Record<string, unknown> | null
  const album = (item?.album as Record<string, unknown> | undefined) || null
  const images = (album?.images as Array<Record<string, unknown>> | undefined) || []
  const artists = (item?.artists as Array<Record<string, unknown>> | undefined) || []
  return {
    isPlaying: !!j.is_playing,
    shuffle: !!j.shuffle_state,
    repeat: typeof j.repeat_state === 'string' ? j.repeat_state : 'off',
    progressMs: typeof j.progress_ms === 'number' ? j.progress_ms : 0,
    device: device ? { id: device.id, name: device.name, volumePercent: device.volume_percent } : null,
    track: item
      ? {
          name: item.name,
          artists: artists.map((a) => a.name).join(', '),
          durationMs: item.duration_ms,
          albumArt: (images[0]?.url as string | undefined) || null,
        }
      : null,
  }
}

export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'bad_body' }, { status: 400 })
  }
  const action = typeof body.action === 'string' ? body.action : ''
  if (!action) return Response.json({ error: 'no_action' }, { status: 400 })

  const c = db()
  if (!c) return Response.json({ error: 'supabase_not_configured' }, { status: 503 })

  if (action === 'disconnect') {
    await c.from('tile_data').delete().eq('tile_id', TILE_ID)
    return Response.json({ connected: false })
  }

  const auth = await ensureValidAuth(c)
  if (auth === null) return Response.json({ connected: false })
  if (auth === 'reauth_required') return Response.json({ error: 'reauth_required' }, { status: 401 })

  const headers = { Authorization: `Bearer ${auth.accessToken}` }

  try {
    switch (action) {
      case 'status': {
        const r = await fetch(`${API}/me/player`, { headers })
        if (r.status === 204) return Response.json({ connected: true, idle: true })
        if (!r.ok) return Response.json({ error: await spotifyErrorReason(r) }, { status: r.status })
        return Response.json({ connected: true, idle: false, ...normalizeStatus(await r.json()) })
      }
      case 'devices': {
        const r = await fetch(`${API}/me/player/devices`, { headers })
        if (!r.ok) return Response.json({ error: await spotifyErrorReason(r) }, { status: r.status })
        const j = await r.json()
        return Response.json({ devices: j.devices || [] })
      }
      case 'play':
        return afterControl(await fetch(`${API}/me/player/play`, { method: 'PUT', headers }))
      case 'pause':
        return afterControl(await fetch(`${API}/me/player/pause`, { method: 'PUT', headers }))
      case 'next':
        return afterControl(await fetch(`${API}/me/player/next`, { method: 'POST', headers }))
      case 'previous':
        return afterControl(await fetch(`${API}/me/player/previous`, { method: 'POST', headers }))
      case 'volume': {
        const pct = clampInt(body.volumePercent, 0, 100)
        if (pct == null) return Response.json({ error: 'bad_volume' }, { status: 400 })
        return afterControl(await fetch(`${API}/me/player/volume?volume_percent=${pct}`, { method: 'PUT', headers }))
      }
      case 'shuffle': {
        const state = body.state ? 'true' : 'false'
        return afterControl(await fetch(`${API}/me/player/shuffle?state=${state}`, { method: 'PUT', headers }))
      }
      case 'repeat': {
        const mode = body.state === 'track' || body.state === 'context' ? body.state : 'off'
        return afterControl(await fetch(`${API}/me/player/repeat?state=${mode}`, { method: 'PUT', headers }))
      }
      case 'transfer': {
        const deviceId = typeof body.deviceId === 'string' ? body.deviceId : ''
        if (!deviceId) return Response.json({ error: 'no_device' }, { status: 400 })
        return afterControl(
          await fetch(`${API}/me/player`, {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_ids: [deviceId], play: true }),
          }),
        )
      }
      default:
        return Response.json({ error: 'unknown_action' }, { status: 400 })
    }
  } catch {
    return Response.json({ error: 'spotify_unreachable' }, { status: 502 })
  }
}
