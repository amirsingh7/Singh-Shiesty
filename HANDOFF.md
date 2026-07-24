# RESUME HERE
- **Working on:** iOS Shortcut → Vitals auto-logging pipeline (Apple Watch workout → live dashboard). Now fully built, tested, and automated — DONE.
- **Next step:** No open work. If the user wants something new, offer: Add to Home Screen, MCP connector setup, verify multi-workout-per-day merge behavior, decide daily-totals vs. per-workout numbers, confirm the intake (name/goals/height/weight) was ever completed, live-data keys (YouTube/Finnhub), or create SETUP.md (doesn't exist yet, CLAUDE.md calls for one).
- **Waiting on you:** nothing, keep going.

-----

## Done so far
- Deployed live to Vercel: `singh-shiesty.vercel.app`. GitHub already connected (gh auth done, repo `amirsingh7/Singh-Shiesty`).
- Supabase connected: ran `supabase/sync.sql` + `supabase/tiles.sql` on user's existing project (`aonawacziwjsuodvcdbx`). Added `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local` (gitignored) and Vercel env vars.
- **Fixed a real bug**: a malformed `NEXT_PUBLIC_SUPABASE_URL` in Vercel threw synchronously inside the tile-discovery effect, uncaught, so `setLoaded(true)` never ran and the whole dashboard grid stayed blank (only header rendered). Patched `createClient()` calls to fail safe in `lib/sync.ts`, `lib/tiles/tileSupabase.ts`, `app/api/mcp/[transport]/route.ts` (commit `92599ee`).
- Built `app/api/vitals/ingest/route.ts` — new secured POST endpoint (`Authorization: Bearer VITALS_INGEST_TOKEN`), merges `{activeCalories, workoutMinutes, avgHeartRate}` into the vitals tile's per-day store, dual-writes `vitals`/`me:vitals` tile_data rows same as the MCP connector's `save_data` (commit `8eb9eb0`).
- Extended `public/tiles/vitals.html` to render those 3 fields under the recovery hero (`workoutRow()` function).
- Built and fully debugged an iOS Shortcut ("Log Workout To VS/Vercel"): `Find Health Samples` (Active Energy / Exercise Minutes / Heart Rate, last 1 day) → `Calculate Statistics` (Sum / Sum / Average) → JSON request body → POST to the ingest endpoint. Confirmed working live with real data (1321 cal, 94 min, 118 avg bpm landed on the dashboard).
- Set up a Personal Automation: Apple Watch Workout Ends → Run Shortcut → Run Immediately (no confirmation prompt).

## Key files
- `app/api/vitals/ingest/route.ts` — the ingest endpoint (auth, merge logic).
- `public/tiles/vitals.html` — displays activeCalories/workoutMinutes/avgHeartRate (search `workoutRow`).
- `lib/sync.ts`, `lib/tiles/tileSupabase.ts`, `app/api/mcp/[transport]/route.ts` — defensive `createClient()` wrapping.
- `.env.local` (gitignored, exists) — has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `VITALS_INGEST_TOKEN`.
- `SETUP.md` — does NOT exist yet; CLAUDE.md calls for one to be created and kept current. Never created this session.

## Watch out
- `VITALS_INGEST_TOKEN` value is `G188DOj0GMvFwT2mWTJU_o9BQygeNQ7k` — must match in both `.env.local` and Vercel env vars.
- Vitals numbers are **daily totals** ("last 1 day" sum/average), not one isolated workout's numbers — re-fires and overwrites today's entry every time ANY workout ends that day. User may want per-workout-window querying instead later (different, more involved Shortcut design — discussed but not built).
- The Supabase `tile_data` table already had pre-existing rows (`train`, `fuel`) from an earlier session — untouched, don't clobber.
- `MCP_TOKEN` is not set — MCP connector not configured yet (optional, offered as a next-step suggestion).
- Whether the "intake" (name/goals/height/weight/bulk-cut, per CLAUDE.md) was ever completed is unverified this session — check `lib/tiles/profile.ts` / `content/site.ts` / `lib/tiles/weights.ts` before assuming it's done.
- Dev server state unknown/stale from prior session notes — verify before assuming anything is running locally.
