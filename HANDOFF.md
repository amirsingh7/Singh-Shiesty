# RESUME HERE
- **Working on:** Wrapping up the Vitality dashboard punch list before the user attaches business context for turning it into a product called "PR Portfolio."
- **Next step:** Ask the user which is next: verify the vitals sync on a real 2nd workout, decide daily-totals-vs-per-workout scoping, add live data keys (YouTube/Finnhub), or Spotify automation.
- **Waiting on you:** nothing blocking — just say which punch-list item to do next (see above).

-----

## Done so far (this session)
- **Fixed the workout-sync accuracy bug**: all three `Find Health Samples` filters in the "Log Workout To VS/Vercel" iOS Shortcut changed from "1 day" to **"0.083 days"** (~2hr rolling window) — a decimal-day trick instead of an unsupported Hours unit. Tried and abandoned two dead ends first: dynamic "is between" + magic-variable dates (this Shortcuts version's Date filter UI has no variable insertion) and a "Filter Files" post-filter (it only sees generic file metadata, not a Health Sample's real Start Date). Confirmed working via test run + Supabase check.
- **Fixed the timezone bug**: `app/api/vitals/ingest/route.ts` `todayKey()` now computes the date via `Intl.DateTimeFormat` in `America/Los_Angeles` instead of raw server UTC. Committed (repo has an auto-commit hook — "auto: update from Claude Code") and pushed; confirmed live (a `2026-07-26` entry landed under the correct local date after deploy).
- **Cleared bad Supabase test data**: in `tile_data` (`tile_id` `vitals` and `me:vitals`), removed `activeCalories`/`workoutMinutes`/`avgHeartRate` from `2026-07-24` (kept `feel`/`sleepHours`), deleted `2026-07-25` entirely (unrecoverable swapped/day-shifted test data, nothing else worth keeping).
- **Completed body profile intake**: `lib/tiles/profile.ts` `DEFAULT_PROFILE` now has age 22, male, 177.8cm, 82.1kg, units imperial, `goalShape: 'lean-bulk'`, `calorieTarget: 3080` (Mifflin-St Jeor + moderate activity + ~250cal surplus). Added `goalShape`/`calorieTarget` to the `Profile` interface.
- **Set up the MCP connector**: generated `MCP_TOKEN`, set in `.env.local` and Vercel env vars, redeployed. Installed the `claude` CLI (`npm install -g @anthropic-ai/claude-code --allow-scripts=@anthropic-ai/claude-code` — user's npm blocks install scripts by default). Ran `claude mcp add --transport http vitality https://singh-shiesty.vercel.app/api/mcp/mcp --header "Authorization: Bearer <token>"` — confirmed registered in `~/.claude.json`. **New MCP tools only show up in a fresh session, not the one that ran the add command** — this new session should have them.
- User revealed the long-term plan: this dashboard is becoming a product called **PR Portfolio** — full business context to come later, once the punch list below is done. Saved to memory (`project_pr_portfolio.md`) so it isn't lost.

## Key files
- `app/api/vitals/ingest/route.ts` — `todayKey()` ~line 52-55, now Pacific-time based.
- `lib/tiles/profile.ts` — `DEFAULT_PROFILE` filled in, `Profile` interface extended.
- `.env.local` — `MCP_TOKEN` set (gitignored); `VITALS_INGEST_TOKEN` and Supabase keys also set. `YOUTUBE_API_KEY`/`FINNHUB_API_KEY` still empty.
- (On user's iPhone, not in repo) — "Log Workout To VS/Vercel" Shortcut, all three `Find Health Samples` filters now `0.083 days`.

## Watch out
- `MCP_TOKEN` = `078291b7e283e07222e4e5a1f748464b48d14ddd4dceeb1a6d21e7a7a57b3a18` (also in Vercel, already redeployed) — don't regenerate, just reuse if needed.
- Supabase check command: `set -a && source .env.local && set +a && curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tile_data?tile_id=eq.vitals&select=tile_id,data,updated_at" -H "apikey: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" -H "Authorization: Bearer ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" | python3 -m json.tool`
- The `0.083`-day window is a stopgap since neither `Find Workouts` nor a "Workouts" sample type exist in this user's Shortcuts version — the real "daily totals vs per workout" design decision is still open, this just gets closer numbers.
- Remaining punch list, user's own words: verify automation on a real 2nd workout, decide daily-totals-vs-per-workout, live data keys (YouTube via console.cloud.google.com, Finnhub via finnhub.io — write both to `.env.local` + Vercel), Spotify automation (not yet scoped).
- Supabase `tiles` table already exists (confirmed via a schema-error probe) — `supabase/tiles.sql` was already run in an earlier session, no need to redo it.
- `SETUP.md` still does not exist — CLAUDE.md calls for one; never created.
