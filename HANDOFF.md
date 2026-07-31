# RESUME HERE
- **Working on:** PR Portfolio rebrand (was "Vitality") — theme, identity, typography, shape language, and a header layout bug, all across three PRs this session.
- **Next step:** Nothing pending — ask the user what's next. PR #2 (branch `fix/header-gear-overlap`) is open and waiting on THEM to check the Vercel preview and merge (or report back what looks wrong).
- **Waiting on you:** user needs to look at PR #2's preview — https://singh-shiesty-git-fix-header-gear-overlap-amirsingh7s-projects.vercel.app — and confirm (a) the header gear no longer overlaps a long wrapped name, and (b) the new "PR" seal gem (WebGL, couldn't be screenshotted from this sandbox) actually looks right, then merge.

-----

## Done so far (this session)
- **Forge rebrand, PR #1** (already merged to main): full color rebrand (mint green → ember/amber #D98E4A) across all 9 sealed tiles (`public/tiles/*.html`) + app chrome; then a second wave renaming the app to **PR Portfolio** everywhere user-facing (metadata, manifest, page titles, new "PR" seal-monogram favicon replacing the old faceted gem), swapping italic Instrument Serif for a bold upright Roboto Slab app-wide, and reducing pill buttons (border-radius:999px) to a structured 10px everywhere except genuine circles (identified by equal width/height, left alone).
- **PR #2** (open, unmerged, branch `fix/header-gear-overlap`): two commits —
  1. Fixed the settings-gear icon overlapping a long wrapped greeting name (`app/app/dashboard.module.css` — `.profileAvatar`/`.profileLink` moved from `position:absolute` against the whole page into normal flex flow inside `.headerRow`, so flexbox's no-overlap guarantee applies at any name length/viewport width). Also cleaned up 8 stray duplicate `font-weight` declarations left over from the Forge italic-strip sed (same-rule conflicts where a later `font-weight:400/500` was silently overriding the intended `700`).
  2. Replaced the header/mentor gem's shape: `components/HeroCrystal.tsx` gained a new `shape="seal"` option (faceted coin via `CylinderGeometry(0.92,0.92,0.34,22,1).rotateX(Math.PI/2).toNonIndexed()` — the `.toNonIndexed()` is load-bearing, see Watch out) and a `sealText` prop (canvas `strokeText` monogram, same 5-layer glow as the old V, bypasses the shared `GlyphKey` catalogue). `app/app/DashboardHeaderGem.tsx` now passes `shape="seal" sealText="PR"`. Header gem size bumped 180px→220px (170/120 at breakpoints) for "GRAND" per the user's explicit ask.
- Both PR #1 and #2 verified via `tsc --noEmit` (clean), Node syntax-checks on all tile `<script>` blocks, and dev-server curl smoke tests. The seal's geometry/face-detection math was additionally verified in isolation via a Node reproduction of the actual algorithm (confirmed the coin's front cap correctly merges into one face at normal (0,0,1) — this caught a real bug, see Watch out).
- **No headless browser exists in this sandbox** — nothing WebGL or visual-in-a-real-browser has been screenshotted by Claude; both PRs were shipped as branch+PR so Vercel's preview deploy lets the user verify visually themselves. This is now the established pattern for this kind of change in this project.

## Key files
- `app/app/dashboard.module.css` — header layout (`.headerRow`, `.header`, `.profileAvatar`, `.profileLink`, `.headerGem`), all touched this session.
- `components/HeroCrystal.tsx` (~1950 lines) — the Three.js gem/seal engine. `shape` prop, `sealText` prop, geometry construction ~line 260-275, face-detection algorithm ~line 329-360, character-mode face-lock ~line 961-984, glyph painting ~line 452-505.
- `app/app/DashboardHeaderGem.tsx` — the live call site (`mode="character" tint="amber" shape="seal" sealText="PR"`).
- `public/tiles/*.html` (9 files) + `app/globals.css` + several chrome components — already-merged Forge palette/type/shape source of truth if any of PR #1's choices need revisiting.

## Watch out
- `CylinderGeometry` is **indexed** (`geo.index !== null`); Icosahedron/Dodecahedron/Tetrahedron/Octahedron are not. The face-detection algorithm in HeroCrystal.tsx reads `geo.attributes.position` in raw sequential triples assuming non-indexed data — any NEW geometry type added to `shape` must get `.toNonIndexed()` or face-picking silently produces garbage (NaN normals, wrong center). Verify any such addition the same way this session did: reproduce the face-merge loop standalone in `node -e "..."` against the real `three` package before trusting it.
- Don't fabricate or predict a WebGL/browser screenshot — this sandbox has none. Ship visual changes as branch+PR and ask the user to check the Vercel preview, same pattern as `feedback_ui_verification` memory already established for Supabase data.
- PR #2 is **not yet merged** — don't assume the seal or header fix is live until the user confirms and merges.
