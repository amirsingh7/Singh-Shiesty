/**
 * The redirect_uri sent to Spotify's authorize call and the one sent in the
 * token exchange (callback/route.ts) must be byte-identical, or Spotify
 * rejects with "redirect_uri: Not matching configuration" — so both routes
 * import this one function rather than each deriving it themselves.
 *
 * SPOTIFY_REDIRECT_URI is an explicit override, needed because `next dev`
 * doesn't reliably reflect the actual host you're browsing on in a Route
 * Handler's request.url (observed: always reports localhost even when
 * visiting 127.0.0.1) — and Spotify's dashboard refuses to accept
 * `localhost` as a redirect URI at all (only the literal loopback IP
 * 127.0.0.1 passes its "insecure URI" check). Set it in .env.local for local
 * dev; leave it unset in production, where the deployed origin is reliable.
 */
export function spotifyRedirectUri(req: Request): string {
  const override = process.env.SPOTIFY_REDIRECT_URI
  if (override) return override
  return `${new URL(req.url).origin}/api/spotify/callback`
}

export function readSpotifyCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie') || ''
  const match = header.match(new RegExp('(?:^|; )' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[1]) : null
}

/** `; Secure` only over https — browsers silently refuse to store a Secure
 *  cookie on plain http, and local dev runs on http://127.0.0.1. */
export function secureCookieSuffix(req: Request): string {
  return req.url.startsWith('https://') ? '; Secure' : ''
}

export interface StoredSpotifyAuth {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

/** The public board's "try it yourself" Spotify connection: a visitor's own
 *  tokens, scoped to their browser via an HttpOnly cookie, never written to
 *  Supabase or tied to any Vitality account — unlike the owner's connection
 *  (spotify_auth in tile_data, keyed by their signed-in user id). Anyone can
 *  disconnect it or just let the cookie expire; nothing persists server-side. */
export const BOARD_SPOTIFY_COOKIE = 'spotify_board_auth'
export const BOARD_SPOTIFY_FLAG_COOKIE = 'spotify_board_flag'
export const SPOTIFY_RETURN_COOKIE = 'spotify_return'

/** Only ever a same-origin relative path (never `//host/...`, which browsers
 *  treat as protocol-relative to another host) made of ordinary URL
 *  characters — this value round-trips through a client-supplied query
 *  param and gets embedded directly into an HTML page (callback/route.ts),
 *  so it's validated before it's trusted as a redirect target OR rendered:
 *  no quotes/angle-brackets means no way to break out of the attribute or
 *  script context it's placed in. */
export function isSafeReturnPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && /^[A-Za-z0-9/_\-.~%?=&:,]+$/.test(path)
}

export function boardSpotifyAuthCookie(req: Request, auth: StoredSpotifyAuth | null): string {
  const secure = secureCookieSuffix(req)
  if (!auth) return `${BOARD_SPOTIFY_COOKIE}=; Path=/api/spotify/board; Max-Age=0${secure}`
  const value = encodeURIComponent(JSON.stringify(auth))
  return `${BOARD_SPOTIFY_COOKIE}=${value}; Path=/api/spotify/board; Max-Age=2592000; HttpOnly; SameSite=Lax${secure}`
}

export const SPOTIFY_API = 'https://api.spotify.com/v1'

/** Pure token refresh against Spotify's own endpoint — no storage. Both the
 *  owner's route (Supabase row) and the board's route (cookie) call this,
 *  then persist the result their own way. */
export async function refreshSpotifyToken(auth: StoredSpotifyAuth): Promise<StoredSpotifyAuth | null> {
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
  return {
    accessToken: j.access_token,
    // Spotify only rotates the refresh token sometimes — keep the old one otherwise.
    refreshToken: j.refresh_token || auth.refreshToken,
    expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000,
  }
}

export async function spotifyErrorReason(r: Response): Promise<string> {
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

export async function afterSpotifyControl(r: Response): Promise<Response> {
  if (r.ok || r.status === 204) return Response.json({ ok: true })
  return Response.json({ error: await spotifyErrorReason(r) }, { status: r.status })
}

/** Same outcome as afterSpotifyControl, as plain data instead of a Response —
 *  for callers (the board's cookie-based route) that need to attach their own
 *  Set-Cookie header to the response. */
export async function spotifyControlResult(r: Response): Promise<{ body: { ok: true } | { error: string }; status: number }> {
  if (r.ok || r.status === 204) return { body: { ok: true }, status: 200 }
  return { body: { error: await spotifyErrorReason(r) }, status: r.status }
}

export function clampInt(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n)) return null
  return Math.max(min, Math.min(max, Math.round(n)))
}

export function normalizeSpotifyStatus(j: Record<string, unknown>) {
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
