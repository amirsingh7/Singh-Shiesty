/**
 * AI plausibility review — an optional, owner-triggered second opinion on a
 * self-reported PR that tripped the static outlier heuristic (isOutlier() in
 * profileDerive.ts). This is an annotation on the outlier flag, not a
 * credibility source: it never touches recordStatus or STATUS_RANK, and it
 * never runs automatically for a random visitor — the owner clicks "Ask AI"
 * on their own /profile page, which calls app/api/ai/review-pr/route.ts
 * (the one route in this app that calls an external AI API, a deliberate,
 * scoped exception to the base's "no AI keys in the app" rule, made for this
 * feature specifically).
 *
 * Same bare-key tile_data pattern as competitions.ts/evidence.ts/witnesses.ts
 * (tile_id: 'ai_reviews') — deterministic id per PR, so re-reviewing the same
 * entry (e.g. after evidence is later attached) replaces rather than
 * duplicates.
 */

export type AIReviewVerdict = 'plausible' | 'uncertain' | 'implausible'

export interface AIReviewRecord {
  /** Deterministic from the PR it reviews — see reviewKey(). */
  id: string
  liftId: string
  date: string
  weightKg: number
  reps: number
  verdict: AIReviewVerdict
  reasoning: string
  reviewedAt: string
}

export function reviewKey(liftId: string, date: string, weightKg: number, reps: number): string {
  return [liftId, date, weightKg, reps].join('|')
}

const KEY = 'vitality:ai_reviews'

export function loadAiReviews(): AIReviewRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveAiReviews(records: AIReviewRecord[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(records))
  } catch {
    /* ignore */
  }
}

export function mergeAiReview(existing: AIReviewRecord[], incoming: AIReviewRecord): AIReviewRecord[] {
  return [...existing.filter((r) => r.id !== incoming.id), incoming]
}

export async function syncAiReviewsToCloud(userId: string, records: AIReviewRecord[]): Promise<void> {
  const { syncEnabled, syncSave } = await import('../sync')
  if (syncEnabled()) await syncSave(userId, 'ai_reviews', records, new Date().toISOString())
}

export async function loadAiReviewsFromCloud(userId: string): Promise<AIReviewRecord[] | null> {
  const { syncEnabled, syncLoad } = await import('../sync')
  if (!syncEnabled()) return null
  const remote = await syncLoad(userId, 'ai_reviews')
  return Array.isArray(remote) ? (remote as AIReviewRecord[]) : null
}
