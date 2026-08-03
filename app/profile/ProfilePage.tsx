'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import WelcomeBackdrop from '@/components/WelcomeBackdrop'
import { tileStore } from '@/lib/tiles/tileStore'
import { useSession } from '@/lib/auth/AuthProvider'
import { syncEnabled } from '@/lib/sync'
import { profile, saveProfile, syncProfileToCloud, loadProfileFromCloud, type Profile } from '@/lib/tiles/profile'
import {
  allLifts,
  bestOf,
  combinedHistory,
  timelineEvents,
  wDisp,
  dateLabel,
  initials,
  RECORD_STATUS_LABEL,
  type TrainSplit,
  type Lift,
  type HistoryEntry,
} from '@/lib/tiles/profileDerive'
import { parseImportCsv, type StagedRow } from '@/lib/tiles/importCsv'
import {
  loadCompetitionRecords,
  saveCompetitionRecords,
  mergeCompetitionRecords,
  syncCompetitionsToCloud,
  loadCompetitionsFromCloud,
  type CompetitionRecord,
} from '@/lib/tiles/competitions'
import {
  loadEvidenceRecords,
  saveEvidenceRecords,
  mergeEvidenceRecords,
  syncEvidenceToCloud,
  loadEvidenceFromCloud,
  uploadEvidence,
  deleteEvidenceFile,
  signedEvidenceUrl,
  type EvidenceRecord,
} from '@/lib/tiles/evidence'
import {
  loadWitnessRecords,
  saveWitnessRecords,
  removeWitnessRecord,
  syncWitnessesToCloud,
  loadWitnessesFromCloud,
  witnessKey,
  type WitnessRecord,
} from '@/lib/tiles/witnesses'
import {
  loadAiReviews,
  saveAiReviews,
  mergeAiReview,
  syncAiReviewsToCloud,
  loadAiReviewsFromCloud,
  reviewKey,
  type AIReviewRecord,
} from '@/lib/tiles/aiReview'
import styles from './profile.module.css'

// Class names read as plain words below instead of styles.someKey
// everywhere — c('x') === styles.x, cx(...) joins several.
function c(name: keyof typeof styles): string {
  return styles[name]
}
function cx(...names: (keyof typeof styles)[]): string {
  return names.map((n) => styles[n]).join(' ')
}

/**
 * The Athletic Profile — "a combination of LinkedIn, Strava, and a
 * professional sports portfolio," for the one owner of this board. Reads
 * Train's saved lift history directly (tileStore.loadData is the same call
 * useTileHost makes for a tile's own load — a real page doesn't need the
 * sealed-iframe bridge) to derive Featured PRs and a milestone timeline;
 * nothing here is written back to Train.
 */

const parseList = (s: string): string[] => s.split(',').map((x) => x.trim()).filter(Boolean)
const joinList = (a?: string[]) => (a || []).join(', ')

type TrainState = 'loading' | 'ready' | 'empty' | 'error'

const FOUNDER_FACTS: [keyof Profile, string][] = [
  ['founderEducation', 'Education'],
  ['founderAdjacentKnowledge', 'Adjacent knowledge'],
  ['founderIndustryExperience', 'Industry experience'],
  ['founderPersonalBackground', 'Personal background'],
  ['founderFoundingCommunity', 'Founding community'],
  ['founderTechnicalCapability', 'Technical capability'],
]

export default function ProfilePage() {
  const router = useRouter()
  const { user, loading: sessionLoading } = useSession()
  const userId = user?.id ?? 'me'
  const [mounted, setMounted] = useState(false)
  const [p, setP] = useState<Profile>({})
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Profile>({})
  const [disciplinesText, setDisciplinesText] = useState('')
  const [goalsText, setGoalsText] = useState('')
  const [saving, setSaving] = useState(false)

  const [trainState, setTrainState] = useState<TrainState>('loading')
  const [split, setSplit] = useState<TrainSplit | null>(null)
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg')

  const [competitions, setCompetitions] = useState<CompetitionRecord[]>([])
  const [importing, setImporting] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [staged, setStaged] = useState<StagedRow[] | null>(null)
  const [stageWarnings, setStageWarnings] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [importSaving, setImportSaving] = useState(false)

  const [evidence, setEvidence] = useState<EvidenceRecord[]>([])
  const [evidenceUrls, setEvidenceUrls] = useState<Record<string, string>>({})
  const [evidenceBusy, setEvidenceBusy] = useState<string | null>(null)
  const [evidenceError, setEvidenceError] = useState<string | null>(null)

  const [witnesses, setWitnesses] = useState<WitnessRecord[]>([])
  const [openWitnessList, setOpenWitnessList] = useState<string | null>(null)

  const [aiReviews, setAiReviews] = useState<AIReviewRecord[]>([])
  const [aiReviewBusy, setAiReviewBusy] = useState<string | null>(null)
  const [aiReviewError, setAiReviewError] = useState<string | null>(null)

  const [copied, setCopied] = useState(false)
  const [photoBroken, setPhotoBroken] = useState(false)
  const [coverBroken, setCoverBroken] = useState(false)
  const [founderPhotoBroken, setFounderPhotoBroken] = useState(false)

  useEffect(() => {
    if (sessionLoading) return
    if (syncEnabled() && !user) {
      router.replace('/login')
      return
    }
    setMounted(true)
    const local = profile()
    setP(local)
    ;(async () => {
      const cloud = await loadProfileFromCloud(userId)
      if (cloud) setP(cloud)
    })()
    setCompetitions(loadCompetitionRecords())
    ;(async () => {
      const cloud = await loadCompetitionsFromCloud(userId)
      if (cloud) setCompetitions(cloud)
    })()
    setEvidence(loadEvidenceRecords())
    ;(async () => {
      const cloud = await loadEvidenceFromCloud(userId)
      if (cloud) setEvidence(cloud)
    })()
    setWitnesses(loadWitnessRecords())
    ;(async () => {
      const cloud = await loadWitnessesFromCloud(userId)
      if (cloud) setWitnesses(cloud)
    })()
    setAiReviews(loadAiReviews())
    ;(async () => {
      const cloud = await loadAiReviewsFromCloud(userId)
      if (cloud) setAiReviews(cloud)
    })()
    ;(async () => {
      try {
        const mem = (await tileStore.loadData(userId, 'train')) as Record<string, unknown> | null
        const rawUnit = mem?.['vitality.logger.unit']
        if (rawUnit === 'kg' || rawUnit === 'lb') setUnit(rawUnit)
        const raw = mem?.['vitality.logger.v4']
        if (typeof raw === 'string' && raw) {
          const parsed = JSON.parse(raw)
          if (parsed && Array.isArray(parsed.days)) {
            setSplit(parsed)
            setTrainState(parsed.days.length ? 'ready' : 'empty')
          } else {
            setTrainState('empty')
          }
        } else {
          setTrainState('empty')
        }
      } catch {
        setTrainState('error')
      }
    })()
  }, [sessionLoading, user, userId, router])

  const compoundLifts = allLifts(split).filter((l) => l.tier === 1 && !l.hidden)
  const featured = compoundLifts
    .map((l) => ({ lift: l, best: bestOf(combinedHistory(l, competitions, evidence, witnesses)) }))
    .filter((x): x is { lift: Lift; best: HistoryEntry } => !!x.best)

  const timeline = timelineEvents(allLifts(split), competitions, evidence, witnesses).slice(0, 20)

  useEffect(() => {
    const paths = featured.map((f) => f.best.evidencePath).filter((p): p is string => !!p)
    const missing = paths.filter((p) => !evidenceUrls[p])
    if (!missing.length) return
    ;(async () => {
      const entries = await Promise.all(missing.map(async (p) => [p, await signedEvidenceUrl(p)] as const))
      const next: Record<string, string> = {}
      for (const [p, url] of entries) if (url) next[p] = url
      if (Object.keys(next).length) setEvidenceUrls((u) => ({ ...u, ...next }))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featured.map((f) => f.best.evidencePath).join(',')])

  if (!mounted) return null

  const startEdit = () => {
    setDraft(p)
    setDisciplinesText(joinList(p.disciplines))
    setGoalsText(joinList(p.primaryGoals))
    setPhotoBroken(false)
    setCoverBroken(false)
    setFounderPhotoBroken(false)
    setEditing(true)
  }

  const commit = async () => {
    const next: Profile = {
      ...draft,
      disciplines: parseList(disciplinesText),
      primaryGoals: parseList(goalsText),
    }
    setSaving(true)
    saveProfile(next)
    setP(next)
    setEditing(false)
    await syncProfileToCloud(userId, next)
    setSaving(false)
  }

  const field = (k: keyof Profile) => (draft[k] as string) ?? ''
  const set = (k: keyof Profile, v: string) => setDraft((d) => ({ ...d, [k]: v || undefined }))

  const uploadEvidenceFor = async (lift: Lift, best: HistoryEntry, file: File) => {
    setEvidenceError(null)
    setEvidenceBusy(best.evidencePath ? `replace:${lift.id}` : `add:${lift.id}`)
    const prior = evidence.find((e) => e.id === `${lift.id}|${best.date}|${best.w}|${best.r}`)
    const result = await uploadEvidence(userId, lift.id, best.date, best.w, best.r, file)
    if (!result.ok || !result.record) {
      setEvidenceError(result.error || 'Upload failed.')
      setEvidenceBusy(null)
      return
    }
    if (prior) await deleteEvidenceFile(prior.storagePath)
    const merged = mergeEvidenceRecords(evidence, result.record)
    saveEvidenceRecords(merged)
    setEvidence(merged)
    await syncEvidenceToCloud(userId, merged)
    setEvidenceBusy(null)
  }

  const removeEvidenceFor = async (lift: Lift, best: HistoryEntry) => {
    if (!best.evidencePath) return
    setEvidenceBusy(`remove:${lift.id}`)
    await deleteEvidenceFile(best.evidencePath)
    const merged = evidence.filter((e) => e.id !== `${lift.id}|${best.date}|${best.w}|${best.r}`)
    saveEvidenceRecords(merged)
    setEvidence(merged)
    await syncEvidenceToCloud(userId, merged)
    setEvidenceBusy(null)
  }

  const removeWitness = async (id: string) => {
    const merged = removeWitnessRecord(witnesses, id)
    saveWitnessRecords(merged)
    setWitnesses(merged)
    await syncWitnessesToCloud(userId, merged)
  }

  const askAiAbout = async (ev: { liftId: string; liftName: string; date: string; w: number; r: number }) => {
    const key = reviewKey(ev.liftId, ev.date, ev.w, ev.r)
    setAiReviewBusy(key)
    setAiReviewError(null)
    const lift = allLifts(split).find((l) => l.id === ev.liftId)
    const history = lift
      ? combinedHistory(lift, competitions, evidence, witnesses)
          .filter((h) => !h.off)
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((h) => ({ date: h.date, w: h.w, r: h.r }))
      : []
    try {
      const res = await fetch('/api/ai/review-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liftId: ev.liftId, liftName: ev.liftName, entry: { date: ev.date, w: ev.w, r: ev.r }, history }),
      })
      const json = await res.json()
      if (!res.ok || !json.verdict) {
        setAiReviewError(json.error || 'AI review failed.')
        return
      }
      const record: AIReviewRecord = {
        id: key,
        liftId: ev.liftId,
        date: ev.date,
        weightKg: ev.w,
        reps: ev.r,
        verdict: json.verdict,
        reasoning: json.reasoning,
        reviewedAt: new Date().toISOString(),
      }
      const merged = mergeAiReview(aiReviews, record)
      saveAiReviews(merged)
      setAiReviews(merged)
      await syncAiReviewsToCloud(userId, merged)
    } catch {
      setAiReviewError('AI review failed — check your connection and try again.')
    } finally {
      setAiReviewBusy(null)
    }
  }

  const startImport = () => {
    setCsvText('')
    setStaged(null)
    setStageWarnings([])
    setMapping({})
    setImporting(true)
  }

  const onCsvFile = async (file: File) => {
    setCsvText(await file.text())
  }

  const onParseCsv = () => {
    const result = parseImportCsv(csvText)
    setStaged(result.rows)
    setStageWarnings(result.warnings)
    const trainLifts = allLifts(split)
    const guess: Record<string, string> = {}
    for (const r of result.rows) {
      if (guess[r.liftLabel]) continue
      const match = trainLifts.find((l) => l.name.toLowerCase().includes(r.liftLabel.toLowerCase()))
      if (match) guess[r.liftLabel] = match.id
    }
    setMapping(guess)
  }

  const stagedCategories = staged ? Array.from(new Set(staged.map((r) => r.liftLabel))) : []

  const confirmImport = async () => {
    if (!staged) return
    setImportSaving(true)
    const records: CompetitionRecord[] = staged.map((r) => ({
      id: [r.source, r.liftLabel, r.weightKg, r.reps, r.date, r.meetName || ''].join('|'),
      liftId: mapping[r.liftLabel] || undefined,
      liftLabel: r.liftLabel,
      weightKg: r.weightKg,
      reps: r.reps,
      date: r.date,
      meetName: r.meetName,
      federation: r.federation,
      place: r.place,
      source: r.source,
      importedAt: new Date().toISOString(),
    }))
    const merged = mergeCompetitionRecords(competitions, records)
    saveCompetitionRecords(merged)
    setCompetitions(merged)
    await syncCompetitionsToCloud(userId, merged)
    setImportSaving(false)
    setImporting(false)
  }

  /** A private profile needs a secret to be viewable without signing in —
   *  generated once, on first share, and reused after that so the link the
   *  owner already handed out keeps working. */
  const ensureShareToken = async (): Promise<string> => {
    if (p.shareToken) return p.shareToken
    const token = crypto.randomUUID()
    const next = { ...p, shareToken: token }
    saveProfile(next)
    setP(next)
    await syncProfileToCloud(userId, next)
    return token
  }

  const share = async () => {
    try {
      // A public link only resolves once the profile is actually stored
      // server-side (app/p/[userId]/page.tsx reads it with the service-role
      // key) — a zero-Supabase fork falls back to the old same-device link.
      let link = window.location.origin + '/profile'
      if (syncEnabled() && user) {
        link =
          p.visibility === 'public'
            ? `${window.location.origin}/p/${userId}`
            : `${window.location.origin}/p/${userId}?t=${await ensureShareToken()}`
      }
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable — no-op, nothing to recover to */
    }
  }

  return (
    <main className="grain-overlay" style={{ minHeight: '100vh', position: 'relative' }}>
      <WelcomeBackdrop />
      <div className={cx('wrap', 'printSurface')}>
        <a href="/" className={cx('back', 'noPrint')}>
          ← Dashboard
        </a>

        {p.coverUrl && !coverBroken && (
          <div className={c('cover')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.coverUrl} alt="" className={c('coverImg')} onError={() => setCoverBroken(true)} />
          </div>
        )}

        <div className={c('headerRow') + (p.coverUrl && !coverBroken ? ' ' + c('headerRowOverCover') : '')}>
          <div className={c('avatar')}>
            {p.photoUrl && !photoBroken ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.photoUrl} alt="" className={c('avatarImg')} onError={() => setPhotoBroken(true)} />
            ) : (
              initials(p.name)
            )}
          </div>
          <div className={c('identity')}>
            <h1 className={c('name')}>{p.name || 'Your name'}</h1>
            {p.username && <div className={c('username')}>@{p.username}</div>}
            {p.headline && <div className={c('headline')}>{p.headline}</div>}
            <div className={c('metaRow')}>
              {p.location && <span>{p.location}</span>}
              {p.schoolOrGym && <span>{p.schoolOrGym}</span>}
              {p.experienceLevel && <span>{p.experienceLevel}</span>}
              {p.weightClass && <span>{p.weightClass}</span>}
              {p.ageDivision && <span>{p.ageDivision}</span>}
              {p.visibility && <span>{p.visibility === 'public' ? 'Public profile' : 'Private profile'}</span>}
              {p.listed && p.visibility === 'public' && <span>Listed in directory</span>}
            </div>
            {!!p.disciplines?.length && (
              <div className={c('tags')}>
                {p.disciplines.map((d) => (
                  <span key={d} className={c('tag')}>
                    {d}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className={cx('editBtnRow', 'noPrint')}>
            {!editing && (
              <button type="button" className="btn btn-ghost" onClick={startEdit}>
                Edit profile
              </button>
            )}
          </div>
        </div>

        {editing && (
          <div className={cx('section', 'noPrint')}>
            <div className={c('sectionHead')}>Edit profile</div>
            <div className={c('editGrid')}>
              <div className="field">
                <label className="label">Name</label>
                <input className="input" value={field('name')} onChange={(e) => set('name', e.target.value)} />
              </div>
              <div className="field">
                <label className="label">Username</label>
                <input className="input" value={field('username')} onChange={(e) => set('username', e.target.value)} />
              </div>
              <div className="field">
                <label className="label">Location</label>
                <input className="input" value={field('location')} onChange={(e) => set('location', e.target.value)} />
              </div>
              <div className="field">
                <label className="label">School / gym / team</label>
                <input className="input" value={field('schoolOrGym')} onChange={(e) => set('schoolOrGym', e.target.value)} />
              </div>
              <div className={`field ${c('full')}`}>
                <label className="label">Athletic headline</label>
                <input className="input" value={field('headline')} onChange={(e) => set('headline', e.target.value)} />
              </div>
              <div className={`field ${c('full')}`}>
                <label className="label">Bio</label>
                <textarea
                  className="input"
                  rows={3}
                  value={field('bio')}
                  onChange={(e) => set('bio', e.target.value)}
                />
              </div>
              <div className={`field ${c('full')}`}>
                <label className="label">&ldquo;Seize Your Moment&rdquo; personal statement</label>
                <textarea
                  className="input"
                  rows={2}
                  value={field('personalStatement')}
                  onChange={(e) => set('personalStatement', e.target.value)}
                />
              </div>
              <div className={`field ${c('full')}`}>
                <label className="label">Photo URL</label>
                <input
                  className="input"
                  type="url"
                  placeholder="https://…"
                  value={field('photoUrl')}
                  onChange={(e) => {
                    set('photoUrl', e.target.value)
                    setPhotoBroken(false)
                  }}
                />
                <div className={c('hint')}>Paste an image URL — file upload comes later.</div>
              </div>
              <div className={`field ${c('full')}`}>
                <label className="label">Cover image URL</label>
                <input
                  className="input"
                  type="url"
                  placeholder="https://…"
                  value={field('coverUrl')}
                  onChange={(e) => {
                    set('coverUrl', e.target.value)
                    setCoverBroken(false)
                  }}
                />
              </div>
              <div className="field">
                <label className="label">Disciplines</label>
                <input
                  className="input"
                  placeholder="Powerlifting, hybrid, running…"
                  value={disciplinesText}
                  onChange={(e) => setDisciplinesText(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label">Primary goals</label>
                <input
                  className="input"
                  placeholder="Strength, hypertrophy…"
                  value={goalsText}
                  onChange={(e) => setGoalsText(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label">Experience level</label>
                <select
                  className="input"
                  value={field('experienceLevel')}
                  onChange={(e) => set('experienceLevel', e.target.value)}
                >
                  <option value="">—</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="competitive">Competitive</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Visibility</label>
                <select
                  className="input"
                  value={field('visibility')}
                  onChange={(e) => set('visibility', e.target.value)}
                >
                  <option value="">—</option>
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
                <div className={c('hint')}>
                  Public: anyone with your profile link can view it. Private (default): only
                  someone with your share link (Share profile button) can — a plain guess at the
                  URL won&rsquo;t work.
                </div>
              </div>
              <div className="field">
                <label className="label">
                  <input
                    type="checkbox"
                    checked={!!draft.listed}
                    onChange={(e) => setDraft((d) => ({ ...d, listed: e.target.checked || undefined }))}
                  />{' '}
                  List me in the public directory
                </label>
                <div className={c('hint')}>
                  Shows up at /discover so anyone can find and browse your profile, not just
                  someone with the link. Only takes effect while Visibility above is Public — a
                  private profile never appears in the directory regardless of this setting.
                </div>
              </div>
              <div className="field">
                <label className="label">Weight class</label>
                <input className="input" value={field('weightClass')} onChange={(e) => set('weightClass', e.target.value)} />
              </div>
              <div className="field">
                <label className="label">Age division</label>
                <input className="input" value={field('ageDivision')} onChange={(e) => set('ageDivision', e.target.value)} />
              </div>

              <div className={`${c('full')} ${c('editSubhead')}`}>Founder story</div>
              <div className={`field ${c('full')}`}>
                <label className="label">Founder photo URL</label>
                <input
                  className="input"
                  type="url"
                  placeholder="https://…"
                  value={field('founderPhotoUrl')}
                  onChange={(e) => {
                    set('founderPhotoUrl', e.target.value)
                    setFounderPhotoBroken(false)
                  }}
                />
                <div className={c('hint')}>Paste an image URL — file upload comes later.</div>
              </div>
              <div className="field">
                <label className="label">Education</label>
                <input
                  className="input"
                  value={field('founderEducation')}
                  onChange={(e) => set('founderEducation', e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label">Adjacent knowledge</label>
                <input
                  className="input"
                  value={field('founderAdjacentKnowledge')}
                  onChange={(e) => set('founderAdjacentKnowledge', e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label">Industry experience</label>
                <input
                  className="input"
                  value={field('founderIndustryExperience')}
                  onChange={(e) => set('founderIndustryExperience', e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label">Personal background</label>
                <input
                  className="input"
                  value={field('founderPersonalBackground')}
                  onChange={(e) => set('founderPersonalBackground', e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label">Founding community</label>
                <input
                  className="input"
                  value={field('founderFoundingCommunity')}
                  onChange={(e) => set('founderFoundingCommunity', e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label">Technical capability</label>
                <input
                  className="input"
                  value={field('founderTechnicalCapability')}
                  onChange={(e) => set('founderTechnicalCapability', e.target.value)}
                />
              </div>
              <div className={`field ${c('full')}`}>
                <label className="label">Founder narrative</label>
                <textarea
                  className="input"
                  rows={4}
                  value={field('founderNarrative')}
                  onChange={(e) => set('founderNarrative', e.target.value)}
                />
              </div>
            </div>
            <div className={c('editActions')}>
              <button type="button" className="btn btn-primary" onClick={commit} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {(p.personalStatement || p.bio) && (
          <div className={c('section')}>
            {p.personalStatement && <p className={c('statement')}>&ldquo;{p.personalStatement}&rdquo;</p>}
            {p.bio && <p className={c('bio')}>{p.bio}</p>}
          </div>
        )}

        {(p.founderNarrative || FOUNDER_FACTS.some(([k]) => p[k])) && (
          <div className={c('section')}>
            <div className={c('sectionHead')}>Founder story</div>
            <div className={c('founderWrap')}>
              <div className={c('founderPhoto')}>
                {p.founderPhotoUrl && !founderPhotoBroken ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.founderPhotoUrl}
                    alt=""
                    className={c('founderPhotoImg')}
                    onError={() => setFounderPhotoBroken(true)}
                  />
                ) : (
                  initials(p.name)
                )}
              </div>
              <div className={c('founderFacts')}>
                {FOUNDER_FACTS.map(([key, label]) =>
                  p[key] ? (
                    <div key={key} className={c('founderRow')}>
                      <span className={c('founderLabel')}>{label}</span>
                      <span>{p[key] as string}</span>
                    </div>
                  ) : null,
                )}
              </div>
            </div>
            {p.founderNarrative && <p className={c('bio')}>{p.founderNarrative}</p>}
          </div>
        )}

        {!!p.primaryGoals?.length && (
          <div className={c('section')}>
            <div className={c('sectionHead')}>Current goals</div>
            <div className={c('tags')}>
              {p.primaryGoals.map((g) => (
                <span key={g} className={c('tag')}>
                  {g}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className={cx('section', 'noPrint')}>
          <div className={c('sectionHeadRow')}>
            <div className={c('sectionHead')}>Import competition history</div>
            {!importing && (
              <button type="button" className="btn btn-ghost" onClick={startImport}>
                Import CSV
              </button>
            )}
          </div>
          {!importing && (
            <p className={c('hint')}>
              Paste an OpenPowerlifting export (from your own lifter page) or a simple lift/weight/date CSV — this
              tags matching PRs &ldquo;Competition Result&rdquo; instead of self-reported. Never overwrites what
              Train already has.
            </p>
          )}
          {importing && (
            <div>
              <div className="field">
                <label className="label">Paste CSV, or choose a file</label>
                <textarea
                  className="input"
                  rows={4}
                  value={csvText}
                  onChange={(e) => {
                    setCsvText(e.target.value)
                    setStaged(null)
                  }}
                  placeholder="Date,MeetName,Federation,Place,Best3SquatKg,Best3BenchKg,Best3DeadliftKg…"
                />
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) onCsvFile(f)
                    setStaged(null)
                  }}
                />
              </div>
              {!staged && (
                <div className={c('editActions')}>
                  <button type="button" className="btn btn-primary" onClick={onParseCsv} disabled={!csvText.trim()}>
                    Preview
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setImporting(false)}>
                    Cancel
                  </button>
                </div>
              )}
              {staged && (
                <>
                  {!staged.length && (
                    <p className={c('empty')}>Nothing usable found in that CSV — check the format and try again.</p>
                  )}
                  {!!staged.length && (
                    <>
                      <p className={c('hint')}>
                        Found {staged.length} result{staged.length === 1 ? '' : 's'}. Point each category at the
                        matching Train lift so it counts toward that lift&rsquo;s PRs:
                      </p>
                      <div className={c('editGrid')}>
                        {stagedCategories.map((label) => (
                          <div className="field" key={label}>
                            <label className="label">{label}</label>
                            <select
                              className="input"
                              value={mapping[label] || ''}
                              onChange={(e) => setMapping((m) => ({ ...m, [label]: e.target.value }))}
                            >
                              <option value="">— skip —</option>
                              {allLifts(split).map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                      {!allLifts(split).length && (
                        <p className={c('hint')}>
                          No lifts in Train yet to map these to — log at least one session there first, or import
                          again later once you have.
                        </p>
                      )}
                    </>
                  )}
                  {!!stageWarnings.length && (
                    <ul className={c('warnings')}>
                      {stageWarnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  )}
                  <div className={c('editActions')}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={confirmImport}
                      disabled={importSaving || !staged.length}
                    >
                      {importSaving ? 'Importing…' : `Import ${staged.length} result${staged.length === 1 ? '' : 's'}`}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setImporting(false)} disabled={importSaving}>
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className={c('section')}>
          <div className={c('sectionHead')}>Featured personal records</div>
          {evidenceError && <p className={c('evidenceError')}>{evidenceError}</p>}
          {trainState === 'loading' && <p className={c('empty')}>Loading your training data…</p>}
          {trainState === 'error' && <p className={c('empty')}>Couldn’t read Train’s saved data right now — try reloading.</p>}
          {trainState !== 'loading' && trainState !== 'error' && !featured.length && (
            <p className={c('empty')}>
              Log a squat, bench, deadlift, overhead press, or weighted dip in Train to see your featured PRs here.
            </p>
          )}
          {!!featured.length && (
            <div className={c('prGrid')}>
              {featured.map(({ lift, best }) => {
                const evidenceRec = best.evidencePath ? evidence.find((e) => e.storagePath === best.evidencePath) : undefined
                const evidenceUrl = best.evidencePath ? evidenceUrls[best.evidencePath] : undefined
                const busyAdd = evidenceBusy === `add:${lift.id}`
                const busyReplace = evidenceBusy === `replace:${lift.id}`
                const busyRemove = evidenceBusy === `remove:${lift.id}`
                return (
                  <div key={lift.id} className={c('prCard')}>
                    <div className={c('prName')}>{lift.name}</div>
                    <div className={c('prVal')}>
                      {wDisp(best.w, unit)} {unit}
                      {lift.perHand ? '/ea' : ''}
                    </div>
                    <div className={c('prSub')}>
                      {best.r} rep{best.r === 1 ? '' : 's'} · {dateLabel(best.date)}
                    </div>
                    <span className={c('badge')}>{RECORD_STATUS_LABEL[best.recordStatus ?? 'self-reported']}</span>

                    {evidenceUrl &&
                      (evidenceRec?.mimeType.startsWith('video/') ? (
                        <video src={evidenceUrl} controls className={c('evidenceThumb')} />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={evidenceUrl} alt="" className={c('evidenceThumb')} />
                      ))}

                    {!!best.witnessCount && (() => {
                      const key = witnessKey(lift.id, best.date, best.w, best.r)
                      const matching = witnesses.filter((w) => witnessKey(w.liftId, w.date, w.weightKg, w.reps) === key)
                      const listOpen = openWitnessList === key
                      return (
                        <div className={cx('witnessRow', 'noPrint')}>
                          <label className={c('evidenceLabel')} onClick={() => setOpenWitnessList(listOpen ? null : key)}>
                            {best.witnessCount} {best.witnessCount === 1 ? 'witness' : 'witnesses'}
                          </label>
                          {listOpen && (
                            <ul className={c('witnessList')}>
                              {matching.map((w) => (
                                <li key={w.id}>
                                  <span>
                                    {w.witnessName}
                                    {w.relation ? ` — ${w.relation}` : ''}
                                    {w.note ? `: “${w.note}”` : ''}
                                  </span>
                                  <button type="button" className="btn btn-ghost" onClick={() => removeWitness(w.id)}>
                                    Remove
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )
                    })()}

                    <div className={cx('evidenceRow', 'noPrint')}>
                      <label className={c('evidenceLabel')}>
                        {busyAdd || busyReplace ? 'Uploading…' : best.evidencePath ? 'Replace evidence' : 'Add evidence'}
                        <input
                          type="file"
                          accept="image/*,video/*"
                          style={{ display: 'none' }}
                          disabled={busyAdd || busyReplace || busyRemove}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            e.target.value = ''
                            if (f) uploadEvidenceFor(lift, best, f)
                          }}
                        />
                      </label>
                      {best.evidencePath && (
                        <label className={c('evidenceLabel')} onClick={() => removeEvidenceFor(lift, best)}>
                          {busyRemove ? 'Removing…' : 'Remove'}
                        </label>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className={c('section')}>
          <div className={c('sectionHead')}>Timeline</div>
          {trainState !== 'loading' && trainState !== 'error' && !timeline.length && (
            <p className={c('empty')}>Your milestone timeline builds itself from Train — finish a session to start it.</p>
          )}
          {!!timeline.length && (
            <div className={c('achList')}>
              {timeline.map((ev, i) => (
                <div key={i} className={c('achRow')}>
                  <span>
                    New PR — {ev.liftName}: {wDisp(ev.w, unit)} {unit} × {ev.r}
                    <span className={c('badge')}>{RECORD_STATUS_LABEL[ev.recordStatus]}</span>
                    {(() => {
                      const key = reviewKey(ev.liftId, ev.date, ev.w, ev.r)
                      const review = aiReviews.find((r) => r.id === key)
                      const isCompound = compoundLifts.some((l) => l.id === ev.liftId)
                      // "Ask AI" is available on any self-reported compound-lift entry, not just
                      // ones the static 25%-jump heuristic already flagged — the AI read is a
                      // second opinion you can request on demand, not a reaction limited to what
                      // the heuristic happened to catch. Evidence/competition/witness entries
                      // already carry stronger provenance, so the button doesn't apply there.
                      const canAsk = isCompound && ev.recordStatus === 'self-reported'
                      return (
                        <>
                          {ev.outlier && !review && (
                            <span
                              className={c('outlierFlag')}
                              title="Unusually large jump from the previous best — self-reported, unverified. Consider attaching evidence or asking someone who saw it to witness it."
                            >
                              ⚠ large jump
                            </span>
                          )}
                          {review && (
                            <span
                              className={review.verdict === 'plausible' ? cx('outlierFlag', 'aiVerdictOk') : c('outlierFlag')}
                              title={`AI read: ${review.reasoning}`}
                            >
                              {review.verdict === 'plausible'
                                ? '✓ AI: likely plausible'
                                : review.verdict === 'implausible'
                                  ? '⚠ AI: worth checking'
                                  : ev.outlier
                                    ? '⚠ large jump'
                                    : '• AI: uncertain'}
                            </span>
                          )}
                          {canAsk && !review && (
                            <button
                              type="button"
                              className={cx('evidenceLabel', 'noPrint')}
                              disabled={aiReviewBusy === key}
                              onClick={() => askAiAbout({ liftId: ev.liftId, liftName: ev.liftName, date: ev.date, w: ev.w, r: ev.r })}
                            >
                              {aiReviewBusy === key ? ' Asking AI…' : ' Ask AI'}
                            </button>
                          )}
                        </>
                      )
                    })()}
                    {!!ev.witnessCount && (
                      <span className={c('witnessChip')}>
                        {ev.witnessCount} witness{ev.witnessCount === 1 ? '' : 'es'}
                      </span>
                    )}
                  </span>
                  <span className={c('achDate')}>{dateLabel(ev.date)}</span>
                </div>
              ))}
            </div>
          )}
          {aiReviewError && <p className={c('evidenceError')}>{aiReviewError}</p>}
        </div>

        <div className={cx('actions', 'noPrint')}>
          <button type="button" className="btn btn-primary" onClick={share}>
            {copied ? 'Link copied' : 'Share profile'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
            Download résumé
          </button>
        </div>

        <p className={cx('footnote', 'noPrint')}>Evidence and endorsements add context — they’re never official certification.</p>
      </div>
    </main>
  )
}
