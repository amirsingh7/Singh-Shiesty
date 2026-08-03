# RESUME HERE
- **Working on:** Built "Gobind" — a named AI mentor avatar + real inline chat + cozy loader — for the Mentor page. Done and merged.
- **Next step:** Nothing queued. If the user reports the live chat on `/mentor` didn't reply correctly (they hadn't confirmed a real end-to-end send/reply yet as of handoff), debug `app/api/mentor/chat/route.ts` first.
- **Waiting on you:** nothing, keep going. (User hasn't yet confirmed they personally clicked Send on `/mentor` and got a real reply back — I verified the route/page respond and typecheck/tests pass, but couldn't drive an authenticated browser session myself.)

-----

## Done so far
- **Renamed Nova → Gobind** throughout `tiles-library/ai-avatar-2.html` (and its synced copy `public/ai-avatar-2.html`, served live at `localhost:3000/ai-avatar-2.html` for the user to tinker with directly in the file).
- **`components/GobindAvatar.tsx`** (new): Three.js port of the lab's `buildNova` factory — breathing octahedron, cursor-follow, blink, 9 expressions, palette swap, sleep/wake — exposed via `forwardRef` imperative handle (`setExpression/setPalette/sleep/wake`).
- **`app/api/mentor/chat/route.ts`** (new): server route, `ANTHROPIC_API_KEY` (server-side only), `claude-sonnet-5` at `effort:'low'`, zod-structured output `{reply, mood}`. Owner-gated via `supabaseServer()` only when Supabase is actually configured; open on a zero-config local fork.
- **`app/mentor/MentorPage.tsx`**: swapped the old `DashboardHeaderGem` for `GobindAvatar`; replaced the old "opens claude.ai in a new tab" flow with a real chat feed (user/gobind bubbles, mood tag, cozy-loader "thinking" bubble with rotating general-mentor lines). `buildFullDashboardContext()` now gathers real data from **every** tile (all `CORE_TILES` + every user-built tile via `tileStore.listTiles`), not just Train/Fuel — Gobind is a general mentor per the user's explicit follow-up ask. Removed the old workout/nutrition/recovery include-toggles (now always-everything).
- **`.env.example`**: documented that `ANTHROPIC_API_KEY` now powers two deliberate exceptions to "no AI keys ever" — the existing PR-review route and Gobind's chat.
- Verified: `tsc --noEmit` clean, `vitest run` 44/44 passing, `/mentor` and `/` return 200 locally.
- **Merged**: PR #16 (`decorate/laurel-seal` → `main`), commit `19f8057`. Branch `decorate/laurel-seal` kept (repo convention: reused for the next round of changes too).

## Key files
- `components/GobindAvatar.tsx` — the avatar; only touch if visuals/expressions need changing.
- `app/api/mentor/chat/route.ts` — the chat backend; touch for prompt/model/context-size changes.
- `app/mentor/MentorPage.tsx` — the page; chat UI, cozy loader, `buildFullDashboardContext`.
- `public/ai-avatar-2.html` / `tiles-library/ai-avatar-2.html` — keep these two in sync (copy one to the other) if the user hand-edits the lab file.

## Watch out
- User's own real Anthropic key is in `.env.local` (Sonnet 5, ~$0.002–0.004/message) — they have ~$5 credits, plenty of headroom.
- `buildFullDashboardContext` caps total context at 9000 chars and each generic tile dump at ~900 chars — if a tile's data is huge/nested, its summary may look truncated JSON; that's intentional, not a bug.
- Supabase IS configured on this deployment (`.env.local` has real `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`), so the chat route's owner-gate is actually active — an unauthenticated curl to `/api/mentor/chat` correctly 401s; only testable end-to-end from a signed-in browser tab.
- This repo reuses one long-lived branch (`decorate/laurel-seal`) for many sequential PRs into `main` (12 prior + this one, #16) — that's the established convention here, not a one-off.
- A mid-conversation pasted spec earlier in this session (`mentor.html`, `db.js`, `api/mentor.js` CommonJS) was for a **different, unrelated project** — confirmed not to exist in this repo and intentionally not built here. If it resurfaces, it's still not this codebase.
