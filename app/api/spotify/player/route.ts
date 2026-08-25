import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseServer } from '@/lib/auth/supabaseServer'
import {
  SPOTIFY_API,
  refreshSpotifyToken,
  spotifyErrorReason,
  afterSpotifyControl,
  clampInt,
  normalizeSpotifyStatus,
  type StoredSpotifyAuth,
} from '../shared'

/**
 * The single proxy every Spotify action goes through — the Symphony tile is a
 * sandboxed opaque-origin iframe with no network, so useTileHost.ts posts
 * every action here on the tile's behalf (same shape as the youtube/finance
 * proxies), never exposing tokens to the browser. This is the OWNER's
 * connection, stored in Supabase against their signed-in account — for the
 * public board's own visitor-side connection, see app/api/spotify/board/player.
 *
 * Body: { action: 'status'|'devices'|'play'|'pause'|'next'|'previous'
 *   |'volume'|'shuffle'|'repeat'|'transfer'|'disconnect', ...action-specific }
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TILE_ID = 'spotify_auth'

async function loadAuth(c: SupabaseClient, userId: string): Promise<StoredSpotifyAuth | null> {
  const { data, error } = await c
    .from('tile_data')
    .select('data')
    .eq('user_id', userId)
    .eq('tile_id', TILE_ID)
    .maybeSingle()
  if (error || !data?.data) return null
  const d = data.data as Partial<StoredSpotifyAuth>
  if (!d.accessToken || !d.refreshToken || !d.expiresAt) return null
  return d as StoredSpotifyAuth
}

async function saveAuth(c: SupabaseClient, userId: string, auth: StoredSpotifyAuth): Promise<void> {
  await c
    .from('tile_data')
    .upsert(
      { user_id: userId, tile_id: TILE_ID, data: auth, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,tile_id' },
    )
}

/** null = never connected. 'reauth_required' = refresh token itself is dead. */
async function ensureValidAuth(c: SupabaseClient, userId: string): Promise<StoredSpotifyAuth | null | 'reauth_required'> {
  const auth = await loadAuth(c, userId)
  if (!auth) return null
  if (Date.now() < auth.expiresAt - 30_000) return auth
  const refreshed = await refreshSpotifyToken(auth)
  if (refreshed) await saveAuth(c, userId, refreshed)
  return refreshed ?? 'reauth_required'
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

  const c = await supabaseServer()
  if (!c) return Response.json({ error: 'supabase_not_configured' }, { status: 503 })

  const {
    data: { user },
  } = await c.auth.getUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  if (action === 'disconnect') {
    await c.from('tile_data').delete().eq('user_id', user.id).eq('tile_id', TILE_ID)
    return Response.json({ connected: false })
  }

  const auth = await ensureValidAuth(c, user.id)
  if (auth === null) return Response.json({ connected: false })
  if (auth === 'reauth_required') return Response.json({ error: 'reauth_required' }, { status: 401 })

  const headers = { Authorization: `Bearer ${auth.accessToken}` }

  try {
    switch (action) {
      case 'status': {
        const r = await fetch(`${SPOTIFY_API}/me/player`, { headers })
        if (r.status === 204) return Response.json({ connected: true, idle: true })
        if (!r.ok) return Response.json({ error: await spotifyErrorReason(r) }, { status: r.status })
        return Response.json({ connected: true, idle: false, ...normalizeSpotifyStatus(await r.json()) })
      }
      case 'devices': {
        const r = await fetch(`${SPOTIFY_API}/me/player/devices`, { headers })
        if (!r.ok) return Response.json({ error: await spotifyErrorReason(r) }, { status: r.status })
        const j = await r.json()
        return Response.json({ devices: j.devices || [] })
      }
      case 'play':
        return afterSpotifyControl(await fetch(`${SPOTIFY_API}/me/player/play`, { method: 'PUT', headers }))
      case 'pause':
        return afterSpotifyControl(await fetch(`${SPOTIFY_API}/me/player/pause`, { method: 'PUT', headers }))
      case 'next':
        return afterSpotifyControl(await fetch(`${SPOTIFY_API}/me/player/next`, { method: 'POST', headers }))
      case 'previous':
        return afterSpotifyControl(await fetch(`${SPOTIFY_API}/me/player/previous`, { method: 'POST', headers }))
      case 'volume': {
        const pct = clampInt(body.volumePercent, 0, 100)
        if (pct == null) return Response.json({ error: 'bad_volume' }, { status: 400 })
        return afterSpotifyControl(await fetch(`${SPOTIFY_API}/me/player/volume?volume_percent=${pct}`, { method: 'PUT', headers }))
      }
      case 'shuffle': {
        const state = body.state ? 'true' : 'false'
        return afterSpotifyControl(await fetch(`${SPOTIFY_API}/me/player/shuffle?state=${state}`, { method: 'PUT', headers }))
      }
      case 'repeat': {
        const mode = body.state === 'track' || body.state === 'context' ? body.state : 'off'
        return afterSpotifyControl(await fetch(`${SPOTIFY_API}/me/player/repeat?state=${mode}`, { method: 'PUT', headers }))
      }
      case 'transfer': {
        const deviceId = typeof body.deviceId === 'string' ? body.deviceId : ''
        if (!deviceId) return Response.json({ error: 'no_device' }, { status: 400 })
        return afterSpotifyControl(
          await fetch(`${SPOTIFY_API}/me/player`, {
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
