import { randomBytes } from 'node:crypto'
import {
  spotifyRedirectUri,
  secureCookieSuffix,
  isSafeReturnPath,
  BOARD_SPOTIFY_FLAG_COOKIE,
  SPOTIFY_RETURN_COOKIE,
} from '../shared'

/**
 * Step 1 of Spotify's Authorization Code flow. The Symphony tile can't do
 * this itself — it's a sandboxed opaque-origin iframe with no top-level
 * navigation — so the host opens THIS route in a real popup window (see the
 * 'spotify' / action 'connect' handler in lib/tiles/useTileHost.ts), and this
 * route does the actual redirect to Spotify.
 *
 * Plain confidential-client flow (Basic Auth with SPOTIFY_CLIENT_SECRET in
 * callback/route.ts), not PKCE: PKCE exists for clients that can't hold a
 * secret safely (browser apps, mobile apps). This route runs server-side and
 * can hold one, so PKCE would only add complexity without adding security —
 * Spotify's token endpoint can also reject a request that mixes both. `state`
 * still guards against CSRF.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing'

export async function GET(req: Request): Promise<Response> {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  if (!clientId) {
    return new Response('Spotify is not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.', { status: 503 })
  }

  const redirectUri = spotifyRedirectUri(req)
  const state = randomBytes(16).toString('base64url')

  const authorizeUrl = new URL('https://accounts.spotify.com/authorize')
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('scope', SCOPES)
  authorizeUrl.searchParams.set('state', state)

  const secure = secureCookieSuffix(req)
  const headers = new Headers({ Location: authorizeUrl.toString() })
  headers.append('Set-Cookie', `spotify_state=${state}; Path=/api/spotify; Max-Age=600; HttpOnly; SameSite=Lax${secure}`)

  const params = new URL(req.url).searchParams

  // ?board=1 (set by the public board's Symphony tile) means: don't attach
  // this connection to the signed-in owner's account — the visitor is trying
  // Spotify with their OWN account. callback/route.ts reads this flag to
  // branch into the cookie-only path (see shared.ts).
  if (params.get('board') === '1') {
    headers.append('Set-Cookie', `${BOARD_SPOTIFY_FLAG_COOKIE}=1; Path=/api/spotify; Max-Age=600; HttpOnly; SameSite=Lax${secure}`)
  }

  // ?return=<path> is the page that opened this popup — mobile browsers
  // routinely open window.open() as a real tab rather than a closable
  // popup, and block script-initiated window.close() on it, which leaves a
  // visitor stranded on a blank "connected" page. callback/route.ts uses
  // this as a same-tab redirect fallback when close() doesn't take.
  const returnPath = params.get('return')
  if (returnPath && isSafeReturnPath(returnPath)) {
    headers.append(
      'Set-Cookie',
      `${SPOTIFY_RETURN_COOKIE}=${encodeURIComponent(returnPath)}; Path=/api/spotify; Max-Age=600; HttpOnly; SameSite=Lax${secure}`,
    )
  }

  return new Response(null, { status: 302, headers })
}
