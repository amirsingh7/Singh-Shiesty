import {
  spotifyRedirectUri,
  readSpotifyCookie,
  boardSpotifyAuthCookie,
  BOARD_SPOTIFY_FLAG_COOKIE,
} from '../shared'
import { supabaseServer } from '@/lib/auth/supabaseServer'

/**
 * Step 2 of Spotify's Authorization Code flow — this is where the OAuth
 * popup (opened by useTileHost.ts) lands after the user approves on
 * Spotify's site. Exchanges the code for tokens, stores them, then closes
 * itself. The popup closing is what the host is watching for (see the
 * 'connect' handler in useTileHost.ts) — that's what tells Symphony to
 * re-check its connection status, no postMessage needed from in here.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TILE_ID = 'spotify_auth'

function pageHtml(message: string): string {
  return `<!doctype html><html><body style="background:#0A0D14;color:#f5ede2;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px">
<div><p>${message}</p><p style="opacity:.6;font-size:13px">You can close this window.</p></div>
<script>try{window.close()}catch(e){}</script>
</body></html>`
}

function closePage(message: string): Response {
  return new Response(pageHtml(message), { status: 200, headers: { 'Content-Type': 'text/html' } })
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const expectedState = readSpotifyCookie(req, 'spotify_state')
  const isBoard = readSpotifyCookie(req, BOARD_SPOTIFY_FLAG_COOKIE) === '1'

  if (error) return closePage(`Spotify connection cancelled (${error}).`)
  if (!code || !state || !expectedState || state !== expectedState) {
    return closePage('Spotify connection failed — the request expired or was tampered with. Try connecting again.')
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return closePage('Spotify is not configured on this server.')
  }

  const redirectUri = spotifyRedirectUri(req)
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  let tokenJson: { access_token?: string; refresh_token?: string; expires_in?: number }
  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    })
    tokenJson = await tokenRes.json()
    if (!tokenRes.ok || !tokenJson.access_token || !tokenJson.refresh_token) {
      return closePage('Spotify rejected the connection. Try again.')
    }
  } catch {
    return closePage('Could not reach Spotify. Try again.')
  }

  const expiresAt = Date.now() + (tokenJson.expires_in ?? 3600) * 1000
  const auth = { accessToken: tokenJson.access_token, refreshToken: tokenJson.refresh_token, expiresAt }

  // Board flow: a visitor trying Spotify with their OWN account from the
  // public board — never touches Supabase or any Vitality account, just a
  // cookie scoped to their browser (see shared.ts).
  if (isBoard) {
    const headers = new Headers({ 'Content-Type': 'text/html' })
    headers.append('Set-Cookie', 'spotify_state=; Path=/api/spotify; Max-Age=0')
    headers.append('Set-Cookie', `${BOARD_SPOTIFY_FLAG_COOKIE}=; Path=/api/spotify; Max-Age=0`)
    headers.append('Set-Cookie', boardSpotifyAuthCookie(req, auth))
    return new Response(pageHtml('Spotify connected.'), { status: 200, headers })
  }

  const c = await supabaseServer()
  if (!c) return closePage('Supabase is not configured — cannot save the connection.')

  const {
    data: { user },
  } = await c.auth.getUser()
  if (!user) return closePage('You need to be signed in to connect Spotify. Sign in, then try again.')

  const { error: writeErr } = await c.from('tile_data').upsert(
    { user_id: user.id, tile_id: TILE_ID, data: auth, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,tile_id' },
  )
  if (writeErr) return closePage('Connected, but saving failed. Try again.')

  const headers = new Headers({ 'Content-Type': 'text/html' })
  headers.append('Set-Cookie', 'spotify_state=; Path=/api/spotify; Max-Age=0')
  return new Response(pageHtml('Spotify connected.'), { status: 200, headers })
}
