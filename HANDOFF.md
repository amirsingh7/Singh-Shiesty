# RESUME HERE
- **Working on:** PR Portfolio implementation — following the 9-phase `PR_Portfolio_Implementation_Prompt.md`. Phase 0 (audit) and Phase 1 (real auth + multi-tenant isolation) are both DONE and confirmed live in production.
- **Next step:** Start Phase 2 — make `RecordStatus` provenance real (currently hardcoded to `'self-reported'` everywhere) and enforce profile visibility/share tokens server-side (currently decorative). Read Phase 2's spec in `PR_Portfolio_Implementation_Prompt.md` before starting.
- **Waiting on you:** nothing blocking — user said "Want me to start there now?" and the conversation ended before they answered. Ask again if resuming cold, or just proceed if they've already said yes elsewhere.

-----

## Done so far
- **Phase 0** (audit): full single-user-assumption map, baseline (tsc/build clean, no prior tests), fixed stale Peak tile comments. Full detail in memory `project_pr_portfolio.md`.
- **Phase 1** (real auth + multi-tenant isolation): `@supabase/ssr` cookie-backed auth, every `tile_data`/`tiles` read-write path (8 total, not just the 6 obvious `userId="me"` sites) now scopes to a real `user_id`. Composite primary key `(user_id, tile_id)`/`(user_id, slot)` migration run and verified on the LIVE Supabase project (all 3 stages of `supabase/auth_migration.sql` executed). Login/signup/forgot-password/reset-password/sign-out all built and tested. `vitest` added (repo had zero tests before) — 8 passing isolation tests in `test/`. Two-account manual verification done (`supabase/PHASE1_VERIFICATION.md`). PR #4 merged to `main`; confirmed via curl that `https://singh-shiesty.vercel.app/` now 307-redirects to `/login` — Phase 1 is live in production, not just local.
- User's real account: email `amirsingh7@icloud.com`, `OWNER_USER_ID=ca85240c-8697-485a-a671-fe9dd1762078` (set in `.env.local` and in Vercel Production+Preview env vars, along with `SUPABASE_SERVICE_ROLE_KEY`).
- Also separately: generated `PR_Portfolio_Strategy_Report.pdf` earlier in an unrelated ask (from an older research report artifact) — not part of this build track.

## Key files
- `PR_Portfolio_Implementation_Prompt.md` — the full 9-phase spec being followed; re-read Phase 2's section before starting.
- `lib/tiles/profile.ts` — `RecordStatus` type + `Profile.visibility` field, both currently decorative (see comments in-file saying so).
- `app/profile/ProfilePage.tsx` — the one render site for `RecordStatus` (hardcoded to `'self-reported'`, line ~564 pre-Phase-1-edits) and the Share/Visibility UI (`commit()`, `share()` functions) that Phase 2 needs to make real.
- `lib/auth/*` (supabaseBrowser/Server/Admin, AuthProvider) — Phase 1's auth infra, already done, Phase 2 will reuse `useSession()`/`supabaseServer()` for enforcing visibility server-side.
- `supabase/auth_migration.sql`, `supabase/PHASE1_VERIFICATION.md` — Phase 1 reference, already executed; don't re-run.

## Watch out
- This repo has an auto-commit-and-push hook ("auto: update from Claude Code") — commits/pushes happen automatically during edits, already confirmed in sync with `origin/decorate/laurel-seal` and now `main`.
- Production requires sign-in now (Supabase is configured there) — don't be surprised by a 307 to `/login` when checking `singh-shiesty.vercel.app`.
- Supabase's own dashboard "send recovery email" button does NOT respect a custom redirect — always trigger password resets from the app's own "Forgot password?" link (`/login`), not the Supabase dashboard, or the token lands nowhere useful.
- User wants a LinkedIn post showcasing the app (explicitly "only a prototype," open to public feedback) — queued for AFTER Phase 2 per their own ordering, don't forget it, don't jump to it early.
- Follow the implementation prompt's own working method: state affected files/risks before editing, smallest vertical slice, never a one-shot rewrite, stop before destructive DB ops for explicit approval (same pattern used successfully in Phase 1's staged migration).
