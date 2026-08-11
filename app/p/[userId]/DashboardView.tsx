import { dateLabel, wDisp, type Lift } from '@/lib/tiles/profileDerive'
import styles from '../../profile/profile.module.css'

function c(name: keyof typeof styles): string {
  return styles[name]
}

/**
 * The dashboard-style progress view — a public equivalent of what Velocity
 * (public/tiles/velocity.html) shows the owner: one line per Tier-1 compound
 * lift, weight over time. Velocity itself can't be embedded here (it's a
 * sealed tile that expects the window.Vitality bridge, which no anonymous
 * visitor has) so this is a from-scratch, read-only re-derivation of the
 * same "compound progress" idea from the same combinedHistory data the
 * Profile tab already computes — no separate data source, no drift risk.
 */

interface LiftSeries {
  lift: Lift
  points: { date: string; w: number }[]
}

const CHART_W = 240
const CHART_H = 64
const PAD = 6

function sparkline(points: { date: string; w: number }[]): string {
  if (points.length < 2) return ''
  const ws = points.map((p) => p.w)
  const min = Math.min(...ws)
  const max = Math.max(...ws)
  const span = max - min || 1
  const stepX = (CHART_W - PAD * 2) / (points.length - 1)
  return points
    .map((p, i) => {
      const x = PAD + i * stepX
      const y = PAD + (1 - (p.w - min) / span) * (CHART_H - PAD * 2)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function lastPoint(points: { date: string; w: number }[]): { x: number; y: number } | null {
  if (!points.length) return null
  const ws = points.map((p) => p.w)
  const min = Math.min(...ws)
  const max = Math.max(...ws)
  const span = max - min || 1
  const stepX = points.length > 1 ? (CHART_W - PAD * 2) / (points.length - 1) : 0
  const i = points.length - 1
  const x = PAD + i * stepX
  const y = PAD + (1 - (points[i].w - min) / span) * (CHART_H - PAD * 2)
  return { x, y }
}

export default function DashboardView({ series, unit }: { series: LiftSeries[]; unit: 'kg' | 'lb' }) {
  const withHistory = series.filter((s) => s.points.length > 0)

  if (!withHistory.length) {
    return <p className={c('empty')}>No compound-lift history logged yet.</p>
  }

  return (
    <div className={c('dashGrid')}>
      {withHistory.map(({ lift, points }) => {
        const latest = points[points.length - 1]
        const first = points[0]
        const path = sparkline(points)
        const dot = lastPoint(points)
        const delta = points.length > 1 ? latest.w - first.w : 0
        return (
          <div key={lift.id} className={c('prCard')}>
            <div className={c('prName')}>{lift.name}</div>
            <div className={c('prVal')}>
              {wDisp(latest.w, unit)} {unit}
              {lift.perHand ? '/ea' : ''}
            </div>
            <div className={c('prSub')}>
              {points.length} logged session{points.length === 1 ? '' : 's'} · {dateLabel(latest.date)}
            </div>
            {path && (
              <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className={c('dashChart')} preserveAspectRatio="none">
                <path d={path} fill="none" stroke="var(--mint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {dot && <circle cx={dot.x} cy={dot.y} r="3" fill="var(--mint)" />}
              </svg>
            )}
            {points.length > 1 && (
              <div className={c('prSub')}>
                {delta > 0 ? '+' : ''}
                {wDisp(delta, unit)} {unit} since {dateLabel(first.date)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
