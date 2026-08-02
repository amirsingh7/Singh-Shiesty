import { describe, expect, it } from 'vitest'
import { parseImportCsv } from '@/lib/tiles/importCsv'
import { mergeCompetitionRecords, type CompetitionRecord } from '@/lib/tiles/competitions'
import { combinedHistory, type Lift } from '@/lib/tiles/profileDerive'

describe('parseImportCsv — OpenPowerlifting format', () => {
  const csv = [
    'Date,MeetName,Federation,Place,Best3SquatKg,Best3BenchKg,Best3DeadliftKg',
    '2024-03-10,Spring Open,USAPL,3,180,120,220',
    '2023-11-02,Fall Classic,USAPL,1,0,110,200',
  ].join('\n')

  it('auto-detects the format from the header', () => {
    expect(parseImportCsv(csv).format).toBe('openpowerlifting')
  })

  it('emits one staged row per nonzero lift, skips zero/missing attempts', () => {
    const { rows } = parseImportCsv(csv)
    expect(rows).toHaveLength(5) // 3 from row 1, 2 from row 2 (Best3SquatKg=0 skipped)
    const row1Squat = rows.find((r) => r.date === '2024-03-10' && r.liftLabel === 'Squat')
    expect(row1Squat).toMatchObject({ weightKg: 180, reps: 1, meetName: 'Spring Open', federation: 'USAPL', source: 'openpowerlifting' })
    expect(rows.find((r) => r.date === '2023-11-02' && r.liftLabel === 'Squat')).toBeUndefined()
  })

  it('skips rows with an unparseable date and reports why', () => {
    const bad = 'Date,Best3SquatKg\nnot-a-date,180\n'
    const { rows, warnings } = parseImportCsv(bad)
    expect(rows).toHaveLength(0)
    expect(warnings[0]).toMatch(/Date/)
  })
})

describe('parseImportCsv — generic format', () => {
  it('parses lift/weight/date plus optional reps/unit, converting lb to kg', () => {
    const csv = ['lift,weight,unit,reps,date', 'Squat,405,lb,1,2024-01-15'].join('\n')
    const { rows, format } = parseImportCsv(csv)
    expect(format).toBe('generic')
    expect(rows).toHaveLength(1)
    expect(rows[0].liftLabel).toBe('Squat')
    expect(rows[0].weightKg).toBeCloseTo(183.7, 1)
    expect(rows[0].date).toBe('2024-01-15')
  })

  it('accepts MM/DD/YYYY dates', () => {
    const csv = ['lift,weight,date', 'Bench,100,3/4/2024'].join('\n')
    const { rows } = parseImportCsv(csv)
    expect(rows[0].date).toBe('2024-03-04')
  })

  it('flags an unrecognized header instead of guessing', () => {
    const csv = ['foo,bar', '1,2'].join('\n')
    const { rows, format, warnings } = parseImportCsv(csv)
    expect(format).toBe('unrecognized')
    expect(rows).toHaveLength(0)
    expect(warnings.length).toBeGreaterThan(0)
  })
})

describe('mergeCompetitionRecords', () => {
  it('is idempotent on identical rows and updates on a corrected mapping', () => {
    const base: CompetitionRecord = {
      id: 'openpowerlifting|Squat|180|1|2024-03-10|Spring Open',
      liftLabel: 'Squat',
      weightKg: 180,
      reps: 1,
      date: '2024-03-10',
      source: 'openpowerlifting',
      importedAt: '2024-01-01T00:00:00.000Z',
    }
    const afterFirstImport = mergeCompetitionRecords([], [base])
    expect(afterFirstImport).toHaveLength(1)

    const reimportedSameRow = mergeCompetitionRecords(afterFirstImport, [base])
    expect(reimportedSameRow).toHaveLength(1)

    const remapped = mergeCompetitionRecords(afterFirstImport, [{ ...base, liftId: 'squat-bb' }])
    expect(remapped).toHaveLength(1)
    expect(remapped[0].liftId).toBe('squat-bb')
  })
})

describe('combinedHistory', () => {
  it('only pulls in competition records mapped to this lift, tagged competition-result', () => {
    const lift: Lift = { id: 'squat-bb', name: 'Squat', tier: 1, history: [{ w: 150, r: 5, date: '2024-01-01' }] }
    const comps: CompetitionRecord[] = [
      {
        id: 'a',
        liftId: 'squat-bb',
        liftLabel: 'Squat',
        weightKg: 180,
        reps: 1,
        date: '2024-03-10',
        source: 'openpowerlifting',
        importedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'b',
        liftId: 'bench-bb',
        liftLabel: 'Bench',
        weightKg: 120,
        reps: 1,
        date: '2024-03-10',
        source: 'openpowerlifting',
        importedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    const combined = combinedHistory(lift, comps)
    expect(combined).toHaveLength(2)
    const compEntry = combined.find((h) => h.w === 180)
    expect(compEntry?.recordStatus).toBe('competition-result')
    expect(combined.find((h) => h.w === 120)).toBeUndefined()
  })

  it('leaves unmapped competition records out entirely', () => {
    const lift: Lift = { id: 'squat-bb', name: 'Squat', tier: 1, history: [] }
    const comps: CompetitionRecord[] = [
      {
        id: 'a',
        liftLabel: 'Squat',
        weightKg: 180,
        reps: 1,
        date: '2024-03-10',
        source: 'openpowerlifting',
        importedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    expect(combinedHistory(lift, comps)).toHaveLength(0)
  })
})
