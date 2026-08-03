import { describe, expect, it } from 'vitest'
import { witnessKey, sanitizeWitnessInput, removeWitnessRecord, WITNESS_NAME_MAX, type WitnessRecord } from '@/lib/tiles/witnesses'
import { combinedHistory, isOutlier, timelineEvents, recordExists, type Lift } from '@/lib/tiles/profileDerive'
import type { CompetitionRecord } from '@/lib/tiles/competitions'
import type { EvidenceRecord } from '@/lib/tiles/evidence'

const witness = (overrides: Partial<WitnessRecord> = {}): WitnessRecord => ({
  id: 'w1',
  liftId: 'squat-bb',
  date: '2024-01-01',
  weightKg: 150,
  reps: 5,
  witnessName: 'Alex',
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
})

describe('witnessKey / removeWitnessRecord', () => {
  it('builds a stable key from lift/date/weight/reps', () => {
    expect(witnessKey('squat-bb', '2024-01-01', 150, 5)).toBe('squat-bb|2024-01-01|150|5')
  })

  it('removes only the matching record by id', () => {
    const list = [witness({ id: 'a' }), witness({ id: 'b' })]
    expect(removeWitnessRecord(list, 'a').map((w) => w.id)).toEqual(['b'])
  })
})

describe('sanitizeWitnessInput', () => {
  it('rejects a missing name', () => {
    const result = sanitizeWitnessInput({})
    expect(result.ok).toBe(false)
  })

  it('rejects a name over the max length', () => {
    const result = sanitizeWitnessInput({ witnessName: 'x'.repeat(WITNESS_NAME_MAX + 1) })
    expect(result.ok).toBe(false)
  })

  it('trims and caps optional fields, dropping empty ones', () => {
    const result = sanitizeWitnessInput({ witnessName: '  Alex  ', relation: '  ', note: '  great lift  ' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.witnessName).toBe('Alex')
      expect(result.value.relation).toBeUndefined()
      expect(result.value.note).toBe('great lift')
    }
  })
})

describe('combinedHistory — witness upgrade', () => {
  const lift: Lift = { id: 'squat-bb', name: 'Squat', tier: 1, history: [{ w: 150, r: 5, date: '2024-01-01' }] }

  it('upgrades a matching self-reported entry to community-endorsed and counts witnesses', () => {
    const combined = combinedHistory(lift, [], [], [witness(), witness({ id: 'w2', witnessName: 'Sam' })])
    expect(combined[0].recordStatus).toBe('community-endorsed')
    expect(combined[0].witnessCount).toBe(2)
  })

  it('lets evidence outrank a witness on the badge, but still carries the witness count', () => {
    const ev: EvidenceRecord = {
      id: 'squat-bb|2024-01-01|150|5',
      liftId: 'squat-bb',
      date: '2024-01-01',
      weightKg: 150,
      reps: 5,
      storagePath: 'user-1/a.jpg',
      mimeType: 'image/jpeg',
      uploadedAt: '2024-01-01T00:00:00.000Z',
    }
    const combined = combinedHistory(lift, [], [ev], [witness()])
    expect(combined[0].recordStatus).toBe('evidence-attached')
    expect(combined[0].witnessCount).toBe(1)
  })

  it('does not touch entries with no matching witness', () => {
    const other: Lift = { id: 'squat-bb', name: 'Squat', tier: 1, history: [{ w: 160, r: 3, date: '2024-02-01' }] }
    const combined = combinedHistory(other, [], [], [witness()])
    expect(combined[0].recordStatus).toBeUndefined()
    expect(combined[0].witnessCount).toBeUndefined()
  })
})

describe('recordExists', () => {
  const lifts: Lift[] = [{ id: 'squat-bb', name: 'Squat', tier: 1, history: [{ w: 150, r: 5, date: '2024-01-01' }] }]
  const comps: CompetitionRecord[] = [
    {
      id: 'c1',
      liftId: 'bench-bb',
      liftLabel: 'Bench',
      weightKg: 100,
      reps: 1,
      date: '2024-03-10',
      source: 'openpowerlifting',
      importedAt: '2024-01-01T00:00:00.000Z',
    },
  ]

  it('is true for a real Train entry', () => {
    expect(recordExists(lifts, [], 'squat-bb', '2024-01-01', 150, 5)).toBe(true)
  })

  it('is true for a real competition entry, even with no matching Train lift', () => {
    expect(recordExists(lifts, comps, 'bench-bb', '2024-03-10', 100, 1)).toBe(true)
  })

  it('is false for a nonexistent lift id', () => {
    expect(recordExists(lifts, [], 'deadlift-bb', '2024-01-01', 150, 5)).toBe(false)
  })

  it('is false when the weight/date/reps do not match anything on file', () => {
    expect(recordExists(lifts, [], 'squat-bb', '2024-01-01', 999, 5)).toBe(false)
  })
})

describe('isOutlier', () => {
  it('is false with no prior best', () => {
    expect(isOutlier(null, 500)).toBe(false)
  })

  it('is false for a normal-sized jump', () => {
    expect(isOutlier(150, 165)).toBe(false)
  })

  it('is true for an implausible jump past the 25% threshold', () => {
    expect(isOutlier(100, 140)).toBe(true)
  })
})

describe('timelineEvents', () => {
  it('flags an outlier only when the record is still self-reported', () => {
    const lift: Lift = {
      id: 'squat-bb',
      name: 'Squat',
      tier: 1,
      history: [
        { w: 100, r: 5, date: '2024-01-01' },
        { w: 140, r: 5, date: '2024-02-01' },
      ],
    }
    const events = timelineEvents([lift], [], [], [])
    const jump = events.find((e) => e.w === 140)
    expect(jump?.outlier).toBe(true)
  })

  it('does not flag a competition-result entry even if it is a big jump', () => {
    const lift: Lift = { id: 'squat-bb', name: 'Squat', tier: 1, history: [{ w: 100, r: 5, date: '2024-01-01' }] }
    const comps: CompetitionRecord[] = [
      {
        id: 'c1',
        liftId: 'squat-bb',
        liftLabel: 'Squat',
        weightKg: 200,
        reps: 1,
        date: '2024-03-01',
        source: 'openpowerlifting',
        importedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    const events = timelineEvents([lift], comps, [], [])
    const compEvent = events.find((e) => e.w === 200)
    expect(compEvent?.recordStatus).toBe('competition-result')
    expect(compEvent?.outlier).toBe(false)
  })

  it('sorts newest first across lifts', () => {
    const squat: Lift = { id: 'squat-bb', name: 'Squat', tier: 1, history: [{ w: 100, r: 5, date: '2024-01-01' }] }
    const bench: Lift = { id: 'bench-bb', name: 'Bench', tier: 1, history: [{ w: 80, r: 5, date: '2024-06-01' }] }
    const events = timelineEvents([squat, bench], [], [], [])
    expect(events[0].liftName).toBe('Bench')
    expect(events[1].liftName).toBe('Squat')
  })
})
