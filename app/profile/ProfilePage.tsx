'use client'

import { useEffect, useState } from 'react'
import WelcomeBackdrop from '@/components/WelcomeBackdrop'
import { tileStore } from '@/lib/tiles/tileStore'
import {
  profile,
  saveProfile,
  syncProfileToCloud,
  loadProfileFromCloud,
  type Profile,
  type RecordStatus,
} from '@/lib/tiles/profile'
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

const LB = 0.45359237
const RECORD_STATUS_LABEL: Record<RecordStatus, string> = {
  'self-reported': 'Self-Reported',
  'evidence-attached': 'Evidence Attached',
  'competition-result': 'Competition Result',
  'community-endorsed': 'Community Endorsed',
}

interface HistoryEntry {
  w: number
  r: number
  date: string
  off?: boolean
}
interface Lift {
  id: string
  name: string
  tier?: number
  hidden?: boolean
  perHand?: boolean
  history?: HistoryEntry[]
}
interface TrainSplit {
  days: { id: string; name: string; lifts: Lift[] }[]
}

function allLifts(split: TrainSplit | null): Lift[] {
  if (!split) return []
  const seen = new Set<string>()
  const out: Lift[] = []
  for (const day of split.days || []) {
    for (const lift of day.lifts || []) {
      if (!seen.has(lift.id)) {
        seen.add(lift.id)
        out.push(lift)
      }
    }
  }
  return out
}

function bestOf(history: HistoryEntry[]): HistoryEntry | null {
  let best: HistoryEntry | null = null
  for (const h of history) {
    if (h.off) continue
    if (!best || h.w > best.w || (h.w === best.w && h.r > best.r)) best = h
  }
  return best
}

/** Every entry that beat everything strictly before it — a deterministic,
 *  read-only reconstruction of "was this a PR when it was logged," with no
 *  new field written onto Train's data. */
function prMoments(lift: Lift): { date: string; w: number; r: number; liftName: string }[] {
  const hist = (lift.history || [])
    .filter((h) => !h.off)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
  const out: { date: string; w: number; r: number; liftName: string }[] = []
  let bestW = -Infinity
  let bestR = -Infinity
  for (const h of hist) {
    if (h.w > bestW || (h.w === bestW && h.r > bestR)) {
      out.push({ date: h.date, w: h.w, r: h.r, liftName: lift.name })
      bestW = h.w
      bestR = h.r
    }
  }
  return out
}

const wDisp = (kg: number, unit: 'kg' | 'lb') => (unit === 'lb' ? Math.round((kg / LB) * 2) / 2 : Math.round(kg * 100) / 100)
const dateLabel = (k: string) => {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
const parseList = (s: string): string[] => s.split(',').map((x) => x.trim()).filter(Boolean)
const joinList = (a?: string[]) => (a || []).join(', ')
const initials = (name?: string) =>
  (name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '—'

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

  const [copied, setCopied] = useState(false)
  const [photoBroken, setPhotoBroken] = useState(false)
  const [coverBroken, setCoverBroken] = useState(false)
  const [founderPhotoBroken, setFounderPhotoBroken] = useState(false)

  useEffect(() => {
    setMounted(true)
    const local = profile()
    setP(local)
    ;(async () => {
      const cloud = await loadProfileFromCloud()
      if (cloud) setP(cloud)
    })()
    ;(async () => {
      try {
        const mem = (await tileStore.loadData('me', 'train')) as Record<string, unknown> | null
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
  }, [])

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
    await syncProfileToCloud(next)
    setSaving(false)
  }

  const field = (k: keyof Profile) => (draft[k] as string) ?? ''
  const set = (k: keyof Profile, v: string) => setDraft((d) => ({ ...d, [k]: v || undefined }))

  const compoundLifts = allLifts(split).filter((l) => l.tier === 1 && !l.hidden)
  const featured = compoundLifts
    .map((l) => ({ lift: l, best: bestOf(l.history || []) }))
    .filter((x): x is { lift: Lift; best: HistoryEntry } => !!x.best)

  const achievements = allLifts(split)
    .flatMap(prMoments)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8)

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + '/profile')
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
                <div className={c('hint')}>No real access control yet — this is a single-owner prototype.</div>
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

        <div className={c('section')}>
          <div className={c('sectionHead')}>Featured personal records</div>
          {trainState === 'loading' && <p className={c('empty')}>Loading your training data…</p>}
          {trainState === 'error' && <p className={c('empty')}>Couldn’t read Train’s saved data right now — try reloading.</p>}
          {trainState !== 'loading' && trainState !== 'error' && !featured.length && (
            <p className={c('empty')}>
              Log a squat, bench, deadlift, overhead press, or weighted dip in Train to see your featured PRs here.
            </p>
          )}
          {!!featured.length && (
            <div className={c('prGrid')}>
              {featured.map(({ lift, best }) => (
                <div key={lift.id} className={c('prCard')}>
                  <div className={c('prName')}>{lift.name}</div>
                  <div className={c('prVal')}>
                    {wDisp(best.w, unit)} {unit}
                    {lift.perHand ? '/ea' : ''}
                  </div>
                  <div className={c('prSub')}>
                    {best.r} rep{best.r === 1 ? '' : 's'} · {dateLabel(best.date)}
                  </div>
                  <span className={c('badge')}>{RECORD_STATUS_LABEL['self-reported']}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={c('section')}>
          <div className={c('sectionHead')}>Recent achievements</div>
          {trainState !== 'loading' && trainState !== 'error' && !achievements.length && (
            <p className={c('empty')}>Your milestone timeline builds itself from Train — finish a session to start it.</p>
          )}
          {!!achievements.length && (
            <div className={c('achList')}>
              {achievements.map((a, i) => (
                <div key={i} className={c('achRow')}>
                  <span>
                    New PR — {a.liftName}: {wDisp(a.w, unit)} {unit} × {a.r}
                  </span>
                  <span className={c('achDate')}>{dateLabel(a.date)}</span>
                </div>
              ))}
            </div>
          )}
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
