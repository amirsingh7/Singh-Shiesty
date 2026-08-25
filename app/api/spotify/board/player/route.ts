import {
  SPOTIFY_API,
  refreshSpotifyToken,
  spotifyErrorReason,
  spotifyControlResult,
  clampInt,
  normalizeSpotifyStatus,
  readSpotifyCookie,
  boardSpotifyAuthCookie,
  BOARD_SPOTIFY_COOKIE,
  type StoredSpotifyAuth,
} from '../../shared'

/**
 * The public board's own Spotify proxy — a visitor trying Symphony on their
 * own account, not the profile owner's. Auth lives only in the
 * spotify_board_auth cookie set by callback/route.ts's board branch, never in
 * Supabase, never tied to any Vitality account. Same action shape as the
 * owner's ../../player route, but every response that has a live token
 * re-sets the cookie (refreshed token if rotated, and to slide the 30-day
 * window forward).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function readBoardAuth(req: Request): StoredSpotifyAuth | null {
  const raw = readSpotifyCookie(req, BOARD_SPOTIFY_COOKIE)
  if (!raw) return null
  try {
    const d = JSON.parse(raw) as Partial<StoredSpotifyAuth>
    if (!d.accessToken || !d.refreshToken || !d.expiresAt) return null
    return d as StoredSpotifyAuth
  } catch {
    return null
  }
}

function jsonWithCookie(req: Request, body: unknown, auth: StoredSpotifyAuth | null, status = 200): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  headers.append('Set-Cookie', boardSpotifyAuthCookie(req, auth))
  return new Response(JSON.stringify(body), { status, headers })
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

  if (action === 'disconnect') {
    return jsonWithCookie(req, { connected: false }, null)
  }

  let auth = readBoardAuth(req)
  if (!auth) return Response.json({ connected: false })

  if (Date.now() >= auth.expiresAt - 30_000) {
    const refreshed = await refreshSpotifyToken(auth)
    if (!refreshed) return jsonWithCookie(req, { error: 'reauth_required' }, null, 401)
    auth = refreshed
  }

  const headers = { Authorization: `Bearer ${auth.accessToken}` }

  try {
    switch (action) {
      case 'status': {
        const r = await fetch(`${SPOTIFY_API}/me/player`, { headers })
        if (r.status === 204) return jsonWithCookie(req, { connected: true, idle: true }, auth)
        if (!r.ok) return jsonWithCookie(req, { error: await spotifyErrorReason(r) }, auth, r.status)
        return jsonWithCookie(req, { connected: true, idle: false, ...normalizeSpotifyStatus(await r.json()) }, auth)
      }
      case 'devices': {
        const r = await fetch(`${SPOTIFY_API}/me/player/devices`, { headers })
        if (!r.ok) return jsonWithCookie(req, { error: await spotifyErrorReason(r) }, auth, r.status)
        const j = await r.json()
        return jsonWithCookie(req, { devices: j.devices || [] }, auth)
      }
      case 'play': {
        const { body: b, status } = await spotifyControlResult(await fetch(`${SPOTIFY_API}/me/player/play`, { method: 'PUT', headers }))
        return jsonWithCookie(req, b, auth, status)
      }
      case 'pause': {
        const { body: b, status } = await spotifyControlResult(await fetch(`${SPOTIFY_API}/me/player/pause`, { method: 'PUT', headers }))
        return jsonWithCookie(req, b, auth, status)
      }
      case 'next': {
        const { body: b, status } = await spotifyControlResult(await fetch(`${SPOTIFY_API}/me/player/next`, { method: 'POST', headers }))
        return jsonWithCookie(req, b, auth, status)
      }
      case 'previous': {
        const { body: b, status } = await spotifyControlResult(await fetch(`${SPOTIFY_API}/me/player/previous`, { method: 'POST', headers }))
        return jsonWithCookie(req, b, auth, status)
      }
      case 'volume': {
        const pct = clampInt(body.volumePercent, 0, 100)
        if (pct == null) return jsonWithCookie(req, { error: 'bad_volume' }, auth, 400)
        const { body: b, status } = await spotifyControlResult(
          await fetch(`${SPOTIFY_API}/me/player/volume?volume_percent=${pct}`, { method: 'PUT', headers }),
        )
        return jsonWithCookie(req, b, auth, status)
      }
      case 'shuffle': {
        const state = body.state ? 'true' : 'false'
        const { body: b, status } = await spotifyControlResult(
          await fetch(`${SPOTIFY_API}/me/player/shuffle?state=${state}`, { method: 'PUT', headers }),
        )
        return jsonWithCookie(req, b, auth, status)
      }
      case 'repeat': {
        const mode = body.state === 'track' || body.state === 'context' ? body.state : 'off'
        const { body: b, status } = await spotifyControlResult(
          await fetch(`${SPOTIFY_API}/me/player/repeat?state=${mode}`, { method: 'PUT', headers }),
        )
        return jsonWithCookie(req, b, auth, status)
      }
      case 'transfer': {
        const deviceId = typeof body.deviceId === 'string' ? body.deviceId : ''
        if (!deviceId) return jsonWithCookie(req, { error: 'no_device' }, auth, 400)
        const { body: b, status } = await spotifyControlResult(
          await fetch(`${SPOTIFY_API}/me/player`, {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_ids: [deviceId], play: true }),
          }),
        )
        return jsonWithCookie(req, b, auth, status)
      }
      default:
        return jsonWithCookie(req, { error: 'unknown_action' }, auth, 400)
    }
  } catch {
    return jsonWithCookie(req, { error: 'spotify_unreachable' }, auth, 502)
  }
}
