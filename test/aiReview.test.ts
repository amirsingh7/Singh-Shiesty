import { describe, expect, it } from 'vitest'
import { reviewKey, mergeAiReview, type AIReviewRecord } from '@/lib/tiles/aiReview'

const review = (overrides: Partial<AIReviewRecord> = {}): AIReviewRecord => ({
  id: reviewKey('squat-bb', '2024-01-01', 150, 5),
  liftId: 'squat-bb',
  date: '2024-01-01',
  weightKg: 150,
  reps: 5,
  verdict: 'uncertain',
  reasoning: 'A generous but not implausible jump.',
  reviewedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
})

describe('reviewKey', () => {
  it('builds a stable key from lift/date/weight/reps', () => {
    expect(reviewKey('squat-bb', '2024-01-01', 150, 5)).toBe('squat-bb|2024-01-01|150|5')
  })
})

describe('mergeAiReview', () => {
  it('replaces an existing review for the same PR rather than duplicating it', () => {
    const existing = [review({ verdict: 'uncertain' })]
    const merged = mergeAiReview(existing, review({ verdict: 'plausible', reasoning: 'Re-reviewed after evidence.' }))
    expect(merged).toHaveLength(1)
    expect(merged[0].verdict).toBe('plausible')
  })

  it('keeps unrelated reviews untouched', () => {
    const other = review({ id: reviewKey('bench-bb', '2024-02-01', 90, 3), liftId: 'bench-bb' })
    const merged = mergeAiReview([other], review())
    expect(merged.map((r) => r.id).sort()).toEqual([other.id, review().id].sort())
  })
})
