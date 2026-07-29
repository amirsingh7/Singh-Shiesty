# RESUME HERE
- **Working on:** AI Mentors feature (spec in memory `project_ai_mentors.md`) — building it slice by slice across Train/Velocity.
- **Next step:** Nothing pending — ask the user what's next. If they want to keep going on Dynamic Workout Programming (spec section 3), the remaining piece is the big one: the full goal-aware program generator (accept/modify/regenerate flow, warmup/working/back-off sets, weekly progression) — scope a first slice with the user before building, same as prior steps.
- **Waiting on you:** nothing, keep going. (Separately open, not blocking: whether Mentor Chat should be the free "Ask Claude" deep-link extension or a real embedded API route with your own paid key — see "Watch out" below.)

-----

## Done so far (this session)
- **Train per-set logging**: added RPE chips (6–10), a free-text note per set (sheet), and auto-captured actual rest taken (`lift.lastSetAt` → `set.restActual`) — all optional, carried into `lift.history` on finish. Also fixed `finishSession()` to save per-set weight (`s.w`), not just one session-level top weight.
- **Velocity "Personal records"**: per-lift verified PR, estimated 1RM (Epley, ≤12 reps), improvement vs. previous PR, tap-to-expand PR timeline.
- **Velocity "Training volume"**: this-week/this-month totals + delta % vs prior period, 8-week bar trend.
- **Velocity PR-row insight flags**: plateau (no new PR in 3 sessions), regression (worse than last session, overrides plateau), fatigue (RPE ≥1 hotter than prior 3 sessions for same/less weight), safety flag (pain/dizzy/etc. keyword in a recent set note, shown first), projected future PR (straight-line estimate, 4wk out).
- **Train deload/progression call**: same plateau/regression rule at Train's own session-level granularity (`liftProgressionCall()`), shown as a banner on the lift card; "try {90% weight}" button opens the existing Tune sheet pre-filled (`openTune(lift, presetWeightKg)`), so accept/modify/cancel are free.
- **Train recovery check-in**: sleep/soreness/stress card at top of day view, one per calendar day (`DATA.recovery[dateKey]`), every field optional, collapses to a summary line once complete. Not yet read by anything downstream.
- Explained to the user what a live in-app AI route would require (own paid API key, server-side Next.js route, context-assembly layer, breaks the "no AI keys in the app" house rule) vs. the already-half-built free alternative (Train rest coach's "Ask Claude" deep-link to claude.ai). User hasn't decided — don't build either without asking again.

Every step above was verified the same way: syntax-checked the script block with `node -e "new Function(...)"`, logic-tested the math/detection rules against hand-built data in a plain node script, then `npm run dev` + curl to confirm the tile serves with the new markup, then killed the dev server. No screenshots of the user's live desktop (per memory `feedback_ui_verification.md`).

## Key files
- `public/tiles/train.html` (~3100 lines) — per-set RPE/notes/rest, deload/progression banner, recovery check-in. No `tiles-library/train.html` mirroring needed (that file is just the base logger, episode features layer on top in `public/tiles` only).
- `public/tiles/velocity.html` (~800 lines) — PR dashboard, volume section, insight flags. No `tiles-library/velocity.html` exists at all (Velocity isn't part of the base `/vitality` reinstall).
- Memory: `project_ai_mentors.md` (in `~/.claude/projects/-Users-asunderrex92679-VS-Code-Singh-Shiesty/memory/`) — has the full 8-section spec, the Claude-native architecture decision, and a running audit of what's built vs. not. Read this before resuming instead of re-deriving from the user.

## Watch out
- Architecture is locked: **Claude-native, no AI keys in the deployed app** (CLAUDE.md house rule). All the plateau/fatigue/PR/deload logic built this session is deterministic client-side arithmetic, not an AI call — keep it that way unless the user explicitly says to add a live API route (see the open question above).
- Section 2 of the AI Mentors spec (PR & Progress Dashboard) is essentially done except per-lift volume PRs (only the aggregate total exists) — deferred, not forgotten.
- Recovery check-in data exists but nothing reads it yet — don't assume plateau/deload calls factor in recovery, they don't.
- Fuel tile is still untouched this session (water-only) — section 4–5 of the spec (nutrition mentor, macro targets) is a ground-up build whenever the user wants it next.
