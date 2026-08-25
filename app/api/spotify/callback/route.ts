import {
  spotifyRedirectUri,
  readSpotifyCookie,
  boardSpotifyAuthCookie,
  isSafeReturnPath,
  BOARD_SPOTIFY_FLAG_COOKIE,
  SPOTIFY_RETURN_COOKIE,
} from '../shared'
import { supabaseServer } from '@/lib/auth/supabaseServer'

/**
 * Step 2 of Spotify's Authorization Code flow — this is where the OAuth
 * popup (opened by useTileHost.ts, or BoardView.tsx for a public-board
 * visitor) lands after the user approves on Spotify's site. Exchanges the
 * code for tokens, stores them, then tries to close itself. The popup
 * closing is what the host is watching for (see 'connect' in
 * useTileHost.ts/BoardView.tsx) — but mobile browsers routinely open
 * window.open() as a real tab, not a closable popup, and block script
 * window.close() on it. When close() doesn't take within a beat, this page
 * falls back to redirecting the SAME tab back to wherever it was opened
 * from (?return= on the authorize call, round-tripped via a cookie) — the
 * board/dashboard picks up the new connection on that page's own next
 * status check, no cross-tab signal required.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TILE_ID = 'spotify_auth'

function pageHtml(message: string, returnPath: string | null): string {
  const redirect = returnPath
    ? `<script>setTimeout(function(){ location.href = ${JSON.stringify(returnPath)}; }, 900);</script>`
    : ''
  const linkBack = returnPath
    ? `<p style="margin-top:10px"><a href="${returnPath}" style="color:#f5ede2">Return to the board</a></p>`
    : ''
  return `<!doctype html><html><head><title>Spotify</title></head><body style="background:#0A0D14;color:#f5ede2;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px">
<div><p>${message}</p><p style="opacity:.6;font-size:13px">You can close this window.</p>${linkBack}</div>
<script>try{window.close()}catch(e){}</script>
${redirect}
</body></html>`
}

function closePage(message: string, returnPath: string | null = null): Response {
  return new Response(pageHtml(message, returnPath), { status: 200, headers: { 'Content-Type': 'text/html' } })
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const expectedState = readSpotifyCookie(req, 'spotify_state')
  const isBoard = readSpotifyCookie(req, BOARD_SPOTIFY_FLAG_COOKIE) === '1'
  const rawReturn = readSpotifyCookie(req, SPOTIFY_RETURN_COOKIE)
  const returnPath = rawReturn && isSafeReturnPath(rawReturn) ? rawReturn : null

  if (error) return closePage(`Spotify connection cancelled (${error}).`, returnPath)
  if (!code || !state || !expectedState || state !== expectedState) {
    return closePage('Spotify connection failed — the request expired or was tampered with. Try connecting again.', returnPath)
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return closePage('Spotify is not configured on this server.', returnPath)
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
      return closePage('Spotify rejected the connection. Try again.', returnPath)
    }
  } catch {
    return closePage('Could not reach Spotify. Try again.', returnPath)
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
    headers.append('Set-Cookie', `${SPOTIFY_RETURN_COOKIE}=; Path=/api/spotify; Max-Age=0`)
    headers.append('Set-Cookie', boardSpotifyAuthCookie(req, auth))
    return new Response(pageHtml('Spotify connected.', returnPath), { status: 200, headers })
  }

  const c = await supabaseServer()
  if (!c) return closePage('Supabase is not configured — cannot save the connection.', returnPath)

  const {
    data: { user },
  } = await c.auth.getUser()
  if (!user) return closePage('You need to be signed in to connect Spotify. Sign in, then try again.', returnPath)

  const { error: writeErr } = await c.from('tile_data').upsert(
    { user_id: user.id, tile_id: TILE_ID, data: auth, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,tile_id' },
  )
  if (writeErr) return closePage('Connected, but saving failed. Try again.', returnPath)

  const headers = new Headers({ 'Content-Type': 'text/html' })
  headers.append('Set-Cookie', 'spotify_state=; Path=/api/spotify; Max-Age=0')
  headers.append('Set-Cookie', `${SPOTIFY_RETURN_COOKIE}=; Path=/api/spotify; Max-Age=0`)
  return new Response(pageHtml('Spotify connected.', returnPath), { status: 200, headers })
}
