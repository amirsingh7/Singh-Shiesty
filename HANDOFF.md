# RESUME HERE
- **Working on:** Debugging the user's iOS Shortcut ("Sleep VS/Vercel") that POSTs `sleepHours` to `/api/vitals/ingest` — it was reporting 31h instead of a real ~7-8h. This is a phone-side Shortcuts app fix, not a repo code change.
- **Next step:** User is comparing their live shortcut against the full 12-step spec I gave them (see below) and about to run it. Ask if it matched and what the result was.
- **Waiting on you:** nothing, keep going — just pick up the shortcut result when they report back.

-----

## Done so far
1. **Detonated only the Finance and Brand tiles** (not a full `/detonate` — user was explicit: only those two). Deleted `public/tiles/finance.html` and `public/tiles/brand.html`, did NOT touch `content/site.ts`'s `detonated` flag (that's for full-board blackout only). No live Supabase tile rows existed for those slots (`mcp__vitality__list_slots` confirmed empty), so no DB cleanup was needed. Auto-commit hook fired (`8361f8a`) and it's already pushed to `origin/decorate/laurel-seal`. Full rebuild spec saved to memory: `~/.claude/projects/-Users-asunderrex92679-VS-Code-Singh-Shiesty/memory/project_finance_brand_tiles_detonated.md`.
2. **Sleep Shortcut debugging saga** (long, iterative, phone-side only — no repo files touched): traced a 31h sleep reading through several wrong theories (summing overlapping stages → two-night calendar-bucket spanning → Sort+Limit ignoring the date filter → Calculate Statistics returning raw Unix epoch numbers instead of dates) before landing on the real fix: use Filter (no Sort/Limit) → Calculate Statistics Minimum/Maximum → reconstruct real dates via `Adjust Date` (Jan 1 1970 epoch + Add Seconds) → Get Hours Between → Round → POST. Full final 12-step spec was given to the user in the prior message — see that message in this transcript if needed, or just ask the user to paste their current shortcut screenshot again.

## Key files
- None touched by me this session for the shortcut work — it all lives in the user's iOS Shortcuts app ("Sleep VS/Vercel" shortcut), not the repo.
- `app/api/vitals/ingest/route.ts` — the receiving endpoint (unchanged, already correct; just stores whatever `sleepHours` number it's sent, no math).
- `public/tiles/peak.html:1323` — where `sleepHours` gets displayed ("Synced today · Xh sleep"); also unchanged, just prints the raw value.
- `public/tiles/finance.html`, `public/tiles/brand.html` — deleted this session (see memory note above for rebuild spec).

## Watch out
- The shortcut is meant to run each **morning** shortly after waking, via a Time-of-Day automation (Shortcuts app → Automation → + → Time of Day). A 1-day lookback window only works reliably at that time of day — testing it late at night (as happened this session, after midnight) makes a 1-day window too short (misses part of "last night") and a 2-day window too wide (catches the night before too, reproducing the original bug). Don't re-widen the window as a quick fix without noting this.
- Shortcuts' "Find Health Samples" Date filter only offers day/week/month/year units (no hours) and only "is on / is today / is between / is in the last" comparisons (no "is after") — worth remembering if similar HealthKit shortcuts come up again.
- `Calculate Statistics (Minimum/Maximum)` on Date-type values returns a raw Unix epoch number as text, not a formatted date — needs the `Adjust Date` epoch-reconstruction trick (see spec above) to convert back to a usable Date.
- Detonate command: user's house rule confirmed this session — always ask before running any `/detonate`, and when scoped ("only X and Y tiles"), do exactly that scope, never the full board.
