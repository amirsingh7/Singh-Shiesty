# RESUME HERE
- **Working on:** Train tile and Fuel tile add-ons (per-set training tags, editable done-sets, water unit calculator).
- **Next step:** Nothing pending — ask the user what's next (they said "good" on the last Fuel change with no follow-up ask yet).
- **Waiting on you:** nothing blocking — just say what to work on next.

-----

## Done so far (this session)
- **Train tile** (`public/tiles/train.html`):
  - Added per-set training tags — `amrap`, `bodyweight` (`bw`), `to failure` (`toFailure`) — as tappable toggle chips under every set pill (live logger `setRow()`), carried into history via `finishSession()`/`liftSessions()`, and into the past-session editor (`chOpenEditor`/`chDrawEditor`/`chSaveDraft`/`chWriteBack`) with small A/B/F dot toggles per set.
  - Fixed done-set editing: tapping a logged set's weight/reps now saves on blur (previously only worked via Enter key, which mobile keyboards don't reliably fire). Added `commit(startRest)` param so editing an already-done set doesn't restart the rest timer.
  - Tag "fill-in": selecting a tag now replaces the number itself (e.g. `195 lb × failure` instead of `195 lb × 3`), not just showing a badge underneath. Implemented as read-only `<span>` swapped in for the `<input>` (NOT an `<input readonly>` — that clipped text on Safari because `field-sizing:content` isn't supported there; had to switch to plain spans with `data-role="w"/"r"` lookups instead of positional `.pillInput` destructuring).
  - `blankSets()` now defaults `amrap:false, bw:false, toFailure:false`.
  - Did NOT touch `tiles-library/train.html` — it's a stale, much smaller (953 vs ~2940 lines) snapshot, already out of sync with `public/tiles/train.html` before this session. Flagged to user, not fixed (separate job).
- **Fuel tile** (`public/tiles/fuel.html`, mirrored to `tiles-library/fuel.html` since those two started identical):
  - Added "the gallon": a Cups/mL/Gallon unit toggle (`.uTabs`) that re-expresses the water count and week-bar tooltips in the selected unit (stored internally as whole cups always, `waterUnit` persisted in store).
  - Daily minimum shown as a range "aim for 8–10 cups" (`GOAL_LO=8, GOAL_HI=10`), converted per unit; week-bar scaling still uses the 8-cup floor internally regardless of display unit.
  - Added hydration description text under the tracker: "70% of your body is water. Hydration matters — especially when you're taking creatine." (flat/universal copy, not personalized to bodyweight — user asked for a flat 8-10 cup minimum, not a bodyweight formula).
  - Confirmed via `.claude/commands/fuel.md` that the `/fuel` skill is for a *different* thing (a supplement-stack checklist, e.g. creatine/protein) — did not run it, this was a direct hand-build on top of the existing minimal water tracker instead.
- Verified both tiles via `node -e "new Function(...)"` syntax-check on the extracted `<script>` block, plus `npm run dev` + curl checks on `/` and `/tiles/train.html` / `/tiles/fuel.html` (200s, new markup present in response body) each time, then killed the dev server after.

## Key files
- `public/tiles/train.html` — the live Train tile (single large self-contained HTML file, ~2940 lines). All Train work happened here.
- `public/tiles/fuel.html` + `tiles-library/fuel.html` — the Fuel tile (kept in sync, both ~140 lines now).
- `tiles-library/train.html` — stale/smaller, intentionally left untouched this session.

## Watch out
- This repo's tiles are sealed, self-contained HTML files loaded via sandboxed `<iframe>` (see `app/app/DashboardGrid.tsx`) — no build step, no TS. Verification = syntax-check the inline `<script>` with Node + curl the dev server, not `tsc`/`next lint` (those don't touch `public/`).
- `public/tiles/*.html` vs `tiles-library/*.html` can silently diverge (Train did, Fuel didn't as of this session). Before editing a tile, diff the two — if they match, mirror the edit into both like Fuel; if they've already diverged (like Train), only touch `public/tiles/` and flag the mismatch rather than guessing which is authoritative.
- Safari does not support the `field-sizing:content` CSS property — don't rely on it for auto-width inputs; a read-only `<span>` is the safe pattern for "text that fills in and must always show in full."
- Always kill the background dev server (`pkill -f "next dev"`) after a curl verification pass — don't leave it running.
