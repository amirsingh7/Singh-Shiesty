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
