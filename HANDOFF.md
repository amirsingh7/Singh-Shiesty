# RESUME HERE
- **Working on:** Adding a "delete workout" button to the Velocity tile so an accidentally-logged day's session can be removed (to relog it).
- **Next step:** Before writing any code, cleanly enumerate EVERY `VStore.setItem`/`getItem` key literal Train uses (run `grep -n "VStore\.\(setItem\|getItem\|removeItem\)" public/tiles/train.html` and read each call site) — my last grep was messy and inconclusive. Known so far: `vitality.logger.v4` (the split), `vitality.logger.unit` (kg/lb), and per-lift `'vitality.overload.' + id + '.v3'` keys from `clearOverloadStore`. This list matters because the delete write-back MUST merge onto Train's existing saved keys, never replace the whole object (see Watch out).
- **Waiting on you:** nothing, keep going.

-----

## Done so far
- Diagnosed and fixed the earlier "Couldn't save" bug: Supabase env vars were set on Vercel but `tile_data` table never existed. User ran `supabase/sync.sql` in the Supabase SQL editor — confirmed working now, saves succeed.
- Improved error plumbing: `tileStore.saveData` now returns `{ok, reason}` with a REAL reason (`too_large:<n>`, `db_error:<msg>`, `db_exception:<msg>`, `exception:<msg>`) instead of one hardcoded guess string, threaded through `useTileHost.ts`'s save handler and shown in Train's `#saveState` status text (`public/tiles/train.html`, `__setSaveState`/`__flush`).
- Built the "Velocity" tile from scratch (new 8th core tile slot): compound-lift % progress chart (multi-line, validated colorblind-safe palette) + a full workout log grouped by date, both read-only, both derived from `window.Vitality.read('train')` (cross-tile READ only — Velocity has no data of its own). Registered in `lib/tiles/coreTiles.tsx`, `public/tiles/README.md`, `.claude/commands/tile.md`, and the MCP connector's `SLOTS` list in `app/api/mcp/[transport]/route.ts`.
- Raised `MAX_TILE_DATA` in `lib/tiles/tileStore.ts` from 512KB to 4MB (separate, real fix for long-term workout-history growth — unrelated to the Supabase bug but still valid).
- Saved a standing memory preference: always give ready-to-paste SQL + exact SQL Editor click path for any future Supabase schema change (`~/.claude/projects/.../memory/feedback_supabase_sql_prompts.md`).

## Key files
- `public/tiles/velocity.html` — the tile to add the delete button to; needs a "Delete this day" action per date-group in the Workout Log section, with an inline confirm card (mirror Train's existing `chDeleteDraft`/`chConfirmDel` confirm-UI pattern, not a native `confirm()`).
- `lib/tiles/useTileHost.ts` — host message handler. Only has a `READABLE` whitelist for cross-tile `read`; there is NO write-to-another-slot capability yet. Plan: add a new `'write'` message type gated by a narrow `WRITABLE` whitelist (just `['train']` for now), reusing the `{ok, reason}` SaveResult plumbing already built for `save`.
- `lib/tiles/tileBridge.ts` — the injected shim (`window.Vitality`). Needs a new `write(slot, data)` method + a `write:ok`/`write:error` reply case in its message listener, mirroring the existing `read`/`save` pattern.
- `lib/tiles/tileStore.ts` — `saveData` already returns `{ok, reason}` (done). The new write handler should call this after a read-merge, not a blind overwrite.
- `public/tiles/train.html` — reference only for the confirm-UI pattern (`chDeleteDraft`/`chConfirmDel`/`chOpenEditor` area) and as the source of truth for exact VStore key names.

## Watch out
- **Merge, never replace.** Train's VStore holds MULTIPLE keys in one MEM object (the split, the unit pref, per-lift overload cache keys). The delete-from-Velocity write must read Train's current full saved object first, mutate only the `vitality.logger.v4` split (removing history entries matching the target date across every lift in every day), and write the WHOLE merged object back — never construct a fresh object with just 1-2 keys, or unrelated data gets silently wiped.
- Cross-tile WRITE is a deliberate, narrow expansion of the sealed-tile security model (previously read-only). Keep `WRITABLE` scoped to just `['train']` — don't make it a general capability without calling that out to the user first.
- Supabase is now live for this user (`tile_data` table exists, RLS open policy). `tileStore.saveData`'s Supabase branch takes priority whenever `db` is configured — the read-merge-write must go through `tileStore.loadData`/`saveData` (already Supabase-aware), not raw localStorage.
- Dev server was last confirmed running on `:3000` (PID 17730 in earlier sessions) — verify it's still up before testing; don't blindly start a second one (`EADDRINUSE`).
- Both `public/tiles/train.html` and `public/tiles/velocity.html` are large single-file sealed tiles — after any edit, sanity-check with the same pattern used all session: extract the `<script>` block and run `node --check` on it, plus verify `{`/`}` brace balance in both `<style>` blocks, before trusting it renders.
