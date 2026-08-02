/**
 * Your body, on file — the personal inputs the mentor ASKS for.
 *
 * The mentor (Claude Code) interviews you — height, weight, age, units — the
 * first time a goal or tile needs body math (peak pharmacokinetics scale by
 * bodyweight; fuel targets scale by all of it). It writes the answers here,
 * you reload. Never guessed, never required up front: every field is optional
 * and the math degrades gracefully to sensible defaults.
 *
 * Two write paths, same as goals/weights:
 *   · this file (DEFAULT_PROFILE) — the mentor edits it in VS Code
 *   · localStorage 'vitality:profile' — the connector or a UI can retune
 *     without a code change; it wins over the defaults
 *
 * Ask in their units, store metric. lib knows only cm/kg.
 */

export interface Profile {
  /** First name, for the greeting. */
  name?: string
  heightCm?: number
  weightKg?: number
  age?: number
  sex?: 'male' | 'female'
  /** How to TALK to them about it — storage stays metric. */
  units?: 'metric' | 'imperial'
  goalShape?: 'bulk' | 'cut' | 'lean-bulk' | 'maintain'
  /** Daily calorie target for Fuel, from goalShape + Mifflin-St Jeor. */
  calorieTarget?: number

  // ── Athletic Profile (PR Portfolio) — all optional, all additive ──
  username?: string
  photoUrl?: string
  coverUrl?: string
  location?: string
  schoolOrGym?: string
  headline?: string
  bio?: string
  disciplines?: string[]
  experienceLevel?: 'beginner' | 'intermediate' | 'advanced' | 'competitive'
  weightClass?: string
  ageDivision?: string
  primaryGoals?: string[]
  /** UI concept only — no real access control, there's one owner. */
  visibility?: 'public' | 'private'
  personalStatement?: string

  // ── Founder background (business-context doc, section 2) — the story
  // behind the product, shown on the profile alongside the athlete data. ──
  founderPhotoUrl?: string
  founderEducation?: string
  founderAdjacentKnowledge?: string
  founderIndustryExperience?: string
  founderPersonalBackground?: string
  founderFoundingCommunity?: string
  founderTechnicalCapability?: string
  founderNarrative?: string
}

/**
 * How a performance record's credibility is presented — never "verified,"
 * never trainer-adjacent. Evidence and endorsements add context; they are
 * not certification.
 */
export type RecordStatus =
  | 'self-reported'
  | 'evidence-attached'
  | 'competition-result'
  | 'community-endorsed'

/** Blank until the mentor asks. Fallbacks live at the call sites. */
export const DEFAULT_PROFILE: Profile = {
  age: 22,
  sex: 'male',
  heightCm: 177.8,
  weightKg: 82.1,
  units: 'imperial',
  goalShape: 'lean-bulk',
  calorieTarget: 3080,

  // Founder background, as given directly by the owner (business-context doc).
  // Placeholder photo, per the owner — will be swapped for a professional one.
  founderPhotoUrl: '/IMG_9505.jpeg',
  founderEducation: 'B.S. in Business',
  founderAdjacentKnowledge: 'Kinesiology and Exercise Science (college exposure)',
  founderIndustryExperience: 'Worked at a campus recreation center',
  founderPersonalBackground: 'Active lifter, deeply embedded in gym and bodybuilding culture',
  founderFoundingCommunity: 'Friends and training partners from college gym',
  founderTechnicalCapability: 'Non-technical founder — recruiting a developer is a current priority',
  founderNarrative:
    "The founder's combination of business education, exercise science exposure, hands-on experience at a campus rec center, and genuine passion for the lifting community positions them as an authentic insider building for a community they actually belong to. This is a meaningful competitive advantage: the target user is not an abstraction; they are the founder's training partners.",
}

/**
 * The profile: DEFAULT_PROFILE, with any localStorage override
 * ('vitality:profile') layered on top field-by-field. Merged (not
 * replaced) so a new default field the mentor adds later — like the
 * founder-background fields — still surfaces for someone who already
 * saved a profile blob before that field existed.
 */
export function profile(): Profile {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('vitality:profile')
      if (raw) {
        const o = JSON.parse(raw)
        if (o && typeof o === 'object' && !Array.isArray(o)) return { ...DEFAULT_PROFILE, ...(o as Profile) }
      }
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_PROFILE
}

export function saveProfile(p: Profile): void {
  try {
    window.localStorage.setItem('vitality:profile', JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

/** Bodyweight for tile math (peak PK etc.) — 75 kg until they've been asked. */
export function bodyWeightKg(): number {
  return profile().weightKg ?? 75
}

/**
 * Cross-device mirror for the profile, same pattern tile data already uses
 * (lib/sync.ts's syncSave/syncLoad against the tile_data table, keyed by a
 * bare id — here 'profile'). No-ops if the owner hasn't configured Supabase.
 * Additive: profile() / saveProfile() above stay localStorage-only and
 * unchanged; callers that want the cloud copy opt in explicitly.
 */
export async function syncProfileToCloud(userId: string, p: Profile): Promise<void> {
  const { syncEnabled, syncSave } = await import('../sync')
  if (syncEnabled()) await syncSave(userId, 'profile', p, new Date().toISOString())
}

export async function loadProfileFromCloud(userId: string): Promise<Profile | null> {
  const { syncEnabled, syncLoad } = await import('../sync')
  if (!syncEnabled()) return null
  const remote = await syncLoad(userId, 'profile')
  return remote && typeof remote === 'object' && !Array.isArray(remote)
    ? { ...DEFAULT_PROFILE, ...(remote as Profile) }
    : null
}
