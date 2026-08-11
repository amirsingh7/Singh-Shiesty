import { timingSafeEqual } from 'node:crypto'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/auth/supabaseAdmin'
import type { Profile } from '@/lib/tiles/profile'
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
import type { CompetitionRecord } from '@/lib/tiles/competitions'
import type { EvidenceRecord } from '@/lib/tiles/evidence'
import type { WitnessRecord } from '@/lib/tiles/witnesses'
import { reviewKey, type AIReviewRecord } from '@/lib/tiles/aiReview'
import WitnessForm from './WitnessForm'
import ViewTabs from './ViewTabs'
import DashboardView from './DashboardView'
import styles from '../../profile/profile.module.css'

/**
 * The public, read-only profile — what a recruiter/brand/friend sees at the
 * link the "Share profile" button copies. No login required (this route is
 * outside app/page.tsx's auth gate on purpose), but visibility IS enforced
 * here, server-side, with the service-role client: a 'public' profile is
 * open to anyone who has the URL; anything else needs the exact `shareToken`
 * as `?t=`. Wrong/missing token and a private/nonexistent profile both 404 —
 * never leaking which one it was.
 *
 * Deliberately does NOT merge in DEFAULT_PROFILE (unlike the owner's own
 * /profile view) — a visitor should only ever see what that account actually
 * saved, never the seed placeholder data another fork's owner typed into
 * their own local file.
 */

// Every request must re-check visibility/token against the live row — never
// serve a cached render (a flip from private to public, or a revoked share
// token, has to take effect immediately, not after some stale cache expires).
export const dynamic = 'force-dynamic'

function c(name: keyof typeof styles): string {
  return styles[name]
}

function tokenMatches(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: { userId: string }
  searchParams: { t?: string }
}) {
  const { userId } = params
  const admin = supabaseAdmin()
  if (!admin) notFound()

  // 'profile'/'competitions' are bare keys (written via lib/sync.ts, scoped
  // only by the user_id column) but Train's data goes through the sealed-tile
  // bridge (lib/tiles/tileStore.ts), which prefixes every key with the owner's
  // own id — `${userId}:train`, not a bare 'train' row.
  const { data: rows } = await admin
    .from('tile_data')
    .select('tile_id, data')
    .eq('user_id', userId)
    .in('tile_id', ['profile', `${userId}:train`, 'competitions', 'evidence', 'witnesses', 'ai_reviews'])

  const profileData = (rows ?? []).find((r: { tile_id: string }) => r.tile_id === 'profile')?.data as
    | Profile
    | undefined
  if (!profileData || typeof profileData !== 'object') notFound()

  const p = profileData
  const authorized = p.visibility === 'public' || tokenMatches(searchParams.t, p.shareToken)
  if (!authorized) notFound()

  let split: TrainSplit | null = null
  let unit: 'kg' | 'lb' = 'kg'
  const trainData = (rows ?? []).find((r: { tile_id: string }) => r.tile_id === `${userId}:train`)?.data as
    | Record<string, unknown>
    | undefined
  if (trainData) {
    const rawUnit = trainData['vitality.logger.unit']
    if (rawUnit === 'kg' || rawUnit === 'lb') unit = rawUnit
    const raw = trainData['vitality.logger.v4']
    if (typeof raw === 'string' && raw) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed && Array.isArray(parsed.days)) split = parsed
      } catch {
        /* no train data to show */
      }
    }
  }

  const competitionsData = (rows ?? []).find((r: { tile_id: string }) => r.tile_id === 'competitions')?.data
  const competitions: CompetitionRecord[] = Array.isArray(competitionsData) ? (competitionsData as CompetitionRecord[]) : []

  const evidenceData = (rows ?? []).find((r: { tile_id: string }) => r.tile_id === 'evidence')?.data
  const evidence: EvidenceRecord[] = Array.isArray(evidenceData) ? (evidenceData as EvidenceRecord[]) : []

  const witnessesData = (rows ?? []).find((r: { tile_id: string }) => r.tile_id === 'witnesses')?.data
  const witnesses: WitnessRecord[] = Array.isArray(witnessesData) ? (witnessesData as WitnessRecord[]) : []

  const aiReviewsData = (rows ?? []).find((r: { tile_id: string }) => r.tile_id === 'ai_reviews')?.data
  const aiReviews: AIReviewRecord[] = Array.isArray(aiReviewsData) ? (aiReviewsData as AIReviewRecord[]) : []

  const compoundLifts = allLifts(split).filter((l) => l.tier === 1 && !l.hidden)
  const featured = compoundLifts
    .map((l) => ({ lift: l, best: bestOf(combinedHistory(l, competitions, evidence, witnesses)) }))
    .filter((x): x is { lift: Lift; best: HistoryEntry } => !!x.best)

  const timeline = timelineEvents(allLifts(split), competitions, evidence, witnesses).slice(0, 20)

  // Dashboard view's data: same combinedHistory as Featured PRs, but the
  // full sorted series per lift (not just the best entry) so a line chart
  // can show progress over time, not a single number.
  const series = compoundLifts.map((lift) => ({
    lift,
    points: combinedHistory(lift, competitions, evidence, witnesses)
      .filter((h) => !h.off)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((h) => ({ date: h.date, w: h.w })),
  }))

  // Signed URLs, generated server-side with the service-role client — the
  // 'evidence' bucket is private, so a visitor can only ever see one through
  // a URL this page handed them, and this page only runs after the
  // visibility/token check above already passed.
  const evidenceUrls: Record<string, string> = {}
  const evidencePaths = featured.map((f) => f.best.evidencePath).filter((p): p is string => !!p)
  if (evidencePaths.length) {
    const signed = await Promise.all(
      evidencePaths.map((path) => admin.storage.from('evidence').createSignedUrl(path, 3600)),
    )
    signed.forEach((res, i) => {
      if (res.data?.signedUrl) evidenceUrls[evidencePaths[i]] = res.data.signedUrl
    })
  }

  return (
    <main className="grain-overlay" style={{ minHeight: '100vh', position: 'relative' }}>
      <div className={c('wrap')}>
        {p.coverUrl && (
          <div className={c('cover')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.coverUrl} alt="" className={c('coverImg')} />
          </div>
        )}

        <div className={c('headerRow') + (p.coverUrl ? ' ' + c('headerRowOverCover') : '')}>
          <div className={c('avatar')}>
            {p.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.photoUrl} alt="" className={c('avatarImg')} />
            ) : (
              initials(p.name)
            )}
          </div>
          <div className={c('identity')}>
            <h1 className={c('name')}>{p.name || 'Athlete'}</h1>
            {p.username && <div className={c('username')}>@{p.username}</div>}
            {p.headline && <div className={c('headline')}>{p.headline}</div>}
            <div className={c('metaRow')}>
              {p.location && <span>{p.location}</span>}
              {p.schoolOrGym && <span>{p.schoolOrGym}</span>}
              {p.experienceLevel && <span>{p.experienceLevel}</span>}
              {p.weightClass && <span>{p.weightClass}</span>}
              {p.ageDivision && <span>{p.ageDivision}</span>}
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
        </div>

        <ViewTabs
          profile={
            <>
              {(p.personalStatement || p.bio) && (
                <div className={c('section')}>
                  {p.personalStatement && <p className={c('statement')}>&ldquo;{p.personalStatement}&rdquo;</p>}
                  {p.bio && <p className={c('bio')}>{p.bio}</p>}
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
                {!featured.length && <p className={c('empty')}>No featured lifts yet.</p>}
                {!!featured.length && (
                  <div className={c('prGrid')}>
                    {featured.map(({ lift, best }) => {
                      const evidenceRec = best.evidencePath ? evidence.find((e) => e.storagePath === best.evidencePath) : undefined
                      const evidenceUrl = best.evidencePath ? evidenceUrls[best.evidencePath] : undefined
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
                          {!!best.witnessCount && (
                            <div className={c('hint')}>
                              Witnessed by {best.witnessCount} {best.witnessCount === 1 ? 'person' : 'people'}
                            </div>
                          )}
                          {evidenceUrl &&
                            (evidenceRec?.mimeType.startsWith('video/') ? (
                              <video src={evidenceUrl} controls className={c('evidenceThumb')} />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={evidenceUrl} alt="" className={c('evidenceThumb')} />
                            ))}
                          <div className={c('witnessRow')}>
                            <WitnessForm
                              userId={userId}
                              token={searchParams.t}
                              liftId={lift.id}
                              date={best.date}
                              weightKg={best.w}
                              reps={best.r}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className={c('section')}>
                <div className={c('sectionHead')}>Timeline</div>
                {!timeline.length && <p className={c('empty')}>No milestones logged yet.</p>}
                {!!timeline.length && (
                  <div className={c('achList')}>
                    {timeline.map((ev, i) => (
                      <div key={i} className={c('achRow')}>
                        <span>
                          New PR — {ev.liftName}: {wDisp(ev.w, unit)} {unit} × {ev.r}
                          <span className={c('badge')}>{RECORD_STATUS_LABEL[ev.recordStatus]}</span>
                          {(() => {
                            // The owner can now Ask AI about any self-reported compound-lift entry,
                            // not just ones the outlier heuristic flagged — so a cached review can
                            // exist here even when ev.outlier is false. Mirror ProfilePage.tsx's
                            // rendering exactly (read-only: no button, this page never triggers a call).
                            const review = aiReviews.find((r) => r.id === reviewKey(ev.liftId, ev.date, ev.w, ev.r))
                            if (ev.outlier && !review) {
                              return (
                                <span className={c('outlierFlag')} title="Unusually large jump from the previous best — self-reported, unverified.">
                                  ⚠ large jump
                                </span>
                              )
                            }
                            if (review) {
                              return (
                                <span
                                  className={review.verdict === 'plausible' ? `${c('outlierFlag')} ${c('aiVerdictOk')}` : c('outlierFlag')}
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
                              )
                            }
                            return null
                          })()}
                          {!!ev.witnessCount && <span className={c('witnessChip')}>{ev.witnessCount} witness{ev.witnessCount === 1 ? '' : 'es'}</span>}
                        </span>
                        <span className={c('achDate')}>{dateLabel(ev.date)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <p className={c('footnote')}>Evidence and endorsements add context — they’re never official certification.</p>
            </>
          }
          dashboard={
            <div className={c('section')}>
              <div className={c('sectionHead')}>Compound lift progress</div>
              <DashboardView series={series} unit={unit} />
            </div>
          }
        />
      </div>
    </main>
  )
}
