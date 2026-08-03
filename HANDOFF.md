# RESUME HERE
- **Working on:** PR Portfolio implementation — following the 9-phase implementation prompt. Phases 0–5 are all DONE, merged to `main`, and confirmed live in production (Phase 5 = timeline/witnessing/outlier-checks, PR #9).
- **Next step:** Phase 6 (the AI layer) is next per the original 9-phase prompt, not yet started. No spec file on disk — phase list and everything built so far is in memory `project_pr_portfolio.md`.
- **Waiting on you:** nothing blocking. Ask "start Phase 6?" if resuming cold.

-----

## Done so far
- **Phases 0–4** (audit; real auth/multi-tenant isolation; truthful `RecordStatus` + share tokens; CSV/OpenPowerlifting import; evidence photo/video uploads) — all merged, all confirmed live.
- **Phase 5** (timeline, witnessing, outlier-checks) — merged via PR #9, confirmed live. New: unified cross-lift Timeline (replaces "Recent achievements"), a public no-login witness-attestation endpoint validated against real PR data, a non-blocking outlier flag on implausible self-reported jumps. Badge precedence: competition-result > evidence-attached > community-endorsed > self-reported. No DB/infra migration was needed — rides the existing `tile_data` table.
- Full detail (architecture decisions, gotchas, exact verification steps for every phase) is in memory `project_pr_portfolio.md` — kept current after every phase, no need to re-derive anything from code.

## Key files
- `lib/tiles/profileDerive.ts` — shared PR-derivation logic: `combinedHistory`, `bestOf`, `timelineEvents`, `isOutlier`, `recordExists`. Phase 6 will likely extend this again.
- `lib/tiles/competitions.ts`, `lib/tiles/evidence.ts`, `lib/tiles/witnesses.ts` — separate stores per credibility source (deliberately NOT inside Train's own data — Train's save path strips unknown fields).
- `app/profile/ProfilePage.tsx` — owner's editable profile; import/upload/witness-moderation UI lives here.
- `app/p/[userId]/page.tsx` + `app/p/[userId]/WitnessForm.tsx` — public read-only profile + the one client-side write form a stranger can use.
- `app/api/witness/[userId]/route.ts` — the public, no-login witness-attestation endpoint (service-role, visibility/token gated, validates against real PR data).

## Watch out
- **Two different `tile_data` key conventions** — `lib/sync.ts` (profile, competitions, evidence, witnesses, spotify_auth) uses bare `tile_id` scoped by the `user_id` column; `lib/tiles/tileStore.ts` (every sealed tile: Train, Fuel, Vitals, etc.) prefixes the key itself as `${userId}:${tileId}`. Always double-check which convention applies before reading tile_data directly.
- Repo has an auto-commit-and-push hook ("auto: update from Claude Code") — most commits happen automatically.
- New DB/infra changes get staged as SQL and the user is asked how they want it run — never execute schema/infra changes unilaterally.
- Verification pattern used every phase: `tsc`/`build`/`vitest` first, then a live check with a throwaway Supabase test account (Playwright for browser UI clicks, `npm install --no-save playwright` + cleaned up after) — never test against or screenshot the owner's real account/desktop. Always delete the throwaway account + its data afterward.
- **Don't run `npm run build` while `npm run dev` might already be running** — both write to `.next` by default and it can clobber the dev server's cache (hit this in the Phase 5 session; fixed by killing dev, `rm -rf .next`, restarting).
