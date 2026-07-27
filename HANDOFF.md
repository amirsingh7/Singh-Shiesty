# RESUME HERE
- **Working on:** Built and shipped "Symphony" — a new Spotify playback-control tile for the Vitality dashboard.
- **Next step:** Nothing pending — ask the user what's next (Spotify Phase 2 automation, or another punch-list/PR Portfolio item).
- **Waiting on you:** nothing blocking — just say what to work on next.

-----

## Done so far (this session)
- **Vitals tile**: added a "Workout History" day-by-day section (bar chart + range toggle + tooltip) below the existing recovery trend, sourced from the same per-date store the iOS Shortcut already writes to. Verified live via a flagged temp Supabase entry, then cleaned up.
- **Punch list groomed**: live data keys (YouTube/Finnhub) dropped at user's request; MCP connector confirmed already done. See memory `project_pr_portfolio.md` for the full current list.
- **Built Symphony (Spotify control tile), Phase 1 — fully shipped and confirmed working on BOTH local dev and production (`singh-shiesty.vercel.app`)**, via a real saved Supabase token on each:
  - New tile `public/tiles/symphony.html` (connect button → full player: art/title/artist/progress, play/pause/skip, volume, shuffle/repeat, device selector).
  - Registered in `lib/tiles/coreTiles.tsx` (slot `symphony`, index '09', tall) — no `weights.ts` entry, it's a utility tile like Velocity, not a goal input.
  - Bridge extended: `lib/tiles/tileBridge.ts` (`window.Vitality.spotify(action, extra)`) + `lib/tiles/useTileHost.ts` (proxies every action to `/api/spotify/player`; 'connect' opens a real OAuth popup since sealed tiles can't).
  - New routes: `app/api/spotify/{authorize,callback,player}/route.ts` + shared `app/api/spotify/shared.ts` (redirect_uri helper).
  - Tokens stored in existing `tile_data` table, `tile_id: 'spotify_auth'` — no new SQL.
  - `.env.local`/`.env.example`/Vercel all have `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`. Spotify app ("Fitness Dashboard (Vercel)") has both redirect URIs registered (127.0.0.1 local + production).
  - Also fixed a latent unrelated bug: `DashboardGrid.tsx` `TileFace` showed a misleading red "0%" on any tile absent from the active goal's weights (Velocity had it too) — now shows the tile's own glyph via a new `noWeight` prop.
- Full plan for Symphony is saved at `/Users/asunderrex92679/.claude/plans/merry-brewing-gray.md` if deeper rationale is ever needed.

## Key files
- `public/tiles/symphony.html` — the tile UI.
- `app/api/spotify/authorize/route.ts`, `callback/route.ts`, `player/route.ts`, `shared.ts` — OAuth + playback proxy.
- `lib/tiles/tileBridge.ts`, `lib/tiles/useTileHost.ts` — bridge/host `spotify` message handling.
- `lib/tiles/coreTiles.tsx` — tile registration (`symphony` in `CoreTileId`, `CORE_TILES`, `DEFAULT_HOME_ORDER`).
- `app/app/DashboardGrid.tsx` — `noWeight` prop / glyph-instead-of-0% fix.
- `public/tiles/vitals.html` — new Workout History section.

## Watch out
- **Spotify Phase 2 (workout-linked automation)** — per-lift playlists, volume ducking, auto pause/resume — is deliberately NOT built. Train (the workout tile) only reports data once, on "Finish session"; it has no live set/rest event stream today. That's its own scoped change if the user wants to continue this.
- **OAuth gotchas** (already fixed in code, but relevant if building the next OAuth integration, e.g. WHOOP): Spotify's dashboard rejects `http://localhost` as insecure — only literal `127.0.0.1` passes, so local dev must be browsed at `http://127.0.0.1:3000`, not `localhost:3000`. Also, a `Secure` cookie flag is silently dropped on non-`https` origins — `authorize/route.ts` only sets it conditionally now.
- Spotify app is in "Development mode" (max 25 allowlisted users) — fine for personal use, would need Spotify's extension request process to go beyond that.
- Full context/rationale saved in memory `project_pr_portfolio.md` and `feedback_ui_verification.md` (the latter: never screenshot the user's live desktop to verify UI — curl the deploy + ask the user to check, or use a flagged temp Supabase entry).
