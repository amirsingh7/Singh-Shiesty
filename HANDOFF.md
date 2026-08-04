# RESUME HERE
- **Working on:** Attaching a compressed squat-PR video as evidence to the user's real "295 lb back squat" record in PR Portfolio (Phase 4 evidence pipeline).
- **Next step:** Query production Supabase (service-role client, `.env.local` has `OWNER_USER_ID`/`SUPABASE_SERVICE_ROLE_KEY`) for the `${OWNER_USER_ID}:train` tile_data row, find the Train history entry matching a 295 lb (~133.8 kg) squat, confirm the exact date/reps with the user if more than one matches, then upload `/Users/asunderrex92679/Desktop/Claude Dashboard Deliverable /RenderedVideo-compressed.mp4` (already compressed, 17.7MB H.264 1080x1920, down from 90MB 4K HEVC — quality preserved) to the `evidence` Storage bucket + write the matching `evidence` tile_data row (see `lib/tiles/evidence.ts` for the exact shape/`evidenceKey()`).
- **Waiting on you:** nothing blocking — last message was me asking "want me to go find that Train entry now?" and you ran /handoff instead of answering, so just say go (or give the exact date if you remember it, to skip the lookup).

-----

## Done so far (all this session, all merged to `main` on `decorate/laurel-seal`, auto-deployed via Vercel)
1. Header coin badge (`app/app/DashboardHeaderBadge.tsx`) — several SVG alignment/bevel fixes, then finally replaced with the user's own finished coin render (`public/pr-coin-badge.png`, cropped from their poster mockup) instead of a hand-drawn recreation.
2. Mentor page tagline (`app/mentor/MentorPage.tsx:506`) — "notices everything · runs the math" → "guided by discipline, build for growth".
3. Gobind's avatar in Velocity's "Ask Gobind" chat (`public/tiles/velocity.html`) — placeholder gradient blob → real portrait (`public/gobind-face.png`, cropped from the user's character art). `setFace()`'s mood JS now safely no-ops (ids it looked for no longer exist).
4. Mentor dashboard tile's animated centerpiece (`app/app/DashboardGrid.tsx`, `VeeArt()`) — was a literal "V" chevron (leftover from the tile's internal "vee" codename), redrawn as a "G" for Gobind. **Not yet visually confirmed by the user** — I hit a hard image-processing limit this session and couldn't render/check it myself. Ask them to look next chat.
5. `content/site.ts` name field — "Singh Shiesty" → "Amir" (drives "Good morning, Amir" / "Amir's PR Portfolio" on login), for a LinkedIn-facing rebrand.
6. Squat video compressed: source `Desktop/Claude Dashboard Deliverable /RenderedVideo.MOV` (90MB, 4K 3840x2160 120fps HEVC, 15.5s) → `RenderedVideo-compressed.mp4` (17.7MB, 1080x1920 H.264 CRF20, same folder) via ffmpeg. Not yet uploaded anywhere.

## Key files
- `lib/tiles/evidence.ts` — evidence upload/metadata store, the pattern to follow for the video attach (see project memory `project_pr_portfolio.md`'s Phase 4 section for full architecture: Storage bucket `evidence`, RLS scoped to `${user_id}/...`, `evidenceKey(liftId,date,weightKg,reps)`).
- `.env.local` — has `OWNER_USER_ID`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY` already set from prior phases.
- `app/app/DashboardGrid.tsx` (~line 58-61, `VeeArt()`) — the new G mark, needs visual confirmation.

## Watch out
- Image-reading hit a hard per-turn limit this session (kept failing on both user-pasted images and my own generated test renders, regardless of file size) — if it recurs, don't retry Read repeatedly; ask the user to describe things in words instead, like was done for the V→G icon location.
- This repo's `Desktop/Claude Dashboard Deliverable /` folder (note trailing space in the name) is where the user drops source assets (photos/videos/mockups) for me to find — check there first for anything referenced by filename.
- Git identity isn't configured (auto-fills "Amir Eduardo Singh" from the machine) — harmless, don't fix unprompted.
- Established workflow all session: commit on `decorate/laurel-seal` → `gh pr create --base main` → `gh pr merge --merge --delete-branch=false`. Always run `npx tsc --noEmit -p .` (and usually a quick `npm run dev` + curl compile check) before pushing.
