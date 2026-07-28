# RESUME HERE
- **Working on:** Shipped a Fuel water mL-entry box; scoped (not built) two big future efforts — PR Portfolio business plan and an "AI Mentors" feature for Fuel/Velocity.
- **Next step:** Nothing pending — ask the user what's next. If they want to start AI Mentors, first move is adding RPE/rest-timer/notes fields to Train's per-set logging (needed before any PR/plateau detection can work).
- **Waiting on you:** nothing, keep going.

-----

## Done so far (this session)
- **Fuel water mL box** (`public/tiles/fuel.html`, mirrored in `tiles-library/fuel.html`): added an mL input + "Add to gallon" button below the +/− cup buttons (submits on click or Enter), converts mL→cups (`ml/CUP_ML`) and adds to today's total. Also rounded the "cups" display unit to 1 decimal (`toUnit`'s default branch) since mL entries now produce fractional cups. Added `<p class="hydrateNote"><b>The Gallon</b></p>` directly above the existing "70% of your body is water..." paragraph. Verified via `node -e "new Function(...)"` syntax check + `npm run dev` + curl (200, markup present), dev server killed after.
- **PR Portfolio planning**: found and read the concept PDF (`~/Desktop/Claude Dashboard Deliverable /PR_Portfolio_Business_Context_v2-Amir-Singh.pdf`). Gave the user a Phase 0/1 checklist split by founder-led vs. buildable-with-me. Asked about build architecture (new project vs. evolve this repo) — user said **not deciding yet, just planning**. Saved to memory: `project_pr_portfolio.md`.
- **AI Mentors feature scoping**: user gave a full 8-section spec (Strength Mentor, PR Dashboard, Dynamic Programming, Nutrition Mentor, Macro Targets, Mentor Chat, Mentor Specializations, Safety/Data Integrity) for a future "AI Mentors" section near Fuel/Velocity, referencing an Instagram reel (rowanthislebrooke) showing a much more advanced Fuel vision (macro rings, meal-photo logging, live coach chat) than what exists today. Audited current state (Train has raw set logging only, no RPE/PR/analysis logic; Fuel is water-only, zero macro/food code). Asked the key architecture question — live in-app AI vs. Claude-native — **user chose Claude-native: no AI keys in the app, I write recommendations into tile data each session, real chat happens in Claude Code directly, not an in-app text box.** Full spec + this decision saved to memory: `project_ai_mentors.md`. Nothing from this spec has been built yet.

## Key files
- `public/tiles/fuel.html` / `tiles-library/fuel.html` — the mL box + "The Gallon" label, just shipped, kept in sync (identical files).
- `public/tiles/train.html` (~3000 lines) — where RPE/rest-timer/notes fields would go first if AI Mentors work starts.
- `public/tiles/velocity.html` — displays workout log; would need PR/1RM detection UI eventually.
- Memory: `project_pr_portfolio.md`, `project_ai_mentors.md` (both in `~/.claude/projects/-Users-asunderrex92679-VS-Code-Singh-Shiesty/memory/`) — read these before resuming either thread instead of re-deriving from the user.

## Watch out
- Both PR Portfolio and AI Mentors are scoping-only right now — don't assume either has been started without checking git log / asking, since the user may work on things between sessions.
- CLAUDE.md house rule "No AI keys in the app, ever" is load-bearing for the AI Mentors architecture decision — don't propose a live in-app LLM route without re-confirming with the user first.
- Fuel tile edits always need mirroring into `tiles-library/fuel.html` (the `/vitality` reinstall source) — the two were kept identical this session via `cp`.
