# RESUME HERE
- **Working on:** Fitness-gym dashboard restyle (done) + a full rebuild of the Peak tile into a daily score + energy curve tracker (done, pushed).
- **Next step:** Nothing queued. If the user brings up supplements, wire a new optional score slice into `computeDailyScore()` in `public/tiles/peak.html` (read from wherever the supplements log ends up living — it doesn't exist yet) the same way water/protein are read from the fuel tile.
- **Waiting on you:** nothing, keep going. (User explicitly deferred supplements: "we replace supps and add them as we go on" — not a blocker, just a known future add.)

-----

## Done so far
- **Fitness-gym restyle** (commits `082923f`, earlier ones before it): retinted the whole dashboard from PR-blue-on-near-black to orange/green-on-slate — `app/globals.css` tokens, `app/layout.tsx` fonts (Barlow/Barlow Condensed replacing Inter/Roboto Slab), all 9 `public/tiles/*.html` tiles, the header gem (`components/HeroCrystal.tsx`), the bento-grid tile-frame chrome (`components/veeTiles.css`), goal accent colors (`lib/tiles/weights.ts`), and `dashboardChrome.ts` defaults. User confirmed it looks right after clearing a stale localStorage override via a console snippet (Safari).
- **Peak tracker rebuild** (commit `84c6a16`, pushed to `decorate/laurel-seal`): extended (not replaced) the existing Peak tile. Added: Manual/Apple Watch source switch, tap-only daily check-in (7-day day-cards, 1-5 rating chips, wake+hours→derived bedtime, publishes to the shared vitals record via a new cross-tile write), a blended "overall score" ring (recovery 45%+sleep 30% always, water/protein/gym optional+renormalized, "Why this score" toggle), a feel-slider calibration log that pulls the score toward how-you-feel (30%→50% over 30 days), a PK crash/rebound phase for stimulant meds, caffeine DB expanded 7→46 drinks with weight-scaled FDA ceiling + cutoff/clears-by/ideal-dose stats + search + custom-add + deletable intake list, a new Meds & Substances card (Concerta/Ritalin/Adderall/Vyvanse/modafinil/nicotine pouches/L-tyrosine, informational-only), an honesty footer+panel, and moved Peak to the front of the default tile order. `tsc` + `vitest` clean, inline script syntax-checked with `node --check`, synced to `tiles-library/peak.html` too (so `/vitality` reinstall won't revert it).
- **Deliberate scope decisions** (told to user): no live Whoop integration (dropped per user), no `/api/apple` live-pull (doesn't exist for Apple Health — reads the existing Shortcut→`/api/vitals/ingest` data instead), recovery formula (feel 60%/sleep 40%) left untouched per `docs/THE-MATH.md`'s explicit "never add a term" invariant rather than adding HRV/resting-HR.

## Key files
- `public/tiles/peak.html` — the big one; daily score + curve + caffeine + meds all live here (~1600 lines).
- `tiles-library/peak.html` — kept in sync with the above; the `/vitality` reinstall source.
- `lib/tiles/useTileHost.ts` — `WRITABLE` array now includes `'vitals'` (was `['train']` only) so Peak's check-in can cross-write into the vitals store.
- `lib/tiles/coreTiles.tsx` — `DEFAULT_HOME_ORDER` now starts with `'peak'`.
- `app/globals.css`, `app/layout.tsx`, `components/HeroCrystal.tsx`, `components/veeTiles.css`, `lib/tiles/weights.ts`, `lib/tiles/dashboardChrome.ts` — the restyle files, all done.

## Watch out
- `public/tiles/fuel.html` has no supplements store yet (only `water` and `meals`/`targets` for macros) — that's why the score's supplements slice is currently always skipped. Don't invent a shape for it; wait for the real feature.
- Gym detection in Peak (`D.gymPct`) is a best-effort heuristic reading `public/tiles/train.html`'s store (3300+ lines, never fully reverse-engineered) — it may under-detect. Fine per spec ("no penalty for skipping"), just don't assume it's precise.
- Chrome/goal/home-layout localStorage overrides can mask code-default changes in the live browser (bit the user once already on the restyle — cleared via a console snippet). If asked why a code change "isn't showing," check for a stale localStorage override before assuming a bug.
- Repo's auto-commit-and-push hook has been reliable this session; direct `git`/`gh` also works fine as fallback.
