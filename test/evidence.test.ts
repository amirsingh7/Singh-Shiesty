import { describe, expect, it } from 'vitest'
import { evidenceKey, mergeEvidenceRecords, type EvidenceRecord } from '@/lib/tiles/evidence'
import { combinedHistory, type Lift } from '@/lib/tiles/profileDerive'
import type { CompetitionRecord } from '@/lib/tiles/competitions'

const rec = (overrides: Partial<EvidenceRecord> = {}): EvidenceRecord => ({
  id: evidenceKey('squat-bb', '2024-01-01', 150, 5),
  liftId: 'squat-bb',
  date: '2024-01-01',
  weightKg: 150,
  reps: 5,
  storagePath: 'user-1/abc.jpg',
  mimeType: 'image/jpeg',
  uploadedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
})

describe('mergeEvidenceRecords', () => {
  it('replaces a record with the same id instead of duplicating', () => {
    const first = rec()
    const merged = mergeEvidenceRecords([first], rec({ storagePath: 'user-1/new.jpg' }))
    expect(merged).toHaveLength(1)
    expect(merged[0].storagePath).toBe('user-1/new.jpg')
  })

  it('leaves unrelated records alone', () => {
    const first = rec()
    const other = rec({ id: evidenceKey('bench-bb', '2024-02-01', 100, 3), liftId: 'bench-bb', date: '2024-02-01', weightKg: 100, reps: 3 })
    const merged = mergeEvidenceRecords([first], other)
    expect(merged).toHaveLength(2)
  })
})

describe('combinedHistory — evidence upgrade', () => {
  it('upgrades a matching self-reported entry to evidence-attached and attaches the path', () => {
    const lift: Lift = { id: 'squat-bb', name: 'Squat', tier: 1, history: [{ w: 150, r: 5, date: '2024-01-01' }] }
    const evidence = [rec()]
    const combined = combinedHistory(lift, [], evidence)
    expect(combined).toHaveLength(1)
    expect(combined[0].recordStatus).toBe('evidence-attached')
    expect(combined[0].evidencePath).toBe('user-1/abc.jpg')
  })

  it('does not touch entries with no matching evidence', () => {
    const lift: Lift = { id: 'squat-bb', name: 'Squat', tier: 1, history: [{ w: 160, r: 3, date: '2024-02-01' }] }
    const combined = combinedHistory(lift, [], [rec()])
    expect(combined[0].recordStatus).toBeUndefined()
    expect(combined[0].evidencePath).toBeUndefined()
  })

  it('never overrides a competition-result entry, even with a coincidentally matching evidence key', () => {
    const lift: Lift = { id: 'squat-bb', name: 'Squat', tier: 1, history: [] }
    const comps: CompetitionRecord[] = [
      {
        id: 'c1',
        liftId: 'squat-bb',
        liftLabel: 'Squat',
        weightKg: 150,
        reps: 5,
        date: '2024-01-01',
        source: 'openpowerlifting',
        importedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    const combined = combinedHistory(lift, comps, [rec()])
    expect(combined).toHaveLength(1)
    expect(combined[0].recordStatus).toBe('competition-result')
    expect(combined[0].evidencePath).toBeUndefined()
  })
})
