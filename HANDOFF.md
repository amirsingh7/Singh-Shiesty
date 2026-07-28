# RESUME HERE
- **Working on:** Velocity tile's Edit feature, a swap-history-wipe bug fix in Train, and restoring lost Flat Bench Press data.
- **Next step:** Nothing pending — all three tasks completed and verified this session. Ask the user what's next.
- **Waiting on you:** nothing, keep going.

-----

## Done so far (this session)
- **Velocity tile** (`public/tiles/velocity.html`): added an **Edit** toggle to the left of **Delete** on each workout-log day. Tapping it turns that day's logged lifts into editable weight+top-reps fields; **Save** writes back to Train via the existing cross-tile `window.Vitality.write('train', 'vitality.logger.v4', ...)` channel (same one Delete uses); **Cancel** backs out. Known simplification: editing reps applies uniformly across all non-failed sets since Velocity only ever displayed one aggregate top-rep number per lift/day, not per-set detail.
- **Train tile swap bug fix** (`public/tiles/train.html`): found and fixed a real data-loss bug — swapping a lift's exercise (`swapForLibrary` / the custom-name swap path in the library overlay) used to silently wipe `history:[]` with zero confirmation, even if that slot had months of logged sessions. Now gated: if `libSwapTarget.history.length > 0`, shows an inline confirm banner (`#libSwapWarn`, reusing existing `.confirm-del`/`.obtn` styles) with "Keep [name]" / "Swap anyway" before wiping. Native `confirm()` doesn't work here — the tile iframe is sandboxed with only `allow-scripts`, no `allow-modals`.
- **Restored lost Flat Bench Press data**: user's flat bench history had been wiped by exactly the bug above (confirmed via `mcp__vitality__read_data` on slot `train` — found a lift renamed to "Barbell bench", id `lgn7sim0`, in the Chest/Back day, weight 88.451kg/195lb and targetSets:6 matching the user's reported session, with empty history while every sibling lift in that day had a 2026-07-27 entry). Renamed it back to "Flat Bench Press" and injected one history entry for 2026-07-27 (135x10, 185x5, 195x3 x3, 135xFailure) via `mcp__vitality__save_data` (merge:true), matching Train's own `finishSession()` math (top weight = max non-failed set weight, top reps = max reps among non-failed sets). Verified by reading the slot back and diffing — only that one lift changed.

## Key files
- `public/tiles/velocity.html` — Edit toggle: `startEdit`/`cancelEdit`/`saveDayEdit` functions, `renderLog()` edit-mode branch, CSS `.log-editvals`/`.edit-inp`.
- `public/tiles/train.html` — swap-confirm fix: `swapForLibrary`, `doSwapForLibrary`, `doSwapCustom`, `renderSwapWarn`, `libSwapPending` state, `#libSwapWarn` container in `buildLibraryShell()`.
- No `tiles-library/velocity.html` exists (Velocity only lives in `public/tiles/`). `tiles-library/train.html` is still the stale, untouched snapshot flagged in a previous session — not touched here either.

## Watch out
- Sealed tiles run in `sandbox="allow-scripts"` iframes (`app/app/DashboardGrid.tsx`) — no `allow-modals`, so `confirm()`/`alert()`/`prompt()` silently no-op. Any confirmation UI inside a tile must be built inline (see `renderSwapWarn` for the pattern), not native dialogs.
- Verification method for sealed tiles: `node -e "new Function(...)"` syntax-check the extracted `<script>` block, plus `npm run dev` + curl for markup/200s, then kill the dev server. Don't leave it running.
- The `mcp__vitality__save_data` connector tool works and is wired up for this user (slot `train` confirmed writable). `vitality.logger.v4` is stored as a JSON *string* value (not nested object) inside the slot's data — any edit means parse → mutate → re-stringify → wrap as `{"vitality.logger.v4": "<string>"}` before calling save_data with merge:true, or you'll corrupt the shape.
- Before writing back into Train's data by hand (as opposed to through a tile's own UI), always diff old vs. new parsed JSON first to prove only the intended field changed — this is what caught/confirmed correctness for the bench-press restore.
