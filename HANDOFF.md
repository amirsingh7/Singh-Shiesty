# RESUME HERE
- **Working on:** PR Portfolio — Phase 7 (wearables) and Phase 8 (community/coach/monetization), first slices.
- **Next step:** Apple Health sleep Shortcut is mid-build on the user's phone, paused overnight for real sleep data (Watch sleep tracking was just turned on). Next session: ask user to run the "Find Health Samples" (Type: Sleep, Start Date is in the last 1 day) → Quick Look shortcut again and screenshot the result, then finish wiring the POST to `/api/vitals/ingest` with `sleepHours` + a morning time-based Automation trigger.
- **Waiting on you:** the sleep-data screenshot above. No other blocker — everything else this session shipped and is live.

-----

## Done so far
- **Fixed a real data-sync bug** (PR #13, merged+deployed): `lib/tiles/useTileHost.ts` had a redundant, buggy Supabase mirror (`syncSave`/`syncLoad` from `lib/sync.ts`) running alongside `tileStore`'s own correct Supabase read/write for every sealed tile (train/fuel/vitals/etc.) — two different key conventions for the same data, and reads always preferred the stale one. Removed the redundant mirror entirely; `tileStore` already handled Supabase sync correctly on its own. Also deleted the stray duplicate Supabase rows (`train` bare-key and legacy `me:train`) that had caused the visible symptom (backfilled squat entry not showing on Velocity).
- **Backfilled two PRs with video evidence**, both self-reported entries with evidence attached: Barbell back squat 295lb×1 (2026-04-01) and Flat Bench Press 225lb×1 (2026-04-13). Videos uploaded to Supabase Storage `evidence` bucket (squat video was 85.6MB, compressed via ffmpeg to 16.3MB to fit the app's 25MB cap; bench video was already under the cap).
- **Phase 6 confirmed complete** — no new work, just confirmed via memory: AI plausibility review ("Ask AI" button) is the full intended scope, merged/live (PRs #10-12). Recruiter search was deliberately excluded from Phase 6, moved to Phase 8.
- **Phase 7, Apple Health slice** (PR #14, merged+deployed): extended the pre-existing `/api/vitals/ingest` route (already live from an earlier session, previously workout-stats only) to also accept `sleepHours`. WHOOP and Oura are both deferred — WHOOP requires an active membership+device just to register as a developer (confirmed via WebSearch, user has neither); Oura has a no-hardware sandbox but user chose to focus on Apple Health only since they already have a Watch.
- Confirmed the user **already has a working "Log Workout" Shortcut** from a prior session posting `activeCalories`/`workoutMinutes`/`avgHeartRate` to the ingest endpoint — did not touch it. Building only the new, separate sleep-logging Shortcut.
- **Phase 8, first slice — public directory** (PR #15, merged+deployed): new `/discover` route, public/no-auth, service-role client (same posture as `/p/[userId]`). New `Profile.listed` field (`lib/tiles/profile.ts`) — deliberately separate opt-in from `visibility`, only takes effect when also `visibility === 'public'`, enforced at the query. Sorts by each profile's single heaviest tier-1 lift (no fixed squat/bench/deadlift assumption, matches `competitions.ts`'s existing philosophy). New checkbox in `ProfilePage.tsx`'s edit form. Verified end-to-end (positive + both negative cases) against a throwaway Supabase Auth test account, cleaned up after.

## Key files
- `lib/tiles/useTileHost.ts` — the dual-key bug fix; every sealed-tile save/load/read/write now goes through `tileStore` only.
- `app/api/vitals/ingest/route.ts` — Bearer-token iOS Shortcut ingest endpoint, now accepts `sleepHours` too.
- `app/discover/page.tsx`, `app/discover/DiscoverList.tsx`, `app/discover/discover.module.css` — the new directory.
- `lib/tiles/profile.ts` — new `listed?: boolean` field.
- `app/profile/ProfilePage.tsx` — new "List me in the public directory" checkbox (~line 561-576 area).

## Watch out
- `VITALS_INGEST_TOKEN` is already set in both `.env.local` and Vercel production — don't regenerate it, the user's existing Shortcut depends on the current value.
- Apple Shortcuts action names on this user's iOS version differ from stale assumptions: no "Find Workouts" action, no "Show Result" action (it's called **"Quick Look"**), sleep sample type is just called **"Sleep"** not "Sleep Analysis", and the date filter has no "is after yesterday" — use **"is in the last" → 1 Days** instead (dynamically relative, no extra Current Date/Adjust Date actions needed).
- Deploy verification lesson learned this session: don't compare JS chunk hashes to confirm a deploy (a chunk may not even contain the changed code, giving false negatives/positives) — instead poll `gh api repos/amirsingh7/Singh-Shiesty/commits/<sha>/status --jq '.state'` for `success`, then do a real functional check (curl the actual changed behavior) against production.
- No ESLint config exists in this repo at all (pre-existing, not a regression) — verification relies on `npx tsc --noEmit` + `npx vitest run` only, same as every prior phase.
- Repo has an auto-commit-and-push hook but it's been unreliable this session (didn't fire within ~1 min a couple times) — committing/pushing directly via `git`/`gh` worked fine as a fallback.
- Throwaway Supabase Auth test accounts: create/seed/delete via service-role scripts written temporarily into the project root (not the scratchpad — Node needs `node_modules` resolution), always `rm` the temp script after and confirm `git status` clean.
