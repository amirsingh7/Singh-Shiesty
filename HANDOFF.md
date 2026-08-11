# RESUME HERE
- **Working on:** Renaming the Vercel project away from "singh-shiesty" branding (so the public PR Portfolio link doesn't show it) and rebuilding the public profile link with the new domain.
- **Next step:** User clicked Save on the Vercel rename (Settings → General → Project Name, ignored the irrelevant OIDC warning). My guess `pr-portfolio.vercel.app` 404'd (probably taken globally) while `singh-shiesty.vercel.app` still works. Ask the user what name Vercel actually landed on (Settings → General, or the Domains tab), then `curl -o /dev/null -w "%{http_code}" https://<new-domain>/p/ca85240c-8697-485a-a671-fe9dd1762078?t=2482f7d4-91b2-4a27-8ee5-5d424cb6a7a8` to confirm it resolves, then hand them the rebuilt link.
- **Waiting on you:** the real final Vercel project name/domain.

-----

## Done so far
1. **Sleep Shortcut fix** (phone-side only, no repo files): iOS Shortcut "Sleep VS/Vercel" was reporting 30090 (seconds, not hours). Fixed by reordering: Get Duration → ÷3600 → Round to Tenths → Set variable, all placed *before* the "Get contents of URL" POST step. Confirmed live — dashboard now shows correct sleep hours.
2. **Peak tile reorg** (`public/tiles/peak.html`): removed the "Your schedule" open-block card + quick-add console (dead JS/CSS cleaned up too); merged the ·01/·02 sections back into one "Your day" flow. Merged to `main` via PR #36.
3. **Phase 1 isolation re-verified live**: 8/8 checks passed via a throwaway two-account test against production Supabase (created/seeded/deleted, never touched the real account) before the user shared their public profile link.
4. **Public profile link generated**: `https://singh-shiesty.vercel.app/p/ca85240c-8697-485a-a671-fe9dd1762078?t=2482f7d4-91b2-4a27-8ee5-5d424cb6a7a8` (visibility=private, token-gated — this is the real link to use until the domain changes).
5. **New "Dashboard" tab built** on the public `/p/[userId]` page — live per-lift (Tier-1 compound) progress charts (SVG line, current best, gain since first log), derived from the same Train data Featured PRs already reads. New files: `app/p/[userId]/ViewTabs.tsx`, `app/p/[userId]/DashboardView.tsx`; edited `app/p/[userId]/page.tsx` and `app/profile/profile.module.css` (purely additive, 44 new lines, 0 existing rules touched — confirmed via diff, so the owner's private `/profile` page is unaffected). `npx tsc --noEmit` clean. Live-verified via a throwaway Supabase test account. Merged to `main` via PR #37.
6. **Vercel rename in progress**: confirmed via grep that this codebase has zero OIDC/OpenID Connect federation usage anywhere, so Vercel's rename warning about OIDC token claims doesn't apply — safe to proceed. User saved a new project name; exact final name not yet confirmed (see Next step).

## Key files
- `app/p/[userId]/page.tsx`, `ViewTabs.tsx`, `DashboardView.tsx` — new public Dashboard tab, merged to `main`.
- `app/profile/profile.module.css` — new `.viewTabs`/`.viewTab`/`.viewTabActive`/`.dashGrid`/`.dashChart` classes, additive only.
- `public/tiles/peak.html` — reorganized, merged to `main`.
- `lib/tiles/profileDerive.ts` — reused as-is (`allLifts`, `combinedHistory`, `wDisp`, `dateLabel`), no changes needed.

## Watch out
- No hardcoded `singh-shiesty` domain references exist anywhere in the codebase (grep-confirmed) — it's purely the Vercel project's auto-assigned name, so once the real new name is confirmed, updating the link is just a URL string, zero code changes.
- Public profile identifiers (for rebuilding the link): `userId=ca85240c-8697-485a-a671-fe9dd1762078`, `token=2482f7d4-91b2-4a27-8ee5-5d424cb6a7a8`.
- This repo is both "Vitality" (personal dashboard, per CLAUDE.md's mentor persona) and the in-progress "PR Portfolio" product — see memory `project_pr_portfolio.md` for the full Phase 0–6 history (done/deployed as of ~8 days ago; today added the Dashboard-tab feature on top).
- Branch `decorate/laurel-seal` → PRs via `gh pr create --base main --head decorate/laurel-seal` then `gh pr merge <n> --merge --delete-branch=false`. An auto-commit hook fires in the background locally — don't manually `git commit` unless asked, but PR create/merge is still manual.
- `gh` occasionally throws a transient TLS x509 error on the GraphQL endpoint (seen twice this session) — just retry the exact same command, it's not a real cert problem (`curl`/`gh auth status` work fine throughout).
