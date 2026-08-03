# RESUME HERE
- **Working on:** PR Portfolio implementation — following the 9-phase implementation prompt. Phases 0–5 are all DONE, merged to `main`, and confirmed live in production (Phase 5 = timeline/witnessing/outlier-checks, PR #9).
- **Next step:** Phase 6 (the AI layer) is next per the original 9-phase prompt, not yet started. No spec file on disk — phase list and everything built so far is in memory `project_pr_portfolio.md`.
- **Waiting on you:** nothing blocking. Ask "start Phase 6?" if resuming cold.

-----

## Done so far
- **Phase 0** (audit), **Phase 1** (real auth + multi-tenant isolation), **Phase 2** (truthful `RecordStatus` + enforced profile visibility/share tokens), **Phase 3** (CSV + OpenPowerlifting competition import), **Phase 4** (evidence upload pipeline — real photo/video uploads to Supabase Storage) — all done, merged to `main` via PRs #4–#8, each individually confirmed live at `https://singh-shiesty.vercel.app` using a throwaway Supabase test account (created, verified, deleted — never touched the owner's real account/data).
- Full detail (architecture decisions, gotchas, exact verification steps) is in memory `project_pr_portfolio.md` — it's kept current after every phase this session, no need to re-derive anything from code.

## Key files
- `lib/tiles/profileDerive.ts` — shared PR-derivation logic (`combinedHistory`, `bestOf`, `prMoments`) merging Train history + competitions + evidence into one credibility-tagged view. Phase 5 will likely extend this again.
- `lib/tiles/competitions.ts`, `lib/tiles/evidence.ts` — Phase 3/4's separate stores (deliberately NOT inside Train's own data — Train's save path strips unknown fields).
- `app/profile/ProfilePage.tsx` — owner's editable profile, all the import/upload UI lives here.
- `app/p/[userId]/page.tsx` — public read-only profile, service-role reads, visibility/token enforcement, signed evidence URLs.
- `supabase/evidence_storage.sql` — Phase 4's Storage bucket + RLS, already run by the user in prod.

## Watch out
- **Two different `tile_data` key conventions** — `lib/sync.ts` (profile, competitions, evidence, spotify_auth) uses bare `tile_id` scoped by the `user_id` column; `lib/tiles/tileStore.ts` (every sealed tile: Train, Fuel, Vitals, etc.) prefixes the key itself as `${userId}:${tileId}`. A Phase 2 bug (public page read bare `'train'` instead of `${userId}:train`) shipped silently until Phase 3 caught it — always double-check which convention applies before reading tile_data directly.
- Repo has an auto-commit-and-push hook ("auto: update from Claude Code") — most commits happen automatically; a couple were made manually this session when the hook lagged behind an urgent push.
- New DB/infra changes (migrations, storage buckets) get staged as SQL and the user is asked how they want it run (they've chosen "I'll run it myself" both times so far) — never execute schema/infra changes unilaterally, per the project's own established working method.
- Verification pattern used every phase: `tsc`/`build`/`vitest` first, then a live check with a throwaway Supabase test account (and Playwright for actual browser UI clicks, installed via `npm install --no-save playwright` + cleaned up after) — never test against or screenshot the owner's real account/desktop. Always delete the throwaway account + its data afterward.
