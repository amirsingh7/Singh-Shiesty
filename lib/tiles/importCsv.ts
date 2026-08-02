/**
 * Turns pasted CSV text into staged competition rows — never written to the
 * competitions store directly (importCsv.ts) or CompetitionRecord (that
 * needs a liftId, which only the owner can supply, in ProfilePage's review
 * step). Two formats, auto-detected by header:
 *
 *   · OpenPowerlifting — the exact CSV an OpenPowerlifting lifter page
 *     exports (openpowerlifting.org): one row per meet entry, up to three
 *     staged rows out of it (Best3SquatKg/Best3BenchKg/Best3DeadliftKg).
 *     We don't fetch or bulk-import OpenPowerlifting's own dataset — the
 *     owner exports their own results from their own lifter page and pastes
 *     that; matches the sealed-tile "no live fetch" rule and sidesteps
 *     needing to disambiguate lifters who share a name.
 *   · Generic — lift,weight,date + optional reps/unit/meet/federation/place
 *     columns, for anything logged by hand or from a federation without an
 *     OpenPowerlifting-shaped export.
 */

export interface StagedRow {
  liftLabel: string
  weightKg: number
  reps: number
  date: string
  meetName?: string
  federation?: string
  place?: string
  source: 'openpowerlifting' | 'csv'
}

export interface ImportResult {
  rows: StagedRow[]
  warnings: string[]
  format: 'openpowerlifting' | 'generic' | 'unrecognized'
}

/** Minimal RFC4180-ish line splitter — handles quoted fields containing
 *  commas ("New York, USA") and doubled "" escapes. Good enough for the
 *  two known shapes above; not a general CSV library. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      pushField()
    } else if (ch === '\r') {
      /* skip, \n (or end) closes the row */
    } else if (ch === '\n') {
      pushRow()
    } else {
      field += ch
    }
  }
  if (field.length || row.length) pushRow()
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ''))
}

function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined
  const t = v.trim()
  if (!t) return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

const LB = 0.45359237

function normalizeDate(v: string | undefined): string | undefined {
  if (!v) return undefined
  const t = v.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return undefined
}

function parseOpenPowerlifting(header: string[], rows: string[][]): ImportResult {
  const idx = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase())
  const iDate = idx('Date')
  const iMeet = idx('MeetName')
  const iFed = idx('Federation')
  const iPlace = idx('Place')
  const iSquat = idx('Best3SquatKg')
  const iBench = idx('Best3BenchKg')
  const iDeadlift = idx('Best3DeadliftKg')

  const lifts: { label: string; col: number }[] = [
    { label: 'Squat', col: iSquat },
    { label: 'Bench', col: iBench },
    { label: 'Deadlift', col: iDeadlift },
  ].filter((l) => l.col >= 0)

  const out: StagedRow[] = []
  const warnings: string[] = []
  rows.forEach((r, i) => {
    const date = normalizeDate(r[iDate])
    if (!date) {
      warnings.push(`Row ${i + 2}: skipped — missing or unrecognized Date.`)
      return
    }
    const meetName = iMeet >= 0 ? r[iMeet]?.trim() : undefined
    const federation = iFed >= 0 ? r[iFed]?.trim() : undefined
    const place = iPlace >= 0 ? r[iPlace]?.trim() : undefined
    let any = false
    for (const l of lifts) {
      const kg = num(r[l.col])
      if (kg === undefined || kg <= 0) continue
      any = true
      out.push({ liftLabel: l.label, weightKg: kg, reps: 1, date, meetName, federation, place, source: 'openpowerlifting' })
    }
    if (!any) warnings.push(`Row ${i + 2} (${meetName || date}): no valid squat/bench/deadlift total — skipped.`)
  })
  return { rows: out, warnings, format: 'openpowerlifting' }
}

function parseGeneric(header: string[], rows: string[][]): ImportResult {
  const idx = (...names: string[]) => header.findIndex((h) => names.includes(h.trim().toLowerCase()))
  const iLift = idx('lift', 'exercise', 'liftname')
  const iWeight = idx('weight', 'weightkg', 'kg')
  const iUnit = idx('unit')
  const iReps = idx('reps', 'rep')
  const iDate = idx('date')
  const iMeet = idx('meet', 'meetname', 'competition')
  const iFed = idx('federation', 'fed')
  const iPlace = idx('place')

  const out: StagedRow[] = []
  const warnings: string[] = []
  if (iLift < 0 || iWeight < 0 || iDate < 0) {
    return { rows: [], warnings: ['Could not find lift/weight/date columns.'], format: 'unrecognized' }
  }
  rows.forEach((r, i) => {
    const liftLabel = r[iLift]?.trim()
    const rawWeight = num(r[iWeight])
    const date = normalizeDate(r[iDate])
    if (!liftLabel || rawWeight === undefined || !date) {
      warnings.push(`Row ${i + 2}: skipped — needs a lift name, a numeric weight, and a YYYY-MM-DD or MM/DD/YYYY date.`)
      return
    }
    const unit = iUnit >= 0 ? r[iUnit]?.trim().toLowerCase() : 'kg'
    const weightKg = unit === 'lb' || unit === 'lbs' ? rawWeight * LB : rawWeight
    out.push({
      liftLabel,
      weightKg,
      reps: iReps >= 0 ? num(r[iReps]) ?? 1 : 1,
      date,
      meetName: iMeet >= 0 ? r[iMeet]?.trim() : undefined,
      federation: iFed >= 0 ? r[iFed]?.trim() : undefined,
      place: iPlace >= 0 ? r[iPlace]?.trim() : undefined,
      source: 'csv',
    })
  })
  return { rows: out, warnings, format: 'generic' }
}

export function parseImportCsv(text: string): ImportResult {
  const table = parseCsv(text.trim())
  if (!table.length) return { rows: [], warnings: ['Empty CSV.'], format: 'unrecognized' }
  const [header, ...rows] = table
  const lower = header.map((h) => h.trim().toLowerCase())
  if (lower.includes('best3squatkg') || lower.includes('best3benchkg') || lower.includes('best3deadliftkg')) {
    return parseOpenPowerlifting(header, rows)
  }
  return parseGeneric(header, rows)
}
