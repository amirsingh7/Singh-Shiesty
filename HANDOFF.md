# RESUME HERE
- **Working on:** Debugging the iOS Shortcut ("Log Workout To VS/Vercel") that logs Apple Watch workouts to the dashboard — data was landing wrong/inaccurate.
- **Next step:** User is mid-edit on their phone, changing all three `Find Health Samples` actions (Active Calories, Exercise Time, Heart Rate) from "Start Date is in the last **1 day**" to "**2 hours**" — a fallback fix since neither `Find Workouts` nor a "Workouts" sample type exist in their Shortcuts version. Ask for a screenshot confirming all 3 now say "2 hours," then have them tap ▶ to test-run it, and check the Supabase `vitals` row (see query below) for the fresh values.
- **Waiting on you:** confirm the 3-filter edit is done (phone battery was critically low — verify it didn't die mid-edit), then say go for a test run.

-----

## Done so far (this session)
- **Diagnosed & the user fixed a field-swap bug**: the Shortcut's JSON body was grabbing the wrong "Statistics Result" magic variable (all three `Calculate Statistics` outputs looked identical in the picker). Fix: added explicit `Set Variable` steps (`ActiveCaloriesValue`/`WorkoutMinutesValue`/`AvgHeartRateValue`) right after each `Calculate Statistics`, then re-pointed the JSON body to those. Confirmed correct via screenshots — this part is done.
- **Diagnosed a second, still-open bug**: "last 1 day" sums *all* activity in a rolling 24h window, not just the actual workout, so numbers don't match the Watch's real per-workout stats (user's real workout was 1hr 15sec; Shortcut pulled 172 min). Checked for a dedicated `Find Workouts` action and for a "Workouts" type inside `Find Health Samples` — neither exists on this Shortcuts version. Landed on the 2-hour-window fallback (in progress, see above).
- **Earlier in session (unresolved, lower priority):** found a timezone mismatch — `app/api/vitals/ingest/route.ts` `todayKey()` (~line 52) uses server UTC date while `public/tiles/vitals.html` `todayKey()` (~line 111) uses browser local date, so a late-evening workout can get filed under tomorrow's date key server-side. Not fixed in code yet.
- **Also unresolved:** Supabase `tile_data` row `tile_id = 'vitals'` still has bad data from earlier testing — `2026-07-24` has stale test values (activeCalories 1321, workoutMinutes 94, avgHeartRate 118), and `2026-07-25` has the swapped/day-shifted real workout (workoutMinutes 172 [was actually avg HR], avgHeartRate 125 [was actually workout minutes], activeCalories 2172 [daily total, not workout-scoped]). Offered to merge corrected values into `2026-07-24` and clear `2026-07-25` — user never confirmed go-ahead. Ask before touching it (house rule: never overwrite silently).
- **Separately still open from start of session:** body profile intake (age/gender/height/weight/bulk-cut → Fuel calorie targets) is incomplete — `lib/tiles/profile.ts` `DEFAULT_PROFILE = {}`. Never returned to this after the workout-sync bug took over. Goals/weights *are* done (`lib/tiles/weights.ts` has shaped `DEFAULT_GOALS` + `OVERALL_GOAL`), and name is set (`content/site.ts`).

## Key files
- (On user's iPhone, not in repo) — the Shortcut itself: `Find Health Samples` ×3 → `Calculate Statistics` → `Set Variable` → `Text` (JSON) → `Get Contents of` `https://singh-shiesty.vercel.app/api/vitals/ingest`.
- `app/api/vitals/ingest/route.ts` — ingest endpoint; `todayKey()` UTC issue noted above, untouched.
- `public/tiles/vitals.html` — `workoutRow()` renders the 3 fields; `todayKey()` local-date issue noted above.
- `lib/tiles/profile.ts`, `content/site.ts`, `lib/tiles/weights.ts` — intake status (profile empty, goals done).

## Watch out
- To check current Supabase state: `set -a && source .env.local && set +a && curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tile_data?tile_id=eq.vitals&select=tile_id,data,updated_at" -H "apikey: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" -H "Authorization: Bearer ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" | python3 -m json.tool`
- Don't re-diagnose the field-swap bug — it's fixed and confirmed. Only the daily-total-vs-single-workout scoping is still open.
- `VITALS_INGEST_TOKEN` = `G188DOj0GMvFwT2mWTJU_o9BQygeNQ7k` — must match `.env.local` and Vercel env vars (unchanged this session).
- The Supabase `tile_data` table has pre-existing `train`/`fuel` rows from earlier sessions — don't touch those.
- `MCP_TOKEN` still not set — MCP connector not configured (optional).
- `SETUP.md` still does not exist — CLAUDE.md calls for one; never created.
