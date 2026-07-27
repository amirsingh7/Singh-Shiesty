import { randomBytes } from 'node:crypto'
import { spotifyRedirectUri } from '../shared'

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

  // Secure only over https — browsers silently refuse to store a Secure
  // cookie on plain http, and Spotify's own redirect-URI rules force local
  // dev onto http://127.0.0.1 (no https), so a hardcoded Secure would have
  // meant the cookie never gets set locally at all.
  const secure = req.url.startsWith('https://') ? '; Secure' : ''
  const headers = new Headers({ Location: authorizeUrl.toString() })
  headers.append('Set-Cookie', `spotify_state=${state}; Path=/api/spotify; Max-Age=600; HttpOnly; SameSite=Lax${secure}`)

  return new Response(null, { status: 302, headers })
}
